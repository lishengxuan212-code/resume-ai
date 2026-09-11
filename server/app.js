import express from "express";
import { AppError } from "./errors.js";

const PROVIDERS = new Set(["openai", "deepseek", "qwen"]);

export function createApp({ config, fetchImpl, services } = {}) {
  const app = express();
  void fetchImpl;
  void services;

  app.get("/api/config", (request, response, next) => {
    try {
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

  app.use((error, request, response, next) => {
    void request;
    void next;
    const appError = error instanceof AppError ? error : new AppError(500, "internal_error", "Internal server error");
    response.status(appError.status).json({
      error: { code: appError.code, message: appError.message },
    });
  });

  return app;
}
