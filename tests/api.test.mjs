import assert from 'node:assert/strict';
import test from 'node:test';
const api = await import('../src/api.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const create = options => { assert.equal(typeof api.createResumeApi, 'function', 'client API must be implemented'); return api.createResumeApi(options); };

test('extract sends the actual file using multipart resume field without forcing content type', async () => {
  const file = new File(['sample'], 'resume.pdf', { type: 'application/pdf' });
  let sent;
  const client = create({ fetch: async (url, init) => { sent = { url, ...init }; return Response.json({ facts: { name: '张三' } }); } });
  assert.deepEqual(await client.extractResume(file), { facts: { name: '张三' } });
  assert.equal(sent.url, '/api/extract');
  assert.equal(sent.method, 'POST');
  assert.ok(sent.body instanceof FormData);
  assert.equal(sent.body.get('resume'), file);
  assert.equal(sent.headers, undefined);
});

test('config and optimization use local API routes and normalized JSON payload', async () => {
  const calls = [];
  const client = create({ fetch: async (url, init) => { calls.push({ url, ...init }); return Response.json(url.endsWith('config') ? { configured: false, provider: 'openai', model: 'test' } : { resume: { summary: '结果' } }); } });
  assert.equal((await client.getApiConfig()).configured, false);
  assert.deepEqual(await client.optimizeResume({ name: '张三' }, '产品经理'), { resume: { summary: '结果' } });
  assert.equal(calls[0].url, '/api/config');
  assert.equal(calls[1].url, '/api/optimize');
  assert.equal(calls[1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[1].body), { facts: { name: '张三' }, targetRole: '产品经理', jobDescription: '', answers: [], skipQuestions: false });
});

test('optimization carries the validated diagnosis into the generation request', async () => {
  let body;
  const diagnosis = { methodologyVersion: '0.1', findings: [], questions: [], canOptimizeDirectly: true };
  const client = create({ fetch: async (url, init) => { body = JSON.parse(init.body); return Response.json({ resume: {} }); } });
  await client.optimizeResume({ name: '张三' }, '产品经理', { diagnosis });
  assert.deepEqual(body.diagnosis, diagnosis);
});

for (const method of ['getApiConfig', 'extractResume', 'diagnoseResume', 'optimizeResume', 'downloadResume']) {
  test(`${method} prioritizes server Chinese errors on non-2xx responses`, async () => {
    const client = create({ fetch: async () => Response.json({ error: { message: '服务暂时不可用，请重试。' } }, { status: 503 }) });
    await assert.rejects(() => client[method](new File(['x'], 'resume.pdf'), {}), /服务暂时不可用，请重试。/);
  });
}

test('export downloads the PDF blob then releases its URL and removes the anchor', async () => {
  const events = [];
  const anchor = { click() { events.push(['click', this.href, this.download]); }, remove() { events.push(['remove']); } };
  const client = create({
    fetch: async (url, init) => { assert.equal(url, '/api/export'); assert.deepEqual(JSON.parse(init.body), { facts: { name: '张三' }, resume: { summary: '结果' }, templateId: 'classic' }); return new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }); },
    URL: { createObjectURL(blob) { assert.ok(blob instanceof Blob); assert.equal(blob.type, 'application/pdf'); events.push(['create']); return 'blob:resume'; }, revokeObjectURL(url) { events.push(['revoke', url]); } },
    document: { createElement(tag) { assert.equal(tag, 'a'); return anchor; }, body: { append(node) { assert.equal(node, anchor); events.push(['append']); } } },
  });
  await client.downloadResume({ name: '张三' }, { summary: '结果' });
  assert.deepEqual(events, [['create'], ['append'], ['click', 'blob:resume', '优化简历.pdf'], ['remove'], ['revoke', 'blob:resume']]);
});

test('PDF requests include the selected template without downloading the preview response', async () => {
  let options;
  const blob = new Blob(['%PDF-test'], { type: 'application/pdf' });
  const client = create({ fetch: async (path, request) => { options = { path, request }; return new Response(blob, { headers: { 'Content-Type': 'application/pdf' } }); } });
  const result = await client.requestResumePdf({ name: '张三' }, { targetRole: '产品助理' }, 'classic');
  assert.equal(await result.text(), '%PDF-test');
  assert.equal(options.path, '/api/export');
  assert.deepEqual(JSON.parse(options.request.body), { facts: { name: '张三' }, resume: { targetRole: '产品助理' }, templateId: 'classic' });
});

test('PDF requests include the optional local avatar only for export', async () => {
  let options;
  const client = create({ fetch: async (path, request) => { options = { path, request }; return new Response('%PDF-test', { headers: { 'Content-Type': 'application/pdf' } }); } });
  await client.requestResumePdf({ name: '张三' }, { targetRole: '产品助理' }, 'classic', { avatarDataUrl: 'data:image/jpeg;base64,AAAA' });
  assert.deepEqual(JSON.parse(options.request.body), { facts: { name: '张三' }, resume: { targetRole: '产品助理' }, templateId: 'classic', presentation: { avatarDataUrl: 'data:image/jpeg;base64,AAAA' } });
});

test('export rejects successful non-PDF responses using any server Chinese error', async () => {
  const client = create({ fetch: async () => Response.json({ error: { message: 'PDF 生成失败，请重试。' } }) });
  await assert.rejects(() => client.downloadResume({}, {}), /PDF 生成失败，请重试。/);
});

test('export rejects HTML and network failure with readable Chinese fallback messages', async () => {
  const client = create({ fetch: async () => new Response('<html>wrong route</html>', { headers: { 'Content-Type': 'text/html' } }) });
  await assert.rejects(() => client.downloadResume({}, {}), /未收到 PDF/);
  const offline = create({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(() => offline.getApiConfig(), /连接/);
});
