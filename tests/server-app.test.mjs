import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../server/app.js";

async function request(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    return await fetch(`http://127.0.0.1:${port}/api/config`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("returns selected configuration without the provider key", async () => {
  const response = await request(
    createApp({ config: { provider: "qwen", model: "qwen-plus", apiKey: "secret", configured: true } }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { provider: "qwen", model: "qwen-plus", configured: true });
});

test("returns a structured 503 response for an invalid provider", async () => {
  const response = await request(
    createApp({ config: { provider: "unknown", model: undefined, apiKey: undefined, configured: false } }),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { code: "provider_invalid", message: "Unsupported AI provider" },
  });
});
