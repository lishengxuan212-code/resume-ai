# 简历识别与多模型切换实施计划

> **供执行智能体使用：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐任务执行本计划。步骤采用复选框记录进度。

**目标：** 在现有首页中接入真实 PDF/DOCX 文本识别、可配置的三家 AI 简历优化服务和中文 PDF 下载。

**架构：** 新增独立 Node/Express 服务作为唯一的 `/api` 提供者，前端通过 Vite 代理访问它。文档提取、模型适配、结构校验和 PDF 生成是相互独立的服务；模型供应商由服务端环境变量选择，浏览器不接触密钥。

**技术栈：** Node.js 20+、Express、Multer、PDF.js、Mammoth、PDFKit、React 19、Vite 6、Node 原生测试运行器。

**设计：** `docs/superpowers/specs/2026-09-11-resume-processing-design.md`

## 全局约束

- 只接受单个 PDF/DOCX 文件，最大 10 MB；PDF 最多 10 页；扫描型或无文字 PDF 必须失败并说明原因。
- 上传材料、联系方式、模型密钥和完整模型响应不得写入日志或磁盘；上传仅使用 Multer 内存存储。
- `AI_PROVIDER` 的合法值固定为 `openai`、`deepseek`、`qwen`；未配置密钥返回 503，前端不能假装已优化。
- 生成内容仅能引用已确认事实的 `sourceIds`，不能编造数字、日期、公司、学历、技能或职责。
- OpenAI Responses 请求必须带 `store: false`；模型名均通过环境变量配置。
- 保留 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs` 和 `tests/sites-worker.test.mjs` 的现有职责。

---

### Task 1：建立服务端基础、配置和错误协议

**文件：**
- 新建：`server/config.js`
- 新建：`server/errors.js`
- 新建：`server/app.js`
- 新建：`server/index.js`
- 新建：`.env.example`
- 修改：`package.json`
- 修改：`vite.config.mjs`
- 测试：`tests/server-config.test.mjs`
- 测试：`tests/server-app.test.mjs`

**接口：**
- 提供：`readConfig(env): { provider, model, apiKey, configured }`
- 提供：`AppError(status, code, message)`
- 提供：`createApp({ config, fetchImpl, services }): express.Application`
- 消费：后续路由通过 `services.extractDocument`、`services.optimizeResume`、`services.exportPdf` 调用业务逻辑。

- [ ] **步骤 1：先编写配置和健康接口的失败测试。**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../server/config.js';

test('reads the selected OpenAI model from server-only environment variables', () => {
  assert.deepEqual(readConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model-x' }), {
    provider: 'openai', model: 'model-x', apiKey: 'key', configured: true,
  });
});

test('marks an absent active-provider key as unconfigured', () => {
  assert.equal(readConfig({ AI_PROVIDER: 'deepseek' }).configured, false);
});
```

- [ ] **步骤 2：运行测试，确认因模块不存在而失败。**

运行：`node --test tests/server-config.test.mjs`

预期：失败信息包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **步骤 3：实现最小配置与 HTTP 壳。**

```js
const providers = {
  openai: ['OPENAI_API_KEY', 'OPENAI_MODEL'],
  deepseek: ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'],
  qwen: ['QWEN_API_KEY', 'QWEN_MODEL'],
};

export function readConfig(env = process.env) {
  const provider = env.AI_PROVIDER ?? 'openai';
  if (!providers[provider]) throw new AppError(503, 'provider_invalid', '当前 AI 服务配置无效。');
  const [keyName, modelName] = providers[provider];
  const apiKey = env[keyName] ?? '';
  return { provider, model: env[modelName] ?? '', apiKey, configured: Boolean(apiKey && env[modelName]) };
}
```

在 `createApp` 中实现 `GET /api/config`，只返回 `{ provider, model, configured }`，并集中把 `AppError` 转为 `{ error: { code, message } }` JSON。`server/index.js` 使用 `app.listen(process.env.PORT ?? 8787)`；Vite 开发代理将 `/api` 转发至 `http://127.0.0.1:8787`。`package.json` 增加 `server`、`dev:full` 和 `test` 脚本。

- [ ] **步骤 4：运行本任务测试并确认通过。**

运行：`node --test tests/server-config.test.mjs tests/server-app.test.mjs`

预期：所有配置、503 和 `/api/config` 用例通过。

- [ ] **步骤 5：提交本任务。**

```powershell
git add package.json package-lock.json vite.config.mjs .env.example server tests/server-config.test.mjs tests/server-app.test.mjs
git commit -m "feat: add resume API foundation"
```

### Task 2：实现内存上传验证和 PDF/DOCX 文本提取

**文件：**
- 新建：`server/document-validation.js`
- 新建：`server/extract-document.js`
- 新建：`server/facts.js`
- 修改：`server/app.js`
- 修改：`package.json`
- 测试：`tests/document-validation.test.mjs`
- 测试：`tests/extract-document.test.mjs`
- 测试：`tests/extract-api.test.mjs`

**接口：**
- 提供：`validateUpload(file): void`
- 提供：`extractDocument(file): Promise<{ facts: ResumeFacts }>`
- 提供：`buildFacts(sourceBlocks): ResumeFacts`
- 路由：`POST /api/extract` 读取 `resume` 字段后返回 `{ facts }`。

- [ ] **步骤 1：为真实文件特征、页数和空文本写失败测试。**

```js
test('rejects a renamed executable instead of trusting its PDF suffix', () => {
  assert.throws(() => validateUpload({ originalname: 'resume.pdf', size: 4, buffer: Buffer.from('MZ!!') }), /PDF 或 DOCX/);
});

test('returns page-linked blocks from a text PDF', async () => {
  const result = await extractDocument(pdfFileWithText('张三\n北京大学'));
  assert.deepEqual(result.facts.sourceBlocks, [{ id: 'p1-b1', text: '张三\n北京大学', page: 1 }]);
});

test('rejects a PDF with no extractable text', async () => {
  await assert.rejects(() => extractDocument(pdfFileWithoutText()), /扫描型/);
});
```

- [ ] **步骤 2：运行测试，确认接口尚不存在。**

运行：`node --test tests/document-validation.test.mjs tests/extract-document.test.mjs`

预期：失败信息包含缺少 `server/document-validation.js` 或 `server/extract-document.js`。

- [ ] **步骤 3：添加依赖并实现提取服务。**

安装：`npm install express multer mammoth pdfjs-dist`

`validateUpload` 检查 `file.size`、PDF 魔数 `%PDF-`、DOCX ZIP 魔数 `PK\x03\x04`，并根据扩展名与魔数一致性拒绝伪造文件。`extractDocument` 用 `mammoth.extractRawText({ buffer })` 处理 DOCX；用 `pdfjs-dist/legacy/build/pdf.mjs` 的 `getDocument({ data: new Uint8Array(buffer) })` 逐页调用 `getTextContent()`，拒绝超过十页的 PDF。每页非空文字组成 `{ id: 'p{page}-b1', text, page }`，DOCX 组成 `{ id: 'docx-b1', text, page: null }`。

`buildFacts` 以每个来源块建立可编辑原文；只用明确模式预填姓名、邮箱、电话，其他教育、经历、技能初始为空并由用户核对填写，避免将文本猜测为事实。

- [ ] **步骤 4：接入 `POST /api/extract`，并测试缺字段、伪造文件、超限文件和有效 DOCX。**

```js
const response = await postMultipart(server, '/api/extract', 'resume', validDocxBuffer, 'resume.docx');
assert.equal(response.status, 200);
assert.match((await response.json()).facts.sourceBlocks[0].text, /项目经历/);
```

- [ ] **步骤 5：运行文档相关测试并确认通过。**

运行：`node --test tests/document-validation.test.mjs tests/extract-document.test.mjs tests/extract-api.test.mjs`

预期：所有 PDF、DOCX 与拒绝场景通过。

- [ ] **步骤 6：提交本任务。**

```powershell
git add package.json package-lock.json server tests/document-validation.test.mjs tests/extract-document.test.mjs tests/extract-api.test.mjs
git commit -m "feat: extract and validate resume documents"
```

### Task 3：实现三家模型适配器和优化结果校验

**文件：**
- 新建：`server/providers/index.js`
- 新建：`server/providers/openai.js`
- 新建：`server/providers/compatible-chat.js`
- 新建：`server/prompt.js`
- 新建：`server/resume-validation.js`
- 修改：`server/app.js`
- 测试：`tests/providers.test.mjs`
- 测试：`tests/resume-validation.test.mjs`
- 测试：`tests/optimize-api.test.mjs`

**接口：**
- 提供：`createProvider(config, fetchImpl): { generateResume(input): Promise<OptimizedResume> }`
- 提供：`validateOptimizedResume(value, facts, provider, model): OptimizedResume`
- 路由：`POST /api/optimize` 接收 `{ facts, targetRole }` 并返回 `{ resume }`。

- [ ] **步骤 1：编写适配器选择、请求隔离和来源校验的失败测试。**

```js
test('uses the Responses API with storage disabled for OpenAI', async () => {
  const fetchImpl = captureJsonResponse(validModelJson);
  await createProvider(openAiConfig, fetchImpl).generateResume(input);
  assert.equal(fetchImpl.calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(fetchImpl.calls[0].body.store, false);
});

test('uses the OpenAI-compatible chat endpoint for DeepSeek and Qwen', async () => {
  assert.match(createProvider(deepSeekConfig, fakeFetch).endpoint, /api\.deepseek\.com\/chat\/completions/);
  assert.match(createProvider(qwenConfig, fakeFetch).endpoint, /dashscope\.aliyuncs\.com\/compatible-mode\/v1\/chat\/completions/);
});

test('rejects generated bullets that cite a source outside the facts', () => {
  assert.throws(() => validateOptimizedResume({ ...validResume, sections: [{ ...validResume.sections[0], entries: [{ ...validResume.sections[0].entries[0], sourceIds: ['unknown'] }] }] }, facts, 'openai', 'model-x'), /来源/);
});
```

- [ ] **步骤 2：运行测试，确认适配器模块不存在。**

运行：`node --test tests/providers.test.mjs tests/resume-validation.test.mjs`

预期：失败信息包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **步骤 3：实现统一提示词、适配器和严格校验。**

`buildResumePrompt({ facts, targetRole })` 必须包含“只使用下方事实”“不得新增数字、日期、公司、学历、技能或职责”“每条 entry 提供 sourceIds”，并把所有 `sourceBlocks` 作为可引用材料。OpenAI 适配器调用 Responses API，使用 JSON Schema 输出格式与 `store: false`；DeepSeek 和通义适配器调用各自 OpenAI 兼容的 Chat Completions 地址，设置 `response_format: { type: 'json_object' }`。

```js
export function createProvider(config, fetchImpl = fetch) {
  if (!config.configured) throw new AppError(503, 'provider_unconfigured', '当前 AI 服务尚未配置。');
  if (config.provider === 'openai') return createOpenAiProvider(config, fetchImpl);
  return createCompatibleChatProvider(config, fetchImpl, providerEndpoints[config.provider]);
}
```

`validateOptimizedResume` 必须检查 JSON 类型、非空 `targetRole`、段落与 bullet 数组、所有 `sourceIds` 都存在于 `facts.sourceBlocks`、所有字符串长度上限，以及 provider/model 只由服务端配置赋值。上游 HTTP 非 2xx、JSON 解析失败和模型拒答要转换为不暴露密钥的 502 错误。

- [ ] **步骤 4：接入优化路由并测试 503、模型 502、成功归一化和非法来源。**

```js
const response = await postJson(server, '/api/optimize', { facts, targetRole: '产品助理' });
assert.equal(response.status, 200);
assert.equal((await response.json()).resume.provider, 'deepseek');
```

- [ ] **步骤 5：运行模型相关测试并确认通过。**

运行：`node --test tests/providers.test.mjs tests/resume-validation.test.mjs tests/optimize-api.test.mjs`

预期：全部通过，且不需要真实 API 密钥或联网。

- [ ] **步骤 6：提交本任务。**

```powershell
git add server tests/providers.test.mjs tests/resume-validation.test.mjs tests/optimize-api.test.mjs
git commit -m "feat: add switchable AI resume providers"
```

### Task 4：生成嵌入中文字体的固定模板 PDF

**文件：**
- 新建：`server/export-pdf.js`
- 修改：`server/app.js`
- 修改：`package.json`
- 测试：`tests/export-pdf.test.mjs`
- 测试：`tests/export-api.test.mjs`

**接口：**
- 提供：`exportPdf({ facts, resume }): Promise<Buffer>`
- 路由：`POST /api/export` 返回 `application/pdf`，并带 `Content-Disposition: attachment; filename="optimized-resume.pdf"`。

- [ ] **步骤 1：编写 PDF 二进制、中文内容路径和下载响应的失败测试。**

```js
test('creates a non-empty PDF from reviewed Chinese resume data', async () => {
  const pdf = await exportPdf({ facts, resume: validResume });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 2_000);
});

test('exports an attachment rather than JSON', async () => {
  const response = await postJson(server, '/api/export', { facts, resume: validResume });
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition'), /attachment/);
});
```

- [ ] **步骤 2：运行测试，确认导出模块不存在。**

运行：`node --test tests/export-pdf.test.mjs tests/export-api.test.mjs`

预期：失败信息包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **步骤 3：添加 PDFKit 并生成固定模板。**

安装：`npm install pdfkit`

从 `@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff` 加载并嵌入字体；使用 A4、50pt 页边距、姓名和联系方式页首、目标岗位和摘要、各 section/entry/bullet 正文。每次写入前检查当前 `doc.y`；接近页底时调用 `doc.addPage()`，避免文本截断。使用内存数组收集 `data` 事件后返回 `Buffer.concat(chunks)`，不写临时文件。

- [ ] **步骤 4：在路由中先调用 `validateOptimizedResume`，再导出。**

无效或与事实不匹配的简历返回 400，不调用 PDF 生成器。成功时设置下载响应头并发送 Buffer。

- [ ] **步骤 5：运行导出测试并确认通过。**

运行：`node --test tests/export-pdf.test.mjs tests/export-api.test.mjs`

预期：PDF 签名、文件大小和附件响应均通过。

- [ ] **步骤 6：提交本任务。**

```powershell
git add package.json package-lock.json server/export-pdf.js server/app.js tests/export-pdf.test.mjs tests/export-api.test.mjs
git commit -m "feat: export optimized resumes as PDF"
```

### Task 5：将真实处理流程接入现有 React 页面

**文件：**
- 新建：`src/api.js`
- 新建：`src/resume-state.js`
- 修改：`src/App.jsx`
- 修改：`src/styles.css`
- 测试：`tests/resume-state.test.mjs`
- 测试：`tests/api.test.mjs`

**接口：**
- 提供：`extractResume(file)`、`getApiConfig()`、`optimizeResume(facts, targetRole)`、`downloadResume(facts, resume)`。
- 提供：`draftToFacts(draft): ResumeFacts` 和 `factsToDraft(facts): FormDraft`。
- 消费：`App` 通过 `status: 'idle' | 'extracting' | 'reviewing' | 'optimizing' | 'ready' | 'error'` 控制弹窗。

- [ ] **步骤 1：先写在线填写转换和 API 错误传播的失败测试。**

```js
test('turns the online experience into a source-linked fact', () => {
  const facts = draftToFacts({ name: '李思', school: '北京大学', major: '计算机', role: '产品助理', experience: '负责用户访谈' });
  assert.deepEqual(facts.experiences[0].sourceIds, ['form-b1']);
  assert.equal(facts.sourceBlocks[0].text, '负责用户访谈');
});

test('shows the server message for a failed extraction', async () => {
  await assert.rejects(() => extractResume(new File(['x'], 'resume.pdf')), /扫描型 PDF/);
});
```

- [ ] **步骤 2：运行测试，确认客户端模块不存在。**

运行：`node --test tests/resume-state.test.mjs tests/api.test.mjs`

预期：失败信息包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **步骤 3：实现 API 客户端和事实状态转换。**

`src/api.js` 用 `FormData` 向 `/api/extract` 上传文件，用 JSON 调用优化/导出接口；所有非 2xx 响应读取 `{ error: { message } }` 后抛出该中文消息。下载时将 PDF Blob 创建为临时 Object URL，点击带 `download="优化简历.pdf"` 的链接后释放 URL。

`src/resume-state.js` 把现有填写表单变为 `ResumeFacts`，每项用户输入使用确定的来源 ID（`form-b1`、`form-b2` 等），避免 AI 结果无来源可追溯。

- [ ] **步骤 4：替换预览流程为真实状态流程。**

文件选择成功后立即调用 `extractResume`，弹窗显示“正在识别简历”；成功后展示姓名、联系方式、教育、经历、技能和原文片段的可编辑字段。在线填写核对完成后直接转为事实核对。用户填写目标岗位后仅在 `/api/config` 返回 `configured: true` 时允许“开始优化”；否则展示当前供应商未配置的说明。优化成功后展示摘要、分段条目和“下载 PDF”，失败时保留事实与输入内容供重试。

删除 `src/App.jsx` 中“文件尚未上传或解析”“尚未接入 AI 修改”的旧文案，但保留“刷新页面将清空”和扫描 PDF 暂不支持提示。新增状态文案和可编辑列表样式，延续现有黑色、低饱和、无卡片堆叠视觉。

- [ ] **步骤 5：运行客户端单元测试、生产构建和现有站点测试。**

运行：`node --test tests/resume-state.test.mjs tests/api.test.mjs tests/intake.test.mjs tests/sites-worker.test.mjs; npm run build`

预期：所有测试通过，且构建输出包含 `dist/client/index.html`、`dist/server/index.js`、`dist/.openai/hosting.json`。

- [ ] **步骤 6：提交本任务。**

```powershell
git add src tests/resume-state.test.mjs tests/api.test.mjs
git commit -m "feat: connect resume UI to processing API"
```

### Task 6：补齐运行说明并进行端到端验证

**文件：**
- 修改：`README.md`
- 修改：`docs/AI与文档识别接入规划.md`
- 修改：`design-qa.md`
- 测试：`tests/full-flow.test.mjs`

**接口：**
- 消费：`createApp`、真实 `extractDocument`、注入的假模型适配器和 `exportPdf`。
- 提供：完整的无密钥本地回归测试；真实供应商连接只在手动配置密钥后执行。

- [ ] **步骤 1：编写从 DOCX 到优化再到 PDF 的失败端到端测试。**

```js
test('processes confirmed facts through a provider adapter and exports a PDF', async () => {
  const facts = await extractFixtureDocx();
  const optimized = await optimizeWithFixtureProvider(facts, '产品助理');
  const pdf = await exportPdf({ facts, resume: optimized });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
```

- [ ] **步骤 2：运行测试，确认在完整链路接通前失败。**

运行：`node --test tests/full-flow.test.mjs`

预期：在未完成实现前因缺失路径或断言失败。

- [ ] **步骤 3：更新文档。**

README 说明 `npm ci`、复制 `.env.example` 到 `.env`、设置一家供应商密钥、运行 `npm run dev:full`，并列出全部 API 与 10 MB/十页/扫描件限制。明确 Vite/Worker 静态托管不能承载 Node 处理服务，生产需部署独立 Node 进程。将旧规划文档的“尚未实现”状态更新为已实现的功能与仍待完成的 OCR、账号、持久化；design QA 增加识别、未配置供应商、优化失败和 PDF 下载的浏览器验证记录。

- [ ] **步骤 4：运行完整验证。**

运行：`npm test; npm run build; npm run test:sites`

预期：全部测试通过，Vite 构建退出码为 0，站点打包文件完整。

- [ ] **步骤 5：启动本地服务并进行浏览器验证。**

运行：`npm run dev:full`

在浏览器中检查：上传合法 DOCX 后进入事实核对；未配置密钥时不能启动优化且显示原因；填入有效测试密钥并使用授权测试材料后可以预览优化结果、下载 PDF；移动宽度下无水平溢出。

- [ ] **步骤 6：提交本任务。**

```powershell
git add README.md docs design-qa.md tests/full-flow.test.mjs
git commit -m "docs: document resume processing workflow"
```
