import { AppError } from "./errors.js";
import { DEFAULT_AI_TIMEOUT_MS, MAX_AI_TIMEOUT_MS } from './provider-settings.js';

const PROVIDERS = {
  openai: { apiKey: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
  deepseek: { apiKey: "DEEPSEEK_API_KEY", model: "DEEPSEEK_MODEL" },
  qwen: { apiKey: "QWEN_API_KEY", model: "QWEN_MODEL" },
};

export function readConfig(env) {
  const requested = (env.AI_PROVIDERS ?? env.AI_PROVIDER ?? "openai").split(",").map((name) => name.trim()).filter(Boolean);
  if (requested.length === 0 || requested.some((provider) => !Object.hasOwn(PROVIDERS, provider))) {
    throw new AppError(503, "provider_invalid", "当前暂时无法开始优化，请稍后重试。");
  }
  const rawTimeout = env.AI_TIMEOUT_MS?.trim() ?? "";
  const parsedTimeout = /^\d+$/.test(rawTimeout) ? Number(rawTimeout) : NaN;
  const timeoutMs = Number.isInteger(parsedTimeout) && parsedTimeout >= 1000 && parsedTimeout <= MAX_AI_TIMEOUT_MS ? parsedTimeout : DEFAULT_AI_TIMEOUT_MS;
  const providers = requested.map((provider) => {
    const variables = PROVIDERS[provider];
    const apiKey = env[variables.apiKey]?.trim();
    const model = env[variables.model]?.trim();
    return { provider, model, apiKey, configured: Boolean(apiKey && model), timeoutMs };
  });
  const active = providers.find((item) => item.configured) ?? providers[0];
  return { ...active, configured: providers.some((item) => item.configured), providers };
}
