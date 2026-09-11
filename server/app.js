import express from "express";
import multer from "multer";
import { AppError } from "./errors.js";
import { extractDocument } from "./extract-document.js";
import { MAX_UPLOAD_BYTES } from "./document-validation.js";
import { createProvider } from "./providers/index.js";
import { providerFailed, validateOptimizedResume, validateOptimizeInput } from "./resume-validation.js";

const PROVIDERS = new Set(["openai", "deepseek", "qwen"]);

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

  app.post("/api/optimize", express.json({ limit: "4mb" }), async (request, response, next) => {
    try {
      const input = validateOptimizeInput(request.body);
      if (configError) throw configError;
      const provider = createProvider(config, fetchImpl);
      let generated;
      try {
        generated = services?.optimizeResume
          ? await services.optimizeResume(input)
          : await provider.generateResume(input);
      } catch {
        throw providerFailed();
      }
      response.json({ resume: validateOptimizedResume(generated, input.facts, config.provider, config.model) });
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
