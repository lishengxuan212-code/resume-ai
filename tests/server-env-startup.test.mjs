import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const serverEntry = path.join(projectRoot, "server", "index.js");
const providerVariables = ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "QWEN_API_KEY", "QWEN_MODEL"];

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

function cleanEnvironment(port, values = {}) {
  const environment = { ...process.env, PORT: String(port), ...values };
  for (const variable of providerVariables) {
    if (!(variable in values)) delete environment[variable];
  }
  return environment;
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

test("local server startup loads the selected provider configuration from an env file without calling a provider", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
  assert.equal(packageJson.scripts.server, "node server/index.js");
  assert.equal(packageJson.scripts["server:dev"], "node --env-file=.env server/index.js");
  assert.match(packageJson.scripts["dev:full"], /npm run server:dev/);

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-env-startup-"));
  const envFile = path.join(tempDirectory, "fixture.env");
  const port = await reservePort();
  await writeFile(envFile, "AI_PROVIDER=deepseek\nDEEPSEEK_API_KEY=dummy-startup-key\nDEEPSEEK_MODEL=dummy-startup-model\n");

  const child = spawn(process.execPath, ["--env-file", envFile, serverEntry], {
    cwd: projectRoot,
    env: cleanEnvironment(port),
    stdio: "ignore",
  });
  try {
    const response = await waitForConfig(`http://127.0.0.1:${port}/api/config`, child);
    assert.deepEqual(await response.json(), {
      provider: "deepseek",
      model: "dummy-startup-model",
      configured: true,
      methodologyVersion: '0.1',
    });
  } finally {
    await stop(child);
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("generic server startup uses injected provider variables without an env file or provider network call", async () => {
  const temporaryWorkingDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-process-env-"));
  const port = await reservePort();
  const child = spawn(process.execPath, [serverEntry], {
    cwd: temporaryWorkingDirectory,
    env: cleanEnvironment(port, {
      AI_PROVIDER: "qwen",
      QWEN_API_KEY: "dummy-process-key",
      QWEN_MODEL: "dummy-process-model",
    }),
    stdio: "ignore",
  });
  try {
    const response = await waitForConfig(`http://127.0.0.1:${port}/api/config`, child);
    assert.deepEqual(await response.json(), {
      provider: "qwen",
      model: "dummy-process-model",
      configured: true,
      methodologyVersion: '0.1',
    });
  } finally {
    await stop(child);
    await rm(temporaryWorkingDirectory, { recursive: true, force: true });
  }
});
