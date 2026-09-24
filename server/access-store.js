import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AppError } from './errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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
      CREATE INDEX IF NOT EXISTS access_sessions_invite_id ON access_sessions(invite_id);
      CREATE INDEX IF NOT EXISTS access_sessions_expires_at ON access_sessions(expires_at);
    `);
    const sessionColumns = new Set(this.db.prepare('PRAGMA table_info(access_sessions)').all().map(column => column.name));
    if (!sessionColumns.has('consented_at')) this.db.exec('ALTER TABLE access_sessions ADD COLUMN consented_at INTEGER');
    if (!sessionColumns.has('consent_version')) this.db.exec('ALTER TABLE access_sessions ADD COLUMN consent_version TEXT');
  }

  createInvite({ expiresInDays = 30, dailyFlowLimit, totalFlowLimit } = {}) {
    const code = makeInviteCode();
    const now = Date.now();
    const expiresAt = expiresInDays ? now + expiresInDays * DAY_MS : null;
    this.db.prepare(`
      INSERT INTO invite_codes (id, code_digest, expires_at, daily_flow_limit, total_flow_limit, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      digest(this.config.invitePepper, code),
      expiresAt,
      dailyFlowLimit ?? this.config.defaultDailyFlowLimit,
      totalFlowLimit ?? this.config.defaultTotalFlowLimit,
      now,
    );
    return { code, expiresAt, dailyFlowLimit: dailyFlowLimit ?? this.config.defaultDailyFlowLimit, totalFlowLimit: totalFlowLimit ?? this.config.defaultTotalFlowLimit };
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
             i.daily_flow_limit, i.total_flow_limit
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
    const day = chinaDay();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR IGNORE INTO usage_daily (invite_id, day) VALUES (?, ?)').run(session.invite_id, day);
      const current = this.db.prepare('SELECT * FROM usage_daily WHERE invite_id = ? AND day = ?').get(session.invite_id, day);
      const total = this.db.prepare('SELECT COALESCE(SUM(optimize_count), 0) AS count FROM usage_daily WHERE invite_id = ?').get(session.invite_id).count;
      const dailyLimit = route === 'optimize' ? session.daily_flow_limit : this.config.routeLimits[route];
      const exhausted = this.config.enforceInviteQuotas && (current[column] >= dailyLimit || (route === 'optimize' && total >= session.total_flow_limit));
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

  recordExternalAttempt(session) {
    if (!session) return;
    const day = chinaDay();
    const cost = this.config.requestCostMicros;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR IGNORE INTO usage_daily (invite_id, day) VALUES (?, ?)').run(session.invite_id, day);
      this.db.prepare('INSERT OR IGNORE INTO spend_daily (day) VALUES (?)').run(day);
      const spend = this.db.prepare('SELECT * FROM spend_daily WHERE day = ?').get(day);
      if (spend.estimated_cost_micros + cost > this.config.dailyBudgetMicros) {
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
      `).run(nextCost, nextCost, this.config.dailyAlertMicros, day);
      this.db.exec('COMMIT');
      if (!spend.alert_emitted && nextCost >= this.config.dailyAlertMicros) {
        this.logger.warn(JSON.stringify({ event: 'external_budget_alert', day, estimatedCostYuan: nextCost / 1_000_000 }));
      }
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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
}

export { chinaDay, normalizeCode };
