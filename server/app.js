import express from "express";
import multer from "multer";
import { randomUUID } from 'node:crypto';
import { AppError } from "./errors.js";
import { extractDocumentIsolated } from './extract-document-isolated.js';
import { MAX_UPLOAD_BYTES } from "./document-validation.js";
import { createProvider } from "./providers/index.js";
import { exportPdf } from "./export-pdf.js";
import { validateDiagnosisInput, validateOptimizedResume, validateOptimizeInput } from './resume-validation.js';
import { ProviderError, safeProviderError } from "./provider-error.js";
import { validateDiagnosis } from './diagnosis-validation.js';
import { METHODOLOGY_VERSION } from './methodology/index.js';
import { getResumeTemplate, listResumeTemplates } from './render/registry.js';
import { normalizeExportInput } from './export-input.js';
import { buildConservativeResume } from './conservative-resume.js';
import { createAccessControl } from './access-control.js';
import { createAdminControl } from './admin-control.js';
import { ConcurrencyGate, createWindowLimiter } from './request-limits.js';

const PROVIDERS = new Set(["openai", "deepseek", "qwen"]);

function validateExportInput(value) {
  const templateId = value?.templateId === undefined ? 'recommended' : value.templateId;
  if (typeof templateId !== 'string' || !getResumeTemplate(templateId)) throw new AppError(400, 'template_invalid', '请选择可用的简历模板。');
  return { ...normalizeExportInput(value), templateId };
}

function currentContentFallback(input, config) {
  const provider = config?.provider ?? 'fallback';
  const model = config?.model ?? 'fallback';
  const fallback = validateOptimizedResume(buildConservativeResume(input), input.facts, provider, model, { ruleIds: input.ruleIds, diagnosis: input.diagnosis, answers: input.answers, userConfirmedEdits: true });
  const totalBullets = fallback.sections.reduce((total, section) => total + section.entries.reduce((entryTotal, entry) => entryTotal + entry.bullets.length, 0), 0);
  return { ...fallback, quality: { checked: true, substantiveChange: false, sourceSimilarity: 1, exactCopyCount: 0, totalBullets, reason: 'current_content_fallback' } };
}

function publicResult(value) {
  const { provider, model, ...result } = value;
  return result;
}

function sameOrigin(request, response, next) {
  void response;
  const fetchSite = request.get('Sec-Fetch-Site');
  if (fetchSite === 'cross-site') return next(new AppError(403, 'origin_invalid', '请求来源无效。'));
  if (fetchSite === 'same-origin') return next();
  const origin = request.get('Origin');
  if (!origin) return next();
  let expected;
  const forwardedHost = request.get('X-Forwarded-Host')?.split(',')[0]?.trim();
  try { expected = new URL(`${request.protocol}://${forwardedHost || request.get('host')}`).origin; }
  catch { return next(new AppError(403, 'origin_invalid', '请求来源无效。')); }
  if (origin !== expected) return next(new AppError(403, 'origin_invalid', '请求来源无效。'));
  next();
}

function securityHeaders(production) {
  return (request, response, next) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:");
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (production) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');
    next();
  };
}

export function createApp({ config, configError, fetchImpl, services, accessControl, adminControl, accessConfig, logger = console } = {}) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  const access = accessControl ?? createAccessControl({ enabled: false });
  const admin = adminControl ?? createAdminControl({ enabled: false });
  const writeLimiter = createWindowLimiter({ limit: accessConfig?.writeRequestsPerHour ?? 1000, windowMs: 60 * 60 * 1000, message: '操作过于频繁，请稍后重试。' });
  const redeemLimiter = createWindowLimiter({ limit: accessConfig?.redeemRequestsPer15Minutes ?? 10, windowMs: 15 * 60 * 1000, message: '邀请码尝试次数过多，请稍后再试。' });
  const adminLoginLimiter = createWindowLimiter({ limit: 8, windowMs: 15 * 60 * 1000, message: '管理登录尝试次数过多，请稍后再试。' });
  const extractGate = new ConcurrencyGate({ limit: 1, queueLimit: 8, timeoutMs: 12_000 });
  const providerGate = new ConcurrencyGate({ limit: 3, queueLimit: 20, timeoutMs: 20_000 });
  const exportGate = new ConcurrencyGate({ limit: 2, queueLimit: 12, timeoutMs: 15_000 });

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((request, response, next) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-ID', request.requestId);
    next();
  });
  app.use(securityHeaders(Boolean(accessConfig?.production)));
  app.use('/api', (request, response, next) => request.method === 'GET' || request.method === 'HEAD' ? next() : sameOrigin(request, response, next));

  app.get('/api/access', access.status);
  app.post('/api/access/redeem', redeemLimiter, express.json({ limit: '8kb' }), access.redeem);
  app.post('/api/access/consent', writeLimiter, access.requireAccess, access.requireCsrf, access.acceptConsent);
  app.post('/api/access/logout', writeLimiter, access.requireAccess, access.requireCsrf, access.logout);

  const adminJson = express.json({ limit: '32kb' });
  app.get('/api/admin/status', admin.status);
  app.post('/api/admin/setup', adminLoginLimiter, adminJson, admin.setup);
  app.post('/api/admin/login', adminLoginLimiter, adminJson, admin.login);
  app.post('/api/admin/logout', admin.requireAdmin, admin.requireCsrf, admin.logout);
  app.get('/api/admin/overview', admin.requireAdmin, admin.overview);
  app.get('/api/admin/invites', admin.requireAdmin, admin.invites);
  app.post('/api/admin/invites', admin.requireAdmin, admin.requireCsrf, adminJson, admin.createInvites);
  app.patch('/api/admin/invites/:id', admin.requireAdmin, admin.requireCsrf, adminJson, admin.updateInvite);
  app.post('/api/admin/invites/:id/reset', admin.requireAdmin, admin.requireCsrf, admin.resetInvite);
  app.get('/api/admin/calls', admin.requireAdmin, admin.calls);
  app.get('/api/admin/settings', admin.requireAdmin, admin.settings);
  app.put('/api/admin/settings', admin.requireAdmin, admin.requireCsrf, adminJson, admin.updateSettings);
  app.get('/api/admin/audit', admin.requireAdmin, admin.audit);
  app.get('/api/admin/export', admin.requireAdmin, admin.exportData);

  app.get("/api/config", (request, response, next) => {
    try {
      if (configError) {
        throw configError;
      }

      if (!PROVIDERS.has(config?.provider)) {
        throw new AppError(503, "provider_invalid", "当前暂时无法开始优化，请稍后重试。");
      }

      response.json({
        configured: config.configured,
        methodologyVersion: METHODOLOGY_VERSION,
      });
    } catch (error) { next(error); }
  });

  app.get('/api/templates', (request, response) => {
    void request;
    response.setHeader('Cache-Control', 'no-store');
    response.json({ templates: listResumeTemplates(), defaultTemplateId: 'recommended' });
  });

  app.post("/api/extract", writeLimiter, access.requireAccess, access.track('extract'), access.requireCsrf, access.requireConsent, access.consume('extract'), extractGate.middleware(), upload.single("resume"), async (request, response, next) => {
    try {
      if (!request.file) {
        throw new AppError(400, "document_missing", "请通过 resume 字段上传简历文件");
      }
      response.json(await extractDocumentIsolated(request.file));
    } catch (error) { next(error); }
  });

  app.post('/api/diagnose', writeLimiter, access.requireAccess, access.track('diagnose'), access.requireCsrf, access.requireConsent, access.consume('diagnose'), providerGate.middleware(), express.json({ limit: '4mb' }), async (request, response, next) => {
    try {
      const input = validateDiagnosisInput(request.body);
      if (configError) throw configError;
      if (services?.diagnoseResume && !config?.configured) throw new AppError(503, 'provider_unconfigured', '当前暂时无法开始优化，请稍后重试。');
      const provider = services?.diagnoseResume ? null : createProvider(config, fetchImpl, {
        beforeAttempt: details => access.beforeExternalAttempt(request.access, { ...details, requestId: request.requestId }),
        afterAttempt: (result, context) => access.afterExternalAttempt(request.access, result, context),
      });
      let generated;
      try { generated = services?.diagnoseResume ? await services.diagnoseResume(input) : await provider.diagnoseResume(input); }
      catch (error) {
        if (error instanceof AppError && !(error instanceof ProviderError)) throw error;
        throw safeProviderError(error);
      }
      const diagnosis = validateDiagnosis(generated, input.facts, generated.provider ?? config.provider, generated.model ?? config.model, { ruleIds: input.ruleIds });
      response.json({ diagnosis: publicResult(diagnosis) });
    } catch (error) { next(error); }
  });

  app.post("/api/optimize", writeLimiter, access.requireAccess, access.track('optimize'), access.requireCsrf, access.requireConsent, access.consume('optimize'), providerGate.middleware(), express.json({ limit: "4mb" }), async (request, response, next) => {
    try {
      const input = validateOptimizeInput(request.body);
      if (configError) throw configError;
      if (services?.optimizeResume && !config?.configured) {
        throw new AppError(503, "provider_unconfigured", "当前暂时无法开始优化，请稍后重试。");
      }
      const provider = services?.optimizeResume ? null : createProvider(config, fetchImpl, {
        beforeAttempt: details => access.beforeExternalAttempt(request.access, { ...details, requestId: request.requestId }),
        afterAttempt: (result, context) => access.afterExternalAttempt(request.access, result, context),
      });
      let generated;
      try {
        if (services?.optimizeResume) {
          generated = await services.optimizeResume(input);
        } else {
          generated = await provider.generateResume(input);
        }
      } catch (error) {
        if (error instanceof AppError && !(error instanceof ProviderError)) throw error;
        throw safeProviderError(error);
      }
      let resume;
      try {
        resume = validateOptimizedResume(generated, input.facts, services?.optimizeResume ? config.provider : generated.provider ?? config.provider, services?.optimizeResume ? config.model : generated.model ?? config.model, { ruleIds: input.ruleIds, diagnosis: input.diagnosis, answers: input.answers });
      } catch {
        throw new ProviderError('invalid_result');
      }
      response.json({ resume: publicResult(resume), facts: input.facts });
    } catch (error) {
      if (error instanceof AppError && !(error instanceof ProviderError)) return next(error);
      const safeError = safeProviderError(error);
      if (safeError.reason === 'invalid_result') {
        try {
          const input = validateOptimizeInput(request.body);
          return response.json({ resume: publicResult(currentContentFallback(input, config)), facts: input.facts });
        } catch (fallbackError) {
          return next(fallbackError);
        }
      }
      next(safeError);
    }
  });

  app.post("/api/export", writeLimiter, access.requireAccess, access.track('export'), access.requireCsrf, access.requireConsent, access.consume('export'), exportGate.middleware(), express.json({ limit: "4mb" }), async (request, response, next) => {
    try {
      const input = validateExportInput(request.body);
      const pdf = await (services?.exportPdf ?? exportPdf)(input);
      response.setHeader('Cache-Control', 'no-store');
      response.type("application/pdf");
      response.setHeader("Content-Disposition", 'attachment; filename="optimized-resume.pdf"');
      response.send(pdf);
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', (request, response) => {
    void request;
    response.status(404).json({ error: { code: 'not_found', message: '接口不存在。' } });
  });

  app.use((error, request, response, next) => {
    void next;
    const appError = error instanceof AppError
      ? error
      : error.type === "entity.parse.failed" || error.type === "entity.too.large"
        ? new AppError(400, "request_invalid", "请提供有效且大小不超过 4 MB 的 JSON 请求。")
      : error instanceof multer.MulterError
        ? new AppError(400, "document_invalid", error.code === "LIMIT_FILE_SIZE" ? "上传文件不能超过 10 MB" : "只能上传一个 resume 文件")
        : new AppError(500, "internal_error", "Internal server error");
    if (appError.status >= 500) {
      logger.error(JSON.stringify({
        event: 'request_failed',
        requestId: request.requestId,
        status: appError.status,
        code: appError.code,
        ...(error instanceof ProviderError ? { reason: error.reason } : {}),
        errorName: error?.name,
        ...(error?.cause?.code || error?.code ? { systemCode: error?.cause?.code ?? error?.code } : {}),
      }));
    }
    request.errorCode = appError.code;
    response.status(appError.status).json({
      error: { code: appError.code, message: appError.message },
    });
  });

  return app;
}
