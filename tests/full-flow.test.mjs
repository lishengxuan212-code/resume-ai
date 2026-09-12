import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import { createApp } from "../server/app.js";

const fixtureUrl = new URL("./fixtures/resume.docx", import.meta.url);
const providerFailure = {
  error: { code: "provider_failed", message: "AI 服务暂时无法生成简历，请稍后重试。" },
};

async function withApp(options, run) {
  const server = http.createServer(createApp(options));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function extractFixtureDocx(baseUrl) {
  const buffer = await readFile(fixtureUrl);
  const form = new FormData();
  form.append("resume", new Blob([buffer]), "resume.docx");
  const response = await fetch(`${baseUrl}/api/extract`, { method: "POST", body: form });
  assert.equal(response.status, 200);
  return (await response.json()).facts;
}

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fixtureResume(facts) {
  return {
    summary: "具备真实项目经历的产品助理候选人。",
    targetRole: "产品助理",
    sections: [{
      heading: "项目经历",
      entries: [{
        title: "产品项目",
        organization: "",
        dates: "",
        bullets: [facts.sourceBlocks[0].text],
        sourceIds: [facts.sourceBlocks[0].id],
      }],
    }],
  };
}

test("processes a real DOCX through the injected model service and returns an in-memory PDF", async () => {
  let fetchCalls = 0;
  let fakeServiceInput;
  const options = {
    // Route gating is enabled, while the injected service has no real provider credential.
    config: { provider: "openai", model: "test-model", configured: true },
    fetchImpl: async () => { fetchCalls += 1; throw new Error("network must not be used"); },
    services: {
      optimizeResume: async (input) => {
        fakeServiceInput = input;
        return fixtureResume(input.facts);
      },
    },
  };
  assert.equal(Object.hasOwn(options.config, "apiKey"), false);

  await withApp(options, async (baseUrl) => {
    const facts = await extractFixtureDocx(baseUrl);
    assert.equal(facts.sourceBlocks[0].id, "docx-b1");
    assert.match(facts.sourceBlocks[0].text, /项目经历/);
    const optimizedResponse = await postJson(baseUrl, "/api/optimize", { facts, targetRole: "产品助理" });
    assert.equal(optimizedResponse.status, 200);
    const { resume } = await optimizedResponse.json();
    assert.equal(resume.provider, "openai");
    assert.equal(resume.model, "test-model");

    const exportedResponse = await postJson(baseUrl, "/api/export", { facts, resume });
    assert.equal(exportedResponse.status, 200);
    assert.match(exportedResponse.headers.get("content-type"), /^application\/pdf(?:;|$)/);
    assert.equal(Buffer.from(await exportedResponse.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  });

  assert.equal(fakeServiceInput.targetRole, "产品助理");
  assert.equal(fakeServiceInput.facts.sourceBlocks[0].id, "docx-b1");
  assert.equal(Object.hasOwn(fakeServiceInput, "apiKey"), false);
  assert.equal(fetchCalls, 0);
});

test("returns the existing safe 502 protocol when the injected model service fails", async () => {
  let fetchCalls = 0;
  const options = {
    config: { provider: "qwen", model: "test-model", configured: true },
    fetchImpl: async () => { fetchCalls += 1; throw new Error("network must not be used"); },
    services: { optimizeResume: async () => { throw new Error("fixture service failure"); } },
  };

  await withApp(options, async (baseUrl) => {
    const facts = await extractFixtureDocx(baseUrl);
    const response = await postJson(baseUrl, "/api/optimize", { facts, targetRole: "产品助理" });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), providerFailure);
  });

  assert.equal(fetchCalls, 0);
});
