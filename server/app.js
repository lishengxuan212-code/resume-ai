import express from "express";
import multer from "multer";
import { AppError } from "./errors.js";
import { extractDocument } from "./extract-document.js";
import { MAX_UPLOAD_BYTES } from "./document-validation.js";
import { createProvider } from "./providers/index.js";
import { exportPdf } from "./export-pdf.js";
import { validateDiagnosisInput, validateOptimizedResume, validateOptimizeInput } from './resume-validation.js';
import { safeProviderError } from "./provider-error.js";
import { validateDiagnosis } from './diagnosis-validation.js';
import { METHODOLOGY_VERSION } from './methodology/index.js';

const PROVIDERS = new Set(["openai", "deepseek", "qwen"]);

function validateExportInput(value) {
  const input = validateOptimizeInput({
    facts: value?.facts,
    targetRole: value?.resume?.targetRole,
  });
  try {
    // Export is a deliberate user confirmation point. Keep structural and hidden
    // provenance checks, but do not reject facts the user has directly edited in
    // the final resume after AI generation.
    const validated = validateOptimizedResume(value?.resume, input.facts, "export", "export", { userConfirmedEdits: true });
    return {
      facts: input.facts,
      resume: { summary: validated.summary, targetRole: validated.targetRole, sections: validated.sections },
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "provider_failed") {
      throw new AppError(400, "request_invalid", "请提供有效的简历事实和优化结果。");
    }
    throw error;
  }
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
        throw new AppError(503, "provider_invalid", "Unsupported AI provider");
      }

      response.json({
        provider: config.provider,
        model: config.model ?? null,
        configured: config.configured,
        methodologyVersion: METHODOLOGY_VERSION,
        ...(config.providers?.filter((item) => item.configured).length > 1 ? { fallbackProviders: config.providers.filter((item) => item.configured).map((item) => ({ provider: item.provider, model: item.model })) } : {}),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/extract", upload.single("resume"), async (request, response, next) => {
    try {
      if (!request.file) {
        throw new AppError(400, "document_missing", "请通过 resume 字段上传简历文件");
      }
      response.json(await extractDocument(request.file));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/diagnose', express.json({ limit: '4mb' }), async (request, response, next) => {
    try {
      const input = validateDiagnosisInput(request.body);
      if (configError) throw configError;
      if (services?.diagnoseResume && !config?.configured) throw new AppError(503, 'provider_unconfigured', '当前 AI 服务尚未配置。');
      const provider = services?.diagnoseResume ? null : createProvider(config, fetchImpl);
      let generated;
      try { generated = services?.diagnoseResume ? await services.diagnoseResume(input) : await provider.diagnoseResume(input); }
      catch (error) { throw safeProviderError(error); }
      const diagnosis = validateDiagnosis(generated, input.facts, generated.provider ?? config.provider, generated.model ?? config.model, { ruleIds: input.ruleIds });
      response.json({ diagnosis });
    } catch (error) { next(error); }
  });

  app.post("/api/optimize", express.json({ limit: "4mb" }), async (request, response, next) => {
    try {
      const input = validateOptimizeInput(request.body);
      if (configError) throw configError;
      if (services?.optimizeResume && !config?.configured) {
        throw new AppError(503, "provider_unconfigured", "当前 AI 服务尚未配置。");
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
      const resume = validateOptimizedResume(generated, input.facts, services?.optimizeResume ? config.provider : generated.provider ?? config.provider, services?.optimizeResume ? config.model : generated.model ?? config.model, { ruleIds: input.ruleIds, diagnosis: input.diagnosis, answers: input.answers });
      response.json({ resume, facts: input.facts });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/export", express.json({ limit: "4mb" }), async (request, response, next) => {
    try {
      const input = validateExportInput(request.body);
      const pdf = await (services?.exportPdf ?? exportPdf)(input);
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
