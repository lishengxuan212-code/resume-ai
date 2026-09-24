import { AppError } from './errors.js';

const PRIVACY_VERSION = '2026-09-25';

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
  return `${config.cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function createAccessControl(config, store) {
  if (!config?.enabled) {
    const passthrough = (request, response, next) => { void response; request.access = null; next(); };
    return {
      enabled: false,
      status(request, response) { void request; response.setHeader('Cache-Control', 'no-store'); response.json({ authorized: true, accessRequired: false, privacyAccepted: true, csrfToken: '', optimizationPaused: false, quota: null }); },
      redeem(request, response) { void request; response.status(404).json({ error: { code: 'access_disabled', message: '当前没有启用邀请码。' } }); },
      logout(request, response) { void request; response.status(204).end(); },
      requireAccess: passthrough,
      requireCsrf: passthrough,
      requireConsent: passthrough,
      acceptConsent(request, response) { void request; response.status(204).end(); },
      track() { return passthrough; },
      consume() { return passthrough; },
      beforeExternalAttempt: async () => null,
      afterExternalAttempt: async () => {},
    };
  }

  function sessionFor(request) {
    return store.authenticate(parseCookies(request.headers.cookie)[config.cookieName]);
  }

  function requireAccess(request, response, next) {
    const session = sessionFor(request);
    if (!session) return next(new AppError(401, 'access_required', '请输入有效邀请码后继续。'));
    request.access = session;
    next();
  }

  function requireCsrf(request, response, next) {
    void response;
    if (!store.verifyCsrf(request.access, request.get('X-CSRF-Token'))) {
      return next(new AppError(403, 'csrf_invalid', '当前页面已失效，请刷新后重试。'));
    }
    next();
  }

  function requireConsent(request, response, next) {
    void response;
    if (!request.access.consented_at || request.access.consent_version !== PRIVACY_VERSION) {
      return next(new AppError(403, 'privacy_consent_required', '请先阅读并同意隐私说明。'));
    }
    next();
  }

  return {
    enabled: true,
    status(request, response) {
      const session = sessionFor(request);
      response.setHeader('Cache-Control', 'no-store');
      response.json(session
        ? { authorized: true, accessRequired: true, csrfToken: session.csrf_token, expiresAt: session.expires_at, privacyAccepted: Boolean(session.consented_at && session.consent_version === PRIVACY_VERSION), ...store.getPublicAccessState(session) }
        : { authorized: false, accessRequired: true });
    },
    redeem(request, response, next) {
      try {
        const result = store.redeem(request.body?.code);
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Set-Cookie', cookie(config, result.token, Math.floor(config.sessionTtlMs / 1000)));
        response.json({ authorized: true, accessRequired: true, csrfToken: result.csrfToken, expiresAt: result.expiresAt, privacyAccepted: false, ...store.getPublicAccessState(store.authenticate(result.token)) });
      } catch (error) { next(error); }
    },
    logout(request, response, next) {
      try {
        if (request.access) store.revokeSession(request.access.session_id);
        response.setHeader('Set-Cookie', cookie(config, '', 0));
        response.status(204).end();
      } catch (error) { next(error); }
    },
    requireAccess,
    requireCsrf,
    requireConsent,
    acceptConsent(request, response, next) {
      try {
        store.recordConsent(request.access.session_id, PRIVACY_VERSION);
        response.status(204).end();
      } catch (error) { next(error); }
    },
    track(operation) {
      return (request, response, next) => {
        let context;
        let settled = false;
        try { context = store.beginRequestEvent(request.access, request.requestId, operation); }
        catch (error) { return next(error); }
        const finish = () => {
          if (settled) return;
          settled = true;
          try { store.finishRequestEvent(context, { statusCode: response.statusCode, errorCode: request.errorCode }); }
          catch { console.error(JSON.stringify({ event: 'request_event_finish_failed', operation })); }
        };
        response.once('finish', finish);
        response.once('close', finish);
        next();
      };
    },
    consume(route) {
      return (request, response, next) => {
        try {
          store.consumeRoute(request.access, route);
          let settled = false;
          const finish = failed => {
            if (settled) return;
            settled = true;
            if (failed) {
              try { store.refundRoute(request.access, route); }
              catch { console.error(JSON.stringify({ event: 'quota_refund_failed', route })); }
            }
          };
          response.once('finish', () => finish(response.statusCode >= 500));
          response.once('close', () => finish(!response.writableEnded || response.statusCode >= 500));
          next();
        }
        catch (error) { next(error); }
      };
    },
    beforeExternalAttempt: async (session, details) => store.recordExternalAttempt(session, details),
    afterExternalAttempt: async (session, result, context) => store.finishExternalAttempt(session, result, context),
  };
}
