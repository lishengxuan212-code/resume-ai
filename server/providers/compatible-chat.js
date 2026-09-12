import { buildDiagnosisPrompt, buildResumePrompt } from '../prompt.js';
import { ProviderError } from '../provider-error.js';
import { requestJson } from "./request-json.js";

const ENDPOINTS = new Map([
  ["deepseek", "https://api.deepseek.com/chat/completions"],
  ["qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"],
]);

export async function generateCompatibleChat(config, input, fetchImpl, task = 'optimize') {
  const data = await requestJson(ENDPOINTS.get(config.provider), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    redirect: "error",
    body: JSON.stringify({ model: config.model, messages: task === 'diagnose' ? buildDiagnosisPrompt(input) : buildResumePrompt(input), response_format: { type: 'json_object' },
      // Explicit mode prevents model-alias changes from silently enabling long
      // reasoning before a structured editing response. Other providers differ.
      ...(config.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
    }),
  }, config, fetchImpl);
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (data?.error || choice?.message?.refusal || (choice?.finish_reason && choice.finish_reason !== "stop") || typeof content !== "string" || !content.trim()) throw new ProviderError('invalid_result');
  return JSON.parse(content);
}
