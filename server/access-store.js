import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AppError } from './errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_RETENTION_MS = 30 * DAY_MS;

function chinaDay(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function digest(secret, value) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function makeInviteCode() {
  const body = randomBytes(9).toString('base64url').toUpperCase().replaceAll('_', 'X').replaceAll('-', 'Y').slice(0, 12);
  return `OFFER-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

function passwordDigest(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function passwordMatches(password, stored) {
  const [algorithm, salt, expected] = String(stored || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  return safeEqual(scryptSync(password, salt, 32).toString('hex'), expected);
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128 && Buffer.byteLength(value, 'utf8') <= 256;
}

function integerSetting(value, minimum, maximum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new AppError(400, 'admin_setting_invalid', `${name} 的设置值无效。`);
  }
  return number;
}

function booleanSetting(value, name) {
  if (value !== true && value !== false) throw new AppError(400, 'admin_setting_invalid', `${name} 的设置值无效。`);
  return value;
}

export class AccessStore {
  constructor(config, { logger = console } = {}) {
    this.config = config;
    this.logger = logger;
    const directory = path.dirname(config.dbPath);
    if (config.dbPath !== ':memory:') mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(config.dbPath, { timeout: 5000 });
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id TEXT PRIMARY KEY,
        code_digest TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
        expires_at INTEGER,
        daily_flow_limit INTEGER NOT NULL,
        total_flow_limit INTEGER NOT NULL,
        redeemed_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS access_sessions (
        id TEXT PRIMARY KEY,
        token_digest TEXT NOT NULL UNIQUE,
        invite_id TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY (invite_id) REFERENCES invite_codes(id)
      );
      CREATE TABLE IF NOT EXISTS usage_daily (
        invite_id TEXT NOT NULL,
        day TEXT NOT NULL,
        extract_count INTEGER NOT NULL DEFAULT 0,
        diagnose_count INTEGER NOT NULL DEFAULT 0,
        optimize_count INTEGER NOT NULL DEFAULT 0,
        export_count INTEGER NOT NULL DEFAULT 0,
        external_attempts INTEGER NOT NULL DEFAULT 0,
        estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (invite_id, day),
        FOREIGN KEY (invite_id) REFERENCES invite_codes(id)
      );
      CREATE TABLE IF NOT EXISTS spend_daily (
        day TEXT PRIMARY KEY,
        external_attempts INTEGER NOT NULL DEFAULT 0,
        estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
        alert_emitted INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS runtime_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL,
        token_digest TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
      );
      CREATE TABLE IF NOT EXISTS request_events (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        invite_id TEXT,
        day TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        status_code INTEGER,
        error_code TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration_ms INTEGER,
        FOREIGN KEY (invite_id) REFERENCES invite_codes(id)
      );
      CREATE TABLE IF NOT EXISTS provider_calls (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        invite_id TEXT,
        day TEXT NOT NULL,
        task TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        error_reason TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration_ms INTEGER,
        FOREIGN KEY (invite_id) REFERENCES invite_codes(id)
      );
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        before_json TEXT,
        after_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
      );
      CREATE INDEX IF NOT EXISTS access_sessions_invite_id ON access_sessions(invite_id);
      CREATE INDEX IF NOT EXISTS access_sessions_expires_at ON access_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS admin_sessions_expires_at ON admin_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS request_events_day ON request_events(day, started_at DESC);
      CREATE INDEX IF NOT EXISTS provider_calls_day ON provider_calls(day, started_at DESC);
      CREATE INDEX IF NOT EXISTS provider_calls_request_id ON provider_calls(request_id);
      CREATE INDEX IF NOT EXISTS admin_audit_created_at ON admin_audit_log(created_at DESC);
    `);
    const inviteColumns = new Set(this.db.prepare('PRAGMA table_info(invite_codes)').all().map(column => column.name));
    if (!inviteColumns.has('label')) this.db.exec('ALTER TABLE invite_codes ADD COLUMN label TEXT');
    if (!inviteColumns.has('tester')) this.db.exec('ALTER TABLE invite_codes ADD COLUMN tester INTEGER NOT NULL DEFAULT 0');
    const sessionColumns = new Set(this.db.prepare('PRAGMA table_info(access_sessions)').all().map(column => column.name));
    if (!sessionColumns.has('consented_at')) this.db.exec('ALTER TABLE access_sessions ADD COLUMN consented_at INTEGER');
    if (!sessionColumns.has('consent_version')) this.db.exec('ALTER TABLE access_sessions ADD COLUMN consent_version TEXT');
    const now = Date.now();
    const defaults = {
      default_daily_flow_limit: config.defaultDailyFlowLimit,
      default_total_flow_limit: config.defaultTotalFlowLimit,
      daily_external_alert_yuan: config.dailyAlertMicros / 1_000_000,
      daily_external_budget_yuan: config.dailyBudgetMicros / 1_000_000,
      optimization_paused: false,
    };
    const seed = this.db.prepare('INSERT OR IGNORE INTO runtime_settings (key, value, updated_at) VALUES (?, ?, ?)');
    for (const [key, value] of Object.entries(defaults)) seed.run(key, String(value), now);
    this.db.prepare('DELETE FROM request_events WHERE completed_at IS NOT NULL AND completed_at < ?').run(now - EVENT_RETENTION_MS);
    this.db.prepare('DELETE FROM provider_calls WHERE completed_at IS NOT NULL AND completed_at < ?').run(now - EVENT_RETENTION_MS);
  }

  createInvite({ expiresInDays = 30, dailyFlowLimit, totalFlowLimit, tester = false, label = '' } = {}) {
    const code = makeInviteCode();
    const id = randomUUID();
    const now = Date.now();
    const expiresAt = expiresInDays ? now + expiresInDays * DAY_MS : null;
    const runtime = this.getRuntimeSettings();
    const daily = dailyFlowLimit ?? runtime.defaultDailyFlowLimit;
    const total = totalFlowLimit ?? runtime.defaultTotalFlowLimit;
    const normalizedLabel = typeof label === 'string' ? label.trim().slice(0, 40) : '';
    this.db.prepare(`
      INSERT INTO invite_codes (id, code_digest, expires_at, daily_flow_limit, total_flow_limit, tester, label, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      digest(this.config.invitePepper, code),
      expiresAt,
      daily,
      total,
      tester ? 1 : 0,
      normalizedLabel || null,
      now,
    );
    return { id, code, expiresAt, dailyFlowLimit: daily, totalFlowLimit: total, tester: Boolean(tester), label: normalizedLabel };
  }

  redeem(rawCode) {
    const code = normalizeCode(rawCode);
    if (!/^OFFER-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
      throw new AppError(400, 'invite_invalid', '邀请码格式不正确。');
    }
    const now = Date.now();
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const invite = this.db.prepare('SELECT * FROM invite_codes WHERE code_digest = ?').get(digest(this.config.invitePepper, code));
      if (!invite || invite.status !== 'active' || (invite.expires_at && invite.expires_at <= now)) {
        throw new AppError(403, 'invite_invalid', '邀请码无效或已过期。');
      }
      if (invite.redeemed_at) throw new AppError(409, 'invite_used', '该邀请码已经使用。');
      const sessionId = randomUUID();
      this.db.prepare('UPDATE invite_codes SET redeemed_at = ? WHERE id = ?').run(now, invite.id);
      this.db.prepare(`
        INSERT INTO access_sessions (id, token_digest, invite_id, csrf_token, created_at, expires_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, digest(this.config.sessionSecret, token), invite.id, csrfToken, now, now + this.config.sessionTtlMs, now);
      this.db.exec('COMMIT');
      return { token, csrfToken, expiresAt: now + this.config.sessionTtlMs };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  authenticate(token) {
    if (!token) return null;
    const now = Date.now();
    const row = this.db.prepare(`
      SELECT s.id AS session_id, s.invite_id, s.csrf_token, s.expires_at, s.last_seen_at,
             s.consented_at, s.consent_version,
             i.daily_flow_limit, i.total_flow_limit, i.tester
      FROM access_sessions s
      JOIN invite_codes i ON i.id = s.invite_id
      WHERE s.token_digest = ? AND s.revoked_at IS NULL AND s.expires_at > ?
        AND i.status = 'active'
    `).get(digest(this.config.sessionSecret, token), now);
    if (!row) return null;
    if (now - row.last_seen_at > 5 * 60 * 1000) {
      this.db.prepare('UPDATE access_sessions SET last_seen_at = ? WHERE id = ?').run(now, row.session_id);
    }
    return row;
  }

  verifyCsrf(session, token) {
    return Boolean(token) && safeEqual(session.csrf_token, token);
  }

  revokeSession(sessionId) {
    this.db.prepare('UPDATE access_sessions SET revoked_at = ? WHERE id = ?').run(Date.now(), sessionId);
  }

  recordConsent(sessionId, version) {
    this.db.prepare('UPDATE access_sessions SET consented_at = ?, consent_version = ? WHERE id = ?').run(Date.now(), version, sessionId);
  }

  revokeInvite(rawCode) {
    const code = normalizeCode(rawCode);
    const codeDigest = digest(this.config.invitePepper, code);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const invite = this.db.prepare('SELECT id FROM invite_codes WHERE code_digest = ?').get(codeDigest);
      if (!invite) throw new AppError(404, 'invite_not_found', '未找到该邀请码。');
      this.db.prepare("UPDATE invite_codes SET status = 'revoked' WHERE id = ?").run(invite.id);
      this.db.prepare('UPDATE access_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE invite_id = ?').run(Date.now(), invite.id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  consumeRoute(session, route) {
    const column = { extract: 'extract_count', diagnose: 'diagnose_count', optimize: 'optimize_count', export: 'export_count' }[route];
    if (!column) throw new AppError(500, 'usage_route_invalid', '访问控制配置无效。');
    if ((route === 'diagnose' || route === 'optimize') && this.getRuntimeSettings().optimizationPaused) {
      throw new AppError(503, 'optimization_paused', '当前暂时停止新的优化任务，请稍后再试。');
    }
    const day = chinaDay();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR IGNORE INTO usage_daily (invite_id, day) VALUES (?, ?)').run(session.invite_id, day);
      const current = this.db.prepare('SELECT * FROM usage_daily WHERE invite_id = ? AND day = ?').get(session.invite_id, day);
      const total = this.db.prepare('SELECT COALESCE(SUM(optimize_count), 0) AS count FROM usage_daily WHERE invite_id = ?').get(session.invite_id).count;
      const dailyLimit = route === 'optimize' ? session.daily_flow_limit : this.config.routeLimits[route];
      const exhausted = this.config.enforceInviteQuotas && !session.tester && (current[column] >= dailyLimit || (route === 'optimize' && total >= session.total_flow_limit));
      if (exhausted) {
        throw new AppError(429, 'invite_quota_exceeded', route === 'optimize' ? '今日可用的完整优化次数已用完。' : '今日该操作次数已用完，请明天再试。');
      }
      this.db.prepare(`UPDATE usage_daily SET ${column} = ${column} + 1 WHERE invite_id = ? AND day = ?`).run(session.invite_id, day);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  refundRoute(session, route) {
    const column = { extract: 'extract_count', diagnose: 'diagnose_count', optimize: 'optimize_count', export: 'export_count' }[route];
    if (!column || !session) return;
    this.db.prepare(`
      UPDATE usage_daily SET ${column} = MAX(${column} - 1, 0)
      WHERE invite_id = ? AND day = ?
    `).run(session.invite_id, chinaDay());
  }

  recordExternalAttempt(session, details = {}) {
    if (!session) return;
    const day = chinaDay();
    const cost = this.config.requestCostMicros;
    const runtime = this.getRuntimeSettings();
    const budgetMicros = runtime.dailyExternalBudgetYuan * 1_000_000;
    const alertMicros = runtime.dailyExternalAlertYuan * 1_000_000;
    const eventId = randomUUID();
    const startedAt = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR IGNORE INTO usage_daily (invite_id, day) VALUES (?, ?)').run(session.invite_id, day);
      this.db.prepare('INSERT OR IGNORE INTO spend_daily (day) VALUES (?)').run(day);
      const spend = this.db.prepare('SELECT * FROM spend_daily WHERE day = ?').get(day);
      if (spend.estimated_cost_micros + cost > budgetMicros) {
        throw new AppError(503, 'daily_budget_exceeded', '今日体验额度已经用完，请明天再试。');
      }
      const nextCost = spend.estimated_cost_micros + cost;
      this.db.prepare(`
        UPDATE usage_daily SET external_attempts = external_attempts + 1,
          estimated_cost_micros = estimated_cost_micros + ? WHERE invite_id = ? AND day = ?
      `).run(cost, session.invite_id, day);
      this.db.prepare(`
        UPDATE spend_daily SET external_attempts = external_attempts + 1,
          estimated_cost_micros = ?, alert_emitted = CASE WHEN ? >= ? THEN 1 ELSE alert_emitted END
        WHERE day = ?
      `).run(nextCost, nextCost, alertMicros, day);
      this.db.prepare(`
        INSERT INTO provider_calls (id, request_id, invite_id, day, task, provider, model, attempt, estimated_cost_micros, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(eventId, details.requestId || null, session.invite_id, day, details.task || 'unknown', details.provider || 'unknown', details.model || null, details.attempt || 1, cost, startedAt);
      this.db.exec('COMMIT');
      if (!spend.alert_emitted && nextCost >= alertMicros) {
        this.logger.warn(JSON.stringify({ event: 'external_budget_alert', day, estimatedCostYuan: nextCost / 1_000_000 }));
      }
      return { eventId, startedAt, costMicros: cost };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  finishExternalAttempt(session, result = {}, context) {
    if (!session || !context?.eventId) return;
    const now = Date.now();
    const usage = result.usage || {};
    const refunded = result.reason === 'network_denied';
    if (refunded) this.refundExternalAttempt(session);
    this.db.prepare(`
      UPDATE provider_calls
      SET status = ?, error_reason = ?, input_tokens = ?, output_tokens = ?, total_tokens = ?,
          estimated_cost_micros = ?, completed_at = ?, duration_ms = ?
      WHERE id = ?
    `).run(
      result.success ? 'success' : 'failed',
      result.success ? null : String(result.reason || 'unknown').slice(0, 64),
      Math.max(0, Number(usage.inputTokens) || 0),
      Math.max(0, Number(usage.outputTokens) || 0),
      Math.max(0, Number(usage.totalTokens) || 0),
      refunded ? 0 : context.costMicros,
      now,
      Math.max(0, now - context.startedAt),
      context.eventId,
    );
  }

  refundExternalAttempt(session) {
    if (!session) return;
    const day = chinaDay();
    const cost = this.config.requestCostMicros;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`
        UPDATE usage_daily SET external_attempts = MAX(external_attempts - 1, 0),
          estimated_cost_micros = MAX(estimated_cost_micros - ?, 0)
        WHERE invite_id = ? AND day = ?
      `).run(cost, session.invite_id, day);
      this.db.prepare(`
        UPDATE spend_daily SET external_attempts = MAX(external_attempts - 1, 0),
          estimated_cost_micros = MAX(estimated_cost_micros - ?, 0)
        WHERE day = ?
      `).run(cost, day);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getRuntimeSettings() {
    const rows = Object.fromEntries(this.db.prepare('SELECT key, value FROM runtime_settings').all().map(row => [row.key, row.value]));
    return {
      defaultDailyFlowLimit: Number(rows.default_daily_flow_limit ?? this.config.defaultDailyFlowLimit),
      defaultTotalFlowLimit: Number(rows.default_total_flow_limit ?? this.config.defaultTotalFlowLimit),
      dailyExternalAlertYuan: Number(rows.daily_external_alert_yuan ?? this.config.dailyAlertMicros / 1_000_000),
      dailyExternalBudgetYuan: Number(rows.daily_external_budget_yuan ?? this.config.dailyBudgetMicros / 1_000_000),
      optimizationPaused: rows.optimization_paused === 'true',
      inviteQuotasEnforced: Boolean(this.config.enforceInviteQuotas),
    };
  }

  updateRuntimeSettings(patch, adminUserId) {
    const current = this.getRuntimeSettings();
    const next = {
      defaultDailyFlowLimit: patch.defaultDailyFlowLimit === undefined ? current.defaultDailyFlowLimit : integerSetting(patch.defaultDailyFlowLimit, 1, 100, '每日优化次数'),
      defaultTotalFlowLimit: patch.defaultTotalFlowLimit === undefined ? current.defaultTotalFlowLimit : integerSetting(patch.defaultTotalFlowLimit, 1, 10000, '总优化次数'),
      dailyExternalAlertYuan: patch.dailyExternalAlertYuan === undefined ? current.dailyExternalAlertYuan : integerSetting(patch.dailyExternalAlertYuan, 1, 10000, '费用提醒金额'),
      dailyExternalBudgetYuan: patch.dailyExternalBudgetYuan === undefined ? current.dailyExternalBudgetYuan : integerSetting(patch.dailyExternalBudgetYuan, 1, 10000, '每日费用上限'),
      optimizationPaused: patch.optimizationPaused === undefined ? current.optimizationPaused : booleanSetting(patch.optimizationPaused, '暂停优化'),
    };
    if (next.dailyExternalAlertYuan > next.dailyExternalBudgetYuan) {
      throw new AppError(400, 'admin_setting_invalid', '费用提醒金额不能高于每日费用上限。');
    }
    const now = Date.now();
    const entries = {
      default_daily_flow_limit: next.defaultDailyFlowLimit,
      default_total_flow_limit: next.defaultTotalFlowLimit,
      daily_external_alert_yuan: next.dailyExternalAlertYuan,
      daily_external_budget_yuan: next.dailyExternalBudgetYuan,
      optimization_paused: next.optimizationPaused,
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const update = this.db.prepare(`
        INSERT INTO runtime_settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      for (const [key, value] of Object.entries(entries)) update.run(key, String(value), now);
      this.recordAudit(adminUserId, 'settings.update', 'runtime_settings', 'global', current, next);
      this.db.exec('COMMIT');
      return { ...next, inviteQuotasEnforced: Boolean(this.config.enforceInviteQuotas) };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  recordAudit(adminUserId, action, targetType, targetId, before, after) {
    this.db.prepare(`
      INSERT INTO admin_audit_log (id, admin_user_id, action, target_type, target_id, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), adminUserId || null, action, targetType || null, targetId || null, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), Date.now());
  }

  hasAdmin() {
    return this.db.prepare('SELECT 1 AS found FROM admin_users LIMIT 1').get()?.found === 1;
  }

  setupAdmin(password) {
    if (!validPassword(password)) throw new AppError(400, 'admin_password_invalid', '管理密码至少 12 个字符，且不能超过 128 个字符。');
    if (this.hasAdmin()) throw new AppError(409, 'admin_exists', '管理员已经创建。');
    const now = Date.now();
    const id = randomUUID();
    this.db.prepare('INSERT INTO admin_users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'admin', passwordDigest(password), now, now);
    this.recordAudit(id, 'admin.setup', 'admin_user', id, null, { username: 'admin' });
    return id;
  }

  resetAdminPassword(password) {
    if (!validPassword(password)) throw new AppError(400, 'admin_password_invalid', '管理密码至少 12 个字符，且不能超过 128 个字符。');
    const admin = this.db.prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
    if (!admin) return this.setupAdmin(password);
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordDigest(password), now, admin.id);
      this.db.prepare('UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE admin_user_id = ?').run(now, admin.id);
      this.recordAudit(admin.id, 'admin.password_reset', 'admin_user', admin.id, null, { sessionsRevoked: true });
      this.db.exec('COMMIT');
      return admin.id;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  loginAdmin(password) {
    const admin = this.db.prepare('SELECT * FROM admin_users WHERE username = ?').get('admin');
    const fallback = 'scrypt$00000000000000000000000000000000$e1b0c20a6e8f169e10c2dba3e94c02de8c68d6c758829c919986c4f53b704892';
    if (!passwordMatches(typeof password === 'string' ? password : '', admin?.password_hash || fallback) || !admin) {
      throw new AppError(401, 'admin_login_invalid', '管理密码不正确。');
    }
    const now = Date.now();
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = now + this.config.adminSessionTtlMs;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`
        INSERT INTO admin_sessions (id, admin_user_id, token_digest, csrf_token, created_at, expires_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), admin.id, digest(this.config.sessionSecret, token), csrfToken, now, expiresAt, now);
      this.db.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?').run(now, admin.id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { token, csrfToken, expiresAt };
  }

  authenticateAdmin(token) {
    if (!token) return null;
    const now = Date.now();
    const row = this.db.prepare(`
      SELECT s.id AS session_id, s.admin_user_id, s.csrf_token, s.expires_at, s.last_seen_at, u.username
      FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.token_digest = ? AND s.revoked_at IS NULL AND s.expires_at > ?
    `).get(digest(this.config.sessionSecret, token), now);
    if (!row) return null;
    if (now - row.last_seen_at > 5 * 60 * 1000) this.db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?').run(now, row.session_id);
    return row;
  }

  verifyAdminCsrf(session, token) {
    return Boolean(token) && safeEqual(session.csrf_token, token);
  }

  revokeAdminSession(sessionId) {
    this.db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE id = ?').run(Date.now(), sessionId);
  }

  beginRequestEvent(session, requestId, operation) {
    const id = randomUUID();
    const startedAt = Date.now();
    this.db.prepare(`
      INSERT INTO request_events (id, request_id, invite_id, day, operation, started_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, requestId, session?.invite_id || null, chinaDay(startedAt), operation, startedAt);
    return { id, startedAt };
  }

  finishRequestEvent(context, { statusCode, errorCode } = {}) {
    if (!context?.id) return;
    const now = Date.now();
    const code = Number(statusCode) || 500;
    this.db.prepare(`
      UPDATE request_events SET status = ?, status_code = ?, error_code = ?, completed_at = ?, duration_ms = ?
      WHERE id = ? AND completed_at IS NULL
    `).run(code < 400 ? 'success' : 'failed', code, errorCode ? String(errorCode).slice(0, 64) : null, now, Math.max(0, now - context.startedAt), context.id);
  }

  listInvites() {
    const today = chinaDay();
    return this.db.prepare(`
      SELECT i.id, i.label, i.status, i.expires_at AS expiresAt, i.daily_flow_limit AS dailyFlowLimit,
        i.total_flow_limit AS totalFlowLimit, i.tester, i.redeemed_at AS redeemedAt, i.created_at AS createdAt,
        COALESCE(t.extract_count, 0) AS extractToday, COALESCE(t.diagnose_count, 0) AS diagnoseToday,
        COALESCE(t.optimize_count, 0) AS optimizeToday, COALESCE(t.export_count, 0) AS exportToday,
        COALESCE(all_usage.optimizeTotal, 0) AS optimizeTotal, sessions.lastSeenAt
      FROM invite_codes i
      LEFT JOIN usage_daily t ON t.invite_id = i.id AND t.day = ?
      LEFT JOIN (SELECT invite_id, SUM(optimize_count) AS optimizeTotal FROM usage_daily GROUP BY invite_id) all_usage ON all_usage.invite_id = i.id
      LEFT JOIN (SELECT invite_id, MAX(last_seen_at) AS lastSeenAt FROM access_sessions GROUP BY invite_id) sessions ON sessions.invite_id = i.id
      ORDER BY i.created_at DESC
    `).all(today).map(row => ({ ...row, tester: Boolean(row.tester) }));
  }

  updateInvite(id, patch, adminUserId) {
    const current = this.db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(id);
    if (!current) throw new AppError(404, 'invite_not_found', '未找到该邀请码。');
    const next = {
      label: patch.label === undefined ? current.label : typeof patch.label === 'string' ? patch.label.trim().slice(0, 40) || null : current.label,
      status: patch.status === undefined ? current.status : ['active', 'revoked'].includes(patch.status) ? patch.status : current.status,
      expiresAt: patch.expiresAt === undefined ? current.expires_at : patch.expiresAt === null ? null : integerSetting(patch.expiresAt, 1, Number.MAX_SAFE_INTEGER, '有效期'),
      dailyFlowLimit: patch.dailyFlowLimit === undefined ? current.daily_flow_limit : integerSetting(patch.dailyFlowLimit, 1, 100, '每日优化次数'),
      totalFlowLimit: patch.totalFlowLimit === undefined ? current.total_flow_limit : integerSetting(patch.totalFlowLimit, 1, 10000, '总优化次数'),
      tester: patch.tester === undefined ? Boolean(current.tester) : booleanSetting(patch.tester, '测试账号'),
    };
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`UPDATE invite_codes SET label = ?, status = ?, expires_at = ?, daily_flow_limit = ?, total_flow_limit = ?, tester = ? WHERE id = ?`)
        .run(next.label, next.status, next.expiresAt, next.dailyFlowLimit, next.totalFlowLimit, next.tester ? 1 : 0, id);
      if (next.status === 'revoked') this.db.prepare('UPDATE access_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE invite_id = ?').run(now, id);
      this.recordAudit(adminUserId, 'invite.update', 'invite', id, {
        label: current.label, status: current.status, expiresAt: current.expires_at, dailyFlowLimit: current.daily_flow_limit,
        totalFlowLimit: current.total_flow_limit, tester: Boolean(current.tester),
      }, next);
      this.db.exec('COMMIT');
      return next;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  resetInviteToday(id, adminUserId) {
    const invite = this.db.prepare('SELECT id FROM invite_codes WHERE id = ?').get(id);
    if (!invite) throw new AppError(404, 'invite_not_found', '未找到该邀请码。');
    const day = chinaDay();
    const before = this.db.prepare('SELECT * FROM usage_daily WHERE invite_id = ? AND day = ?').get(id, day) || null;
    this.db.prepare(`
      UPDATE usage_daily SET extract_count = 0, diagnose_count = 0, optimize_count = 0, export_count = 0
      WHERE invite_id = ? AND day = ?
    `).run(id, day);
    this.recordAudit(adminUserId, 'invite.reset_today', 'invite', id, before, { day, routeCountsReset: true });
  }

  getOverview(days = 7) {
    const safeDays = Math.min(30, Math.max(1, Number(days) || 7));
    const today = chinaDay();
    const since = chinaDay(Date.now() - (safeDays - 1) * DAY_MS);
    const routes = this.db.prepare(`
      SELECT COALESCE(SUM(extract_count), 0) AS extractCount, COALESCE(SUM(diagnose_count), 0) AS diagnoseCount,
        COALESCE(SUM(optimize_count), 0) AS optimizeCount, COALESCE(SUM(export_count), 0) AS exportCount,
        COUNT(DISTINCT CASE WHEN extract_count + diagnose_count + optimize_count + export_count > 0 THEN invite_id END) AS activeInvites
      FROM usage_daily WHERE day = ?
    `).get(today);
    const requests = this.db.prepare(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
        ROUND(AVG(CASE WHEN completed_at IS NOT NULL THEN duration_ms END)) AS averageDurationMs
      FROM request_events WHERE day = ?
    `).get(today);
    const provider = this.db.prepare(`
      SELECT COUNT(*) AS externalAttempts, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS externalSuccesses,
        COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(total_tokens), 0) AS totalTokens
      FROM provider_calls WHERE day = ?
    `).get(today);
    const spend = this.db.prepare('SELECT * FROM spend_daily WHERE day = ?').get(today) || { external_attempts: 0, estimated_cost_micros: 0 };
    const trendRows = this.db.prepare(`
      SELECT day, SUM(extract_count) AS extractCount, SUM(diagnose_count) AS diagnoseCount,
        SUM(optimize_count) AS optimizeCount, SUM(export_count) AS exportCount,
        SUM(external_attempts) AS externalAttempts, SUM(estimated_cost_micros) AS estimatedCostMicros
      FROM usage_daily WHERE day >= ? GROUP BY day ORDER BY day
    `).all(since);
    const byDay = new Map(trendRows.map(row => [row.day, row]));
    const trend = Array.from({ length: safeDays }, (_, index) => {
      const day = chinaDay(Date.now() - (safeDays - 1 - index) * DAY_MS);
      return byDay.get(day) || { day, extractCount: 0, diagnoseCount: 0, optimizeCount: 0, exportCount: 0, externalAttempts: 0, estimatedCostMicros: 0 };
    });
    const failures = this.db.prepare(`
      SELECT COALESCE(error_code, 'unknown') AS code, COUNT(*) AS count
      FROM request_events WHERE day >= ? AND status = 'failed' GROUP BY error_code ORDER BY count DESC LIMIT 8
    `).all(since);
    return {
      today,
      summary: {
        ...routes,
        requestCount: requests.total || 0,
        successRate: requests.total ? Math.round((requests.successes || 0) * 1000 / requests.total) / 10 : 0,
        averageDurationMs: requests.averageDurationMs || 0,
        ...provider,
        estimatedCostYuan: spend.estimated_cost_micros / 1_000_000,
      },
      trend,
      failures,
      settings: this.getRuntimeSettings(),
    };
  }

  listCalls({ limit = 100, operation = '', status = '' } = {}) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const clauses = [];
    const parameters = [];
    if (['extract', 'diagnose', 'optimize', 'export'].includes(operation)) { clauses.push('e.operation = ?'); parameters.push(operation); }
    if (['success', 'failed', 'running'].includes(status)) { clauses.push('e.status = ?'); parameters.push(status); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT e.id, e.request_id AS requestId, e.operation, e.status, e.status_code AS statusCode,
        e.error_code AS errorCode, e.started_at AS startedAt, e.completed_at AS completedAt, e.duration_ms AS durationMs,
        COALESCE(p.attempts, 0) AS externalAttempts, COALESCE(p.inputTokens, 0) AS inputTokens,
        COALESCE(p.outputTokens, 0) AS outputTokens, COALESCE(p.totalTokens, 0) AS totalTokens,
        COALESCE(p.estimatedCostMicros, 0) AS estimatedCostMicros
      FROM request_events e
      LEFT JOIN (
        SELECT request_id, COUNT(*) AS attempts, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
          SUM(total_tokens) AS totalTokens, SUM(estimated_cost_micros) AS estimatedCostMicros
        FROM provider_calls GROUP BY request_id
      ) p ON p.request_id = e.request_id
      ${where} ORDER BY e.started_at DESC LIMIT ?
    `).all(...parameters, safeLimit);
  }

  listAudit(limit = 100) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    return this.db.prepare(`
      SELECT a.id, a.action, a.target_type AS targetType, a.target_id AS targetId,
        a.created_at AS createdAt, u.username
      FROM admin_audit_log a LEFT JOIN admin_users u ON u.id = a.admin_user_id
      ORDER BY a.created_at DESC LIMIT ?
    `).all(safeLimit);
  }

  exportOperationalData(type) {
    if (type === 'daily') {
      return {
        filename: 'daily-usage.csv',
        columns: ['日期', '识别次数', '诊断次数', '优化次数', '导出次数', '外部请求', '预估费用（元）'],
        rows: this.db.prepare(`
          SELECT day AS day, SUM(extract_count) AS extractCount, SUM(diagnose_count) AS diagnoseCount,
            SUM(optimize_count) AS optimizeCount, SUM(export_count) AS exportCount,
            SUM(external_attempts) AS externalAttempts, ROUND(SUM(estimated_cost_micros) / 1000000.0, 4) AS estimatedCostYuan
          FROM usage_daily GROUP BY day ORDER BY day DESC LIMIT 365
        `).all().map(row => Object.values(row)),
      };
    }
    if (type === 'calls') {
      return {
        filename: 'request-calls.csv',
        columns: ['请求编号', '操作', '状态', '状态码', '错误分类', '开始时间', '耗时（毫秒）'],
        rows: this.db.prepare(`
          SELECT request_id, operation, status, status_code, error_code, started_at, duration_ms
          FROM request_events ORDER BY started_at DESC LIMIT 5000
        `).all().map(row => Object.values(row)),
      };
    }
    if (type === 'invites') {
      return {
        filename: 'invite-usage.csv',
        columns: ['匿名编号', '备注', '状态', '测试账号', '每日额度', '总额度', '已兑换时间', '到期时间'],
        rows: this.db.prepare(`
          SELECT id, label, status, tester, daily_flow_limit, total_flow_limit, redeemed_at, expires_at
          FROM invite_codes ORDER BY created_at DESC
        `).all().map(row => Object.values(row)),
      };
    }
    throw new AppError(400, 'admin_export_invalid', '请选择可导出的数据类型。');
  }
}

export { chinaDay, normalizeCode };
