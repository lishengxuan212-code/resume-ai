import { buildResumePrompt, resumeSchema } from "../prompt.js";
import { providerFailed } from "../resume-validation.js";
import { requestJson } from "./request-json.js";

export async function generateOpenAI(config, input, fetchImpl) {
  const data = await requestJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    redirect: "error",
    body: JSON.stringify({
      model: config.model, store: false, input: buildResumePrompt(input),
      text: { format: { type: "json_schema", name: "optimized_resume", strict: true, schema: resumeSchema } },
    }),
  }, config, fetchImpl);
  if (data?.error || (data?.status && data.status !== "completed")) throw providerFailed();
  const content = Array.isArray(data?.output)
    ? data.output.filter((item) => item?.type === "message").flatMap((item) => Array.isArray(item.content) ? item.content : [])
    : [];
  if (content.some((item) => item?.type === "refusal")) throw providerFailed();
  // output_text at the top level is an SDK convenience; raw HTTP responses
  // carry output_text blocks inside output[].content[].
  const outputText = content.filter((item) => item?.type === "output_text").map((item) => item.text).join("") || data?.output_text;
  if (typeof outputText !== "string" || !outputText.trim()) throw providerFailed();
  return JSON.parse(outputText);
}
