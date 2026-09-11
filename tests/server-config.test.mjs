import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../server/config.js";

test("reads the selected OpenAI model from server-only environment variables", () => {
  assert.deepEqual(
    readConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "key", OPENAI_MODEL: "model-x" }),
    { provider: "openai", model: "model-x", apiKey: "key", configured: true },
  );
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
