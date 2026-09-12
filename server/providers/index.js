import { AppError } from "../errors.js";
import { providerFailed, validateOptimizedResume } from "../resume-validation.js";
import { generateOpenAI } from "./openai.js";
import { generateCompatibleChat } from "./compatible-chat.js";

const PROVIDERS = new Set(["openai", "deepseek", "qwen"]);

export function createProvider(config, fetchImpl = globalThis.fetch) {
  const candidates = config?.providers ?? [config];
  if (!Array.isArray(candidates) || candidates.some((candidate) => !PROVIDERS.has(candidate?.provider))) throw new AppError(503, "provider_invalid", "Unsupported AI provider");
  const configured = candidates.filter((candidate) => candidate.configured && candidate.apiKey && candidate.model);
  if (configured.length === 0) throw new AppError(503, "provider_unconfigured", "当前 AI 服务尚未配置。");
  const generateOne = async (settings, input) => {
  const generate = settings.provider === "openai" ? generateOpenAI : generateCompatibleChat;
    const result = await generate(settings, { facts: input.facts, targetRole: input.targetRole }, fetchImpl);
    return validateOptimizedResume(result, input.facts, settings.provider, settings.model);
  };
  return {
    async generateResume(input) {
      for (const candidate of configured) {
        const settings = { provider: candidate.provider, model: candidate.model, apiKey: candidate.apiKey, timeoutMs: candidate.timeoutMs };
        try { return await generateOne(settings, input); } catch { /* try the next configured provider */ }
      }
      throw providerFailed();
    },
  };
}
