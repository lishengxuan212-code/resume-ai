import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const projectRoot = new URL("..", import.meta.url);

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForConfig(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    if (child.exitCode !== null) throw new Error(`server exited before responding: ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError ?? new Error("server did not start");
}

function stop(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });
}

test("server startup loads the selected provider configuration from an env file without calling a provider", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
  assert.match(packageJson.scripts.server, /--env-file(?:=|\s+)\.env/);

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-env-startup-"));
  const envFile = path.join(tempDirectory, "fixture.env");
  const port = await reservePort();
  const environment = { ...process.env, PORT: String(port) };
  for (const variable of ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "QWEN_API_KEY", "QWEN_MODEL"]) {
    delete environment[variable];
  }
  await writeFile(envFile, "AI_PROVIDER=deepseek\nDEEPSEEK_API_KEY=dummy-startup-key\nDEEPSEEK_MODEL=dummy-startup-model\n");

  const child = spawn(process.execPath, ["--env-file", envFile, "server/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: environment,
    stdio: "ignore",
  });
  try {
    const response = await waitForConfig(`http://127.0.0.1:${port}/api/config`, child);
    assert.deepEqual(await response.json(), {
      provider: "deepseek",
      model: "dummy-startup-model",
      configured: true,
    });
  } finally {
    await stop(child);
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
