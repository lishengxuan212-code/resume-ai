import path from 'node:path';
import { AppError } from './errors.js';

function integer(value, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AppError(500, 'access_config_invalid', '访问控制配置无效。');
  }
  return parsed;
}

function secret(value, name) {
  const normalized = value?.trim();
  if (!normalized || normalized.length < 32) {
    throw new AppError(500, 'access_config_invalid', `${name} 必须至少包含 32 个字符。`);
  }
  return normalized;
}

function boolean(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!['true', 'false'].includes(normalized)) {
    throw new AppError(500, 'access_config_invalid', `${name} 只能设置为 true 或 false。`);
  }
  return normalized === 'true';
}

export function readAccessConfig(env = process.env) {
  const pocketBayDataDir = env.POCKETBAY_DATA_DIR?.trim();
  const production = env.NODE_ENV === 'production' || Boolean(pocketBayDataDir);
  const requested = env.ACCESS_REQUIRED?.trim().toLowerCase();
  if (requested && !['true', 'false'].includes(requested)) {
    throw new AppError(500, 'access_config_invalid', 'ACCESS_REQUIRED 只能设置为 true 或 false。');
  }
  const quotaRequested = env.INVITE_QUOTAS_ENABLED?.trim().toLowerCase();
  if (quotaRequested && !['true', 'false'].includes(quotaRequested)) {
    throw new AppError(500, 'access_config_invalid', 'INVITE_QUOTAS_ENABLED 只能设置为 true 或 false。');
  }
  const enabled = production || requested === 'true';
  if (!enabled) return { enabled: false };

  const sessionDays = integer(env.ACCESS_SESSION_DAYS, 14, 1, 90);
  const adminSessionHours = integer(env.ADMIN_SESSION_HOURS, 8, 1, 24);
  const budgetYuan = integer(env.DAILY_EXTERNAL_BUDGET_YUAN, 10, 1, 10000);
  const alertYuan = integer(env.DAILY_EXTERNAL_ALERT_YUAN, Math.min(5, budgetYuan), 1, budgetYuan);
  const requestCostMicros = integer(env.EXTERNAL_REQUEST_COST_MICROS, 9670, 1, 10_000_000);
  const dbPath = pocketBayDataDir
    ? path.join(pocketBayDataDir, 'resume-app.db')
    : env.ACCESS_DB_PATH?.trim() || (production ? '/var/lib/resume-app/app.db' : path.resolve('data/resume-app.db'));
  const adminPasswordMinLength = production ? 12 : integer(env.ADMIN_LOCAL_PASSWORD_MIN_LENGTH, 12, 8, 128);
  const adminBootstrapPassword = env.ADMIN_BOOTSTRAP_PASSWORD || '';
  if (adminBootstrapPassword && (adminBootstrapPassword.length < 12 || adminBootstrapPassword.length > 128 || Buffer.byteLength(adminBootstrapPassword, 'utf8') > 256)) {
    throw new AppError(500, 'access_config_invalid', 'ADMIN_BOOTSTRAP_PASSWORD 必须为 12–128 个字符。');
  }

  return {
    enabled: true,
    production,
    enforceInviteQuotas: production || quotaRequested !== 'false',
    dbPath,
    invitePepper: secret(env.INVITE_PEPPER, 'INVITE_PEPPER'),
    sessionSecret: secret(env.SESSION_HMAC_SECRET, 'SESSION_HMAC_SECRET'),
    cookieName: production ? '__Host-resume_access' : 'resume_access',
    adminCookieName: production ? '__Host-resume_admin' : 'resume_admin',
    sessionTtlMs: sessionDays * 24 * 60 * 60 * 1000,
    adminSessionTtlMs: adminSessionHours * 60 * 60 * 1000,
    adminLocalBypass: !production && boolean(env.ADMIN_LOCAL_BYPASS, false, 'ADMIN_LOCAL_BYPASS'),
    adminLoginHint: env.ADMIN_LOGIN_HINT?.trim().slice(0, 40) || '',
    adminPasswordMinLength,
    adminBootstrapPassword,
    defaultDailyFlowLimit: integer(env.INVITE_DAILY_FLOW_LIMIT, 2, 1, 20),
    defaultTotalFlowLimit: integer(env.INVITE_TOTAL_FLOW_LIMIT, 20, 1, 1000),
    routeLimits: {
      extract: integer(env.INVITE_DAILY_EXTRACT_LIMIT, 6, 1, 100),
      diagnose: integer(env.INVITE_DAILY_DIAGNOSE_LIMIT, 3, 1, 100),
      export: integer(env.INVITE_DAILY_EXPORT_LIMIT, 6, 1, 100),
    },
    dailyBudgetMicros: budgetYuan * 1_000_000,
    dailyAlertMicros: alertYuan * 1_000_000,
    requestCostMicros,
    writeRequestsPerHour: integer(env.WRITE_REQUESTS_PER_HOUR, 30, 4, 1000),
    redeemRequestsPer15Minutes: integer(env.REDEEM_REQUESTS_PER_15_MINUTES, 10, 1, 100),
  };
}
