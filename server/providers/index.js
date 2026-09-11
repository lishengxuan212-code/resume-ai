import { AppError } from "../errors.js";
import { providerFailed, validateOptimizedResume } from "../resume-validation.js";
import { generateOpenAI } from "./openai.js";
import { generateCompatibleChat } from "./compatible-chat.js";

const PROVIDERS = new Set(["openai", "deepseek", "qwen"]);

export function createProvider(config, fetchImpl = globalThis.fetch) {
  if (!PROVIDERS.has(config?.provider)) throw new AppError(503, "provider_invalid", "Unsupported AI provider");
  if (!config.configured || !config.apiKey || !config.model) throw new AppError(503, "provider_unconfigured", "当前 AI 服务尚未配置。");
  const settings = { provider: config.provider, model: config.model, apiKey: config.apiKey };
  const generate = settings.provider === "openai" ? generateOpenAI : generateCompatibleChat;
  return {
    async generateResume(input) {
      try {
        const result = await generate(settings, { facts: input.facts, targetRole: input.targetRole }, fetchImpl);
        return validateOptimizedResume(result, input.facts, settings.provider, settings.model);
      } catch {
        // Never forward transport errors, provider bodies, JSON snippets or keys.
        throw providerFailed();
      }
    },
  };
}
