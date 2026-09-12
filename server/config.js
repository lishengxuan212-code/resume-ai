import { AppError } from "./errors.js";

const PROVIDERS = {
  openai: { apiKey: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
  deepseek: { apiKey: "DEEPSEEK_API_KEY", model: "DEEPSEEK_MODEL" },
  qwen: { apiKey: "QWEN_API_KEY", model: "QWEN_MODEL" },
};

export function readConfig(env) {
  const provider = env.AI_PROVIDER || "openai";
  const variables = PROVIDERS[provider];

  if (!variables) {
    throw new AppError(503, "provider_invalid", "Unsupported AI provider");
  }

  const apiKey = env[variables.apiKey]?.trim();
  const model = env[variables.model]?.trim();
  const rawTimeout = env.AI_TIMEOUT_MS?.trim() ?? "";
  const parsedTimeout = /^\d+$/.test(rawTimeout) ? Number(rawTimeout) : NaN;
  const timeoutMs = Number.isInteger(parsedTimeout) && parsedTimeout >= 1000 && parsedTimeout <= 120000 ? parsedTimeout : 30000;
  return { provider, model, apiKey, configured: Boolean(apiKey && model), timeoutMs };
}
