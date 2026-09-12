import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../server/config.js";

test("reads the selected OpenAI model from server-only environment variables", () => {
  assert.deepEqual(
    readConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "key", OPENAI_MODEL: "model-x" }),
    { provider: "openai", model: "model-x", apiKey: "key", configured: true, timeoutMs: 120000, providers: [{ provider: "openai", model: "model-x", apiKey: "key", configured: true, timeoutMs: 120000 }] },
  );
});

test("uses configured providers in declared order for failover", () => {
  const config = readConfig({ AI_PROVIDERS: "deepseek,qwen", DEEPSEEK_API_KEY: "first", DEEPSEEK_MODEL: "deepseek-chat", QWEN_API_KEY: "second", QWEN_MODEL: "qwen-plus" });
  assert.equal(config.provider, "deepseek");
  assert.deepEqual(config.providers.map((item) => item.provider), ["deepseek", "qwen"]);
});

test('AI timeout accepts only integer milliseconds within the server range', () => {
  for (const [value, expected] of [['1000', 1000], ['30000', 30000], ['120000', 120000], ['300000', 300000], [' 2500 ', 2500], [undefined, 120000], ['', 120000], ['999', 120000], ['300001', 120000], ['1.5', 120000], ['2000ms', 120000], ['1e4', 120000], ['Infinity', 120000]]) {
    assert.equal(readConfig({ AI_TIMEOUT_MS: value }).timeoutMs, expected, `AI_TIMEOUT_MS=${value}`);
  }
});

test("marks an absent active-provider key as unconfigured", () => {
  assert.equal(readConfig({ AI_PROVIDER: "deepseek" }).configured, false);
});

test("marks whitespace-only active-provider credentials as unconfigured", () => {
  assert.equal(
    readConfig({ AI_PROVIDER: "qwen", QWEN_API_KEY: "   ", QWEN_MODEL: "\t" }).configured,
    false,
  );
});
