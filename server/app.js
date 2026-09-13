import express from "express";
import multer from "multer";
import { AppError } from "./errors.js";
import { extractDocument } from "./extract-document.js";
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

export function createApp({ config, configError, fetchImpl, services } = {}) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

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

  app.post("/api/extract", upload.single("resume"), async (request, response, next) => {
    try {
      if (!request.file) {
        throw new AppError(400, "document_missing", "请通过 resume 字段上传简历文件");
      }
      response.json(await extractDocument(request.file));
    } catch (error) { next(error); }
  });

  app.post('/api/diagnose', express.json({ limit: '4mb' }), async (request, response, next) => {
    try {
      const input = validateDiagnosisInput(request.body);
      if (configError) throw configError;
      if (services?.diagnoseResume && !config?.configured) throw new AppError(503, 'provider_unconfigured', '当前暂时无法开始优化，请稍后重试。');
      const provider = services?.diagnoseResume ? null : createProvider(config, fetchImpl);
      let generated;
      try { generated = services?.diagnoseResume ? await services.diagnoseResume(input) : await provider.diagnoseResume(input); }
      catch (error) { throw safeProviderError(error); }
      const diagnosis = validateDiagnosis(generated, input.facts, generated.provider ?? config.provider, generated.model ?? config.model, { ruleIds: input.ruleIds });
      response.json({ diagnosis: publicResult(diagnosis) });
    } catch (error) { next(error); }
  });

  app.post("/api/optimize", express.json({ limit: "4mb" }), async (request, response, next) => {
    try {
      const input = validateOptimizeInput(request.body);
      if (configError) throw configError;
      if (services?.optimizeResume && !config?.configured) {
        throw new AppError(503, "provider_unconfigured", "当前暂时无法开始优化，请稍后重试。");
      }
      const provider = services?.optimizeResume ? null : createProvider(config, fetchImpl);
      let generated;
      try {
        if (services?.optimizeResume) {
          generated = await services.optimizeResume(input);
        } else {
          generated = await provider.generateResume(input);
        }
      } catch (error) {
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
      const safeError = safeProviderError(error);
      if (safeError.reason === 'invalid_result') {
        try {
          const input = validateOptimizeInput(request.body);
          return response.json({ resume: publicResult(currentContentFallback(input, config)), facts: input.facts });
        } catch (fallbackError) {
          return next(fallbackError);
        }
      }
      next(error);
    }
  });

  app.post("/api/export", express.json({ limit: "4mb" }), async (request, response, next) => {
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

  app.use((error, request, response, next) => {
    void request;
    void next;
    const appError = error instanceof AppError
      ? error
      : error.type === "entity.parse.failed" || error.type === "entity.too.large"
        ? new AppError(400, "request_invalid", "请提供有效且大小不超过 4 MB 的 JSON 请求。")
      : error instanceof multer.MulterError
        ? new AppError(400, "document_invalid", error.code === "LIMIT_FILE_SIZE" ? "上传文件不能超过 10 MB" : "只能上传一个 resume 文件")
        : new AppError(500, "internal_error", "Internal server error");
    response.status(appError.status).json({
      error: { code: appError.code, message: appError.message },
    });
  });

  return app;
}
