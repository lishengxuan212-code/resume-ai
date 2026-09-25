import { AppError } from './errors.js';

const LOCAL_CSRF_TOKEN = 'local-operations-console';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    try { return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]; }
    catch { return ['', '']; }
  }).filter(([key]) => key));
}

function cookie(config, token, maxAgeSeconds) {
  const secure = config.production ? '; Secure' : '';
  return `${config.adminCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function loopback(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip);
}

function localHost(request) {
  const rawHost = request.get('X-Forwarded-Host')?.split(',')[0] || request.get('Host') || '';
  const normalized = rawHost.trim().toLowerCase();
  const host = normalized.startsWith('[')
    ? normalized.slice(1, normalized.indexOf(']'))
    : normalized.split(':')[0];
  return ['localhost', '127.0.0.1', '::1', 'terminal.local'].includes(host);
}

function integer(value, fallback, minimum, maximum, message) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new AppError(400, 'admin_input_invalid', message);
  return number;
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createAdminControl(config, store) {
  if (!config?.enabled || !store) {
    const unavailable = (request, response) => { void request; response.status(404).json({ error: { code: 'admin_unavailable', message: '运营控制台尚未启用。' } }); };
    return {
      status: unavailable, setup: unavailable, login: unavailable, logout: unavailable,
      requireAdmin: unavailable, requireCsrf: unavailable, overview: unavailable, invites: unavailable,
      createInvites: unavailable, updateInvite: unavailable, resetInvite: unavailable, calls: unavailable,
      settings: unavailable, updateSettings: unavailable, audit: unavailable, exportData: unavailable,
    };
  }

  function sessionFor(request) {
    return store.authenticateAdmin(parseCookies(request.headers.cookie)[config.adminCookieName]);
  }

  function localAccess(request) {
    return config.adminLocalBypass === true && !config.production && loopback(request) && localHost(request);
  }

  function signedIn(response, result) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', cookie(config, result.token, Math.floor(config.adminSessionTtlMs / 1000)));
    response.json({ authenticated: true, csrfToken: result.csrfToken, expiresAt: result.expiresAt });
  }

  function requireAdmin(request, response, next) {
    if (localAccess(request)) {
      request.admin = { admin_user_id: null, username: 'local', csrf_token: LOCAL_CSRF_TOKEN, local: true };
      return next();
    }
    const session = sessionFor(request);
    if (!session) return next(new AppError(401, 'admin_required', '请先登录运营控制台。'));
    request.admin = session;
    next();
  }

  function requireCsrf(request, response, next) {
    void response;
    if (request.admin?.local && request.get('X-CSRF-Token') === LOCAL_CSRF_TOKEN) return next();
    if (!store.verifyAdminCsrf(request.admin, request.get('X-CSRF-Token'))) {
      return next(new AppError(403, 'admin_csrf_invalid', '当前管理页面已失效，请刷新后重试。'));
    }
    next();
  }

  return {
    status(request, response) {
      if (localAccess(request)) {
        response.setHeader('Cache-Control', 'no-store');
        return response.json({ authenticated: true, setupRequired: false, localMode: true, csrfToken: LOCAL_CSRF_TOKEN, expiresAt: null });
      }
      const session = sessionFor(request);
      response.setHeader('Cache-Control', 'no-store');
      response.json(session
        ? { authenticated: true, setupRequired: false, csrfToken: session.csrf_token, expiresAt: session.expires_at }
        : {
          authenticated: false,
          setupRequired: !store.hasAdmin() && !config.production && loopback(request),
          minimumPasswordLength: config.adminPasswordMinLength ?? 12,
          loginHint: config.adminLoginHint || '',
        });
    },
    setup(request, response, next) {
      try {
        if (config.production || !loopback(request)) throw new AppError(403, 'admin_setup_forbidden', '请通过服务器命令创建管理员。');
        store.setupAdmin(request.body?.password);
        signedIn(response, store.loginAdmin(request.body?.password));
      } catch (error) { next(error); }
    },
    login(request, response, next) {
      try { signedIn(response, store.loginAdmin(request.body?.password)); }
      catch (error) { next(error); }
    },
    logout(request, response, next) {
      try {
        if (request.admin) store.revokeAdminSession(request.admin.session_id);
        response.setHeader('Set-Cookie', cookie(config, '', 0));
        response.status(204).end();
      } catch (error) { next(error); }
    },
    requireAdmin,
    requireCsrf,
    overview(request, response, next) {
      try { response.json(store.getOverview(integer(request.query.days, 7, 1, 30, '统计周期无效。'))); }
      catch (error) { next(error); }
    },
    invites(request, response, next) {
      try {
        const settings = store.getRuntimeSettings();
        response.json({
          invites: store.listInvites(),
          defaults: {
            dailyFlowLimit: settings.defaultDailyFlowLimit,
            totalFlowLimit: settings.defaultTotalFlowLimit,
          },
        });
      }
      catch (error) { next(error); }
    },
    createInvites(request, response, next) {
      try {
        const count = integer(request.body?.count, 1, 1, 50, '一次最多创建 50 个邀请码。');
        const expiresInDays = integer(request.body?.expiresInDays, 30, 1, 365, '邀请码有效期无效。');
        const dailyFlowLimit = integer(request.body?.dailyFlowLimit, undefined, 1, 100, '每日优化次数无效。');
        const totalFlowLimit = integer(request.body?.totalFlowLimit, undefined, 1, 10000, '总优化次数无效。');
        const tester = request.body?.tester === true;
        const label = typeof request.body?.label === 'string' ? request.body.label : '';
        const invites = Array.from({ length: count }, () => store.createInvite({ expiresInDays, dailyFlowLimit, totalFlowLimit, tester, label }));
        store.recordAudit(request.admin.admin_user_id, 'invite.create_batch', 'invite', null, null, {
          count, expiresInDays, dailyFlowLimit: invites[0]?.dailyFlowLimit, totalFlowLimit: invites[0]?.totalFlowLimit, tester, label: label.trim().slice(0, 40),
        });
        response.status(201).json({ invites });
      } catch (error) { next(error); }
    },
    updateInvite(request, response, next) {
      try { response.json({ invite: store.updateInvite(request.params.id, request.body || {}, request.admin.admin_user_id) }); }
      catch (error) { next(error); }
    },
    resetInvite(request, response, next) {
      try { store.resetInviteToday(request.params.id, request.admin.admin_user_id); response.status(204).end(); }
      catch (error) { next(error); }
    },
    calls(request, response, next) {
      try { response.json({ calls: store.listCalls({ limit: request.query.limit, operation: request.query.operation, status: request.query.status }) }); }
      catch (error) { next(error); }
    },
    settings(request, response, next) {
      try { response.json({ settings: store.getRuntimeSettings() }); }
      catch (error) { next(error); }
    },
    updateSettings(request, response, next) {
      try { response.json({ settings: store.updateRuntimeSettings(request.body || {}, request.admin.admin_user_id) }); }
      catch (error) { next(error); }
    },
    audit(request, response, next) {
      try { response.json({ events: store.listAudit(integer(request.query.limit, 100, 1, 200, '记录数量无效。')) }); }
      catch (error) { next(error); }
    },
    exportData(request, response, next) {
      try {
        const result = store.exportOperationalData(request.query.type);
        const csv = [result.columns, ...result.rows].map(row => row.map(csvCell).join(',')).join('\r\n');
        response.setHeader('Content-Type', 'text/csv; charset=utf-8');
        response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        response.send(`\uFEFF${csv}`);
      } catch (error) { next(error); }
    },
  };
}
