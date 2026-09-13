import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../server/app.js";

const key = "test-only-secret-never-real";
const config = { provider: "openai", model: "server-model", apiKey: key, configured: true };
const facts = { name: "张三", contact: "", education: [], experiences: [], skills: [], warnings: [], sourceBlocks: [{ id: "p1-b1", text: "产品实习：负责用户访谈", page: 1 }] };
const resume = { methodologyVersion: '0.1', summary: "有用户访谈经验", targetRole: "产品助理", sections: [{ type: 'custom', heading: "经历", entries: [{ title: "产品实习", organization: "", dates: "", bullets: [{ title: '用户访谈', text: '开展用户访谈并整理反馈', sourceIds: ['p1-b1'], ruleIds: ['F01', 'E02'] }] }] }], omissions: [], warnings: [] };
const providerError = { error: { code: "provider_failed", message: "AI 服务暂时无法生成简历，请稍后重试。" } };

test('a provider deadline returns recoverable 502 JSON', async () => {
  const result = await post({ facts, targetRole: '产品助理' }, {
    config: { ...config, timeoutMs: 20 },
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }),
  });
  assert.equal(result.status, 502);
  assert.equal(JSON.parse(result.text).error.code, 'provider_failed');
  assert.match(JSON.parse(result.text).error.message, /超时/);
});

async function post(body, options = {}, raw = false) {
  const server = http.createServer(createApp({ config, ...options }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/optimize`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? body : JSON.stringify(body),
    });
    return { status: response.status, text: await response.text() };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("optimize normalizes injected results with server provenance and strips extra fields", async () => {
  let received;
  const result = await post({ facts, targetRole: " 产品助理 ", provider: "qwen", model: "client-model", apiKey: key }, {
    services: { optimizeResume: async (input) => { received = input; return { ...resume, provider: "forged", model: "forged", apiKey: key }; } },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.text), { resume: { ...resume, provider: "openai", model: "server-model" }, facts });
  assert.deepEqual(received, { facts, targetRole: "产品助理", jobDescription: '', answers: [], skipQuestions: false, ruleIds: ['F01', 'F02', 'F03', 'D03', 'E01', 'E02', 'E03', 'E04', 'T03', 'L01', 'L02', 'G01'] });
  assert.ok(!result.text.includes(key));
});

test('optimize validates and forwards diagnosis context instead of dropping its findings', async () => {
  let received;
  const diagnosis = { methodologyVersion: '0.1', findings: [{ dimension: '清晰度', issue: '个人优势缺少经历支撑', evidenceSourceIds: ['p1-b1'], suggestedAction: '用具体任务替代能力标签', ruleIds: ['E03'] }], questions: [], canOptimizeDirectly: true, provider: 'openai', model: 'server-model' };
  const result = await post({ facts, targetRole: '产品助理', diagnosis }, { services: { optimizeResume: async input => { received = input; return resume; } } });
  assert.equal(result.status, 200);
  assert.equal(received.diagnosis.findings[0].issue, '个人优势缺少经历支撑');
  assert.equal(Object.hasOwn(received.diagnosis, 'provider'), false);
});

test("optimize uses the default provider through injected fetch without exposing credentials", async () => {
  const result = await post({ facts, targetRole: "产品助理" }, { fetchImpl: async (url, request) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(request.headers.Authorization, `Bearer ${key}`);
    assert.ok(!request.body.includes(key));
    return { ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(resume) }] }] }) };
  } });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.text).resume.provider, "openai");
  assert.ok(!result.text.includes(key));
});

test('optimization returns the validated current-content fallback after invalid provider output', async () => {
  const fallbackFacts = {
    ...facts,
    experiences: [{ title: '产品运营实习生', organization: '知行科技', dates: '2025.03-2025.08', description: '用户访谈：参与用户访谈并整理反馈。', sourceIds: ['p1-b1'] }],
    sourceBlocks: [{ id: 'p1-b1', text: '知行科技 产品运营实习生 2025.03-2025.08。用户访谈：参与用户访谈并整理反馈。', page: 1 }],
  };
  let calls = 0;
  const result = await post({ facts: fallbackFacts, targetRole: '产品助理' }, {
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ summary: 'incomplete' }) }] }] }) };
    },
  });
  const body = JSON.parse(result.text);
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.equal(body.resume.quality.reason, 'current_content_fallback');
  assert.equal(body.resume.sections[0].entries[0].organization, '知行科技');
});

test("unconfigured optimization returns 503 before contacting a provider", async () => {
  let called = false;
  const result = await post({ facts, targetRole: "产品助理" }, { config: { ...config, configured: false }, fetchImpl: async () => { called = true; } });
  assert.equal(result.status, 503);
  assert.deepEqual(JSON.parse(result.text), { error: { code: "provider_unconfigured", message: "当前 AI 服务尚未配置。" } });
  assert.equal(called, false);
});

for (const [label, value] of [
  ["missing facts", {}], ["empty role", { facts, targetRole: " " }],
  ["object role", { facts, targetRole: {} }], ["long role", { facts, targetRole: "岗".repeat(201) }],
  ["empty blocks", { facts: { ...facts, sourceBlocks: [] }, targetRole: "产品助理" }],
  ["duplicate IDs", { facts: { ...facts, sourceBlocks: [facts.sourceBlocks[0], facts.sourceBlocks[0]] }, targetRole: "产品助理" }],
  ["empty source text", { facts: { ...facts, sourceBlocks: [{ id: "p1-b1", text: " " }] }, targetRole: "产品助理" }],
  ["non-string ID", { facts: { ...facts, sourceBlocks: [{ id: 1, text: "经历" }] }, targetRole: "产品助理" }],
  ["oversize source text", { facts: { ...facts, sourceBlocks: [{ id: "p1-b1", text: "字".repeat(12001) }] }, targetRole: "产品助理" }],
  ["too many blocks", { facts: { ...facts, sourceBlocks: Array.from({ length: 31 }, (_, index) => ({ id: `b${index}`, text: "经历" })) }, targetRole: "产品助理" }],
  ["invalid experiences", { facts: { ...facts, experiences: "经历" }, targetRole: "产品助理" }],
  ["null name", { facts: { ...facts, name: null }, targetRole: "产品助理" }],
  ["null education", { facts: { ...facts, education: null }, targetRole: "产品助理" }],
  ["null skills", { facts: { ...facts, skills: null }, targetRole: "产品助理" }],
  ["forged fact source IDs", { facts: { ...facts, experiences: [{ title: "", organization: "", dates: "", description: "经历", sourceIds: ["unknown"] }] }, targetRole: "产品助理" }],
]) {
  test(`rejects ${label} before optimization`, async () => {
    let called = false;
    const result = await post(value, { services: { optimizeResume: async () => { called = true; return resume; } } });
    assert.equal(result.status, 400);
    assert.equal(JSON.parse(result.text).error.code, "request_invalid");
    assert.equal(called, false);
  });
}

test("malformed JSON returns a safe structured 400 error", async () => {
  const result = await post(`{\"facts\":\"${key}`, {}, true);
  assert.equal(result.status, 400);
  assert.equal(JSON.parse(result.text).error.code, "request_invalid");
  assert.ok(!result.text.includes(key));
});

test("upstream failures do not expose upstream response bodies", async () => {
  const result = await post({ facts, targetRole: "产品助理" }, { fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: key }) }) });
  assert.equal(result.status, 502);
  assert.equal(JSON.parse(result.text).error.code, 'provider_failed');
  assert.match(JSON.parse(result.text).error.message, /密钥验证失败/);
  assert.ok(!result.text.includes(key));
});

for (const [status, message] of [
  [400, /请求参数/], [402, /余额不足/], [403, /调用权限/],
  [404, /模型或接口不可用/], [429, /频繁|额度/], [503, /服务商暂时不可用/],
]) {
  test(`provider HTTP ${status} exposes an actionable fixed message without upstream content`, async () => {
    const result = await post({ facts, targetRole: '产品助理' }, {
      fetchImpl: async () => ({ ok: false, status, json: async () => { throw new Error('error body must not be read: ' + key); } }),
    });
    assert.equal(result.status, 502);
    assert.match(JSON.parse(result.text).error.message, message);
    assert.ok(!result.text.includes(key));
  });
}

for (const [code, message] of [['EACCES', /外网连接.*拒绝/], ['ENOTFOUND', /无法连接/]]) {
  test(`provider network ${code} survives adapter and route error handling`, async () => {
    const result = await post({ facts, targetRole: '产品助理' }, {
      fetchImpl: async () => { throw new TypeError(key, { cause: Object.assign(new Error(key), { code }) }); },
    });
    assert.equal(result.status, 502);
    assert.match(JSON.parse(result.text).error.message, message);
    assert.ok(!result.text.includes(key));
  });
}

test("injected output still rejects nonexistent sources", async () => {
  const invalid = structuredClone(resume);
  invalid.sections[0].entries[0].bullets[0].sourceIds = ["unknown"];
  const result = await post({ facts, targetRole: "产品助理" }, { services: { optimizeResume: async () => invalid } });
  assert.equal(result.status, 502);
  assert.deepEqual(JSON.parse(result.text), providerError);
});

test("injected service exceptions receive the same safe provider error", async () => {
  const result = await post({ facts, targetRole: "产品助理" }, { services: { optimizeResume: async () => { throw new Error(key); } } });
  assert.equal(result.status, 502);
  assert.deepEqual(JSON.parse(result.text), providerError);
});
