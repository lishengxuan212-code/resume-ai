# 简历优化器

这是一个黑色 OFFER 首页与本地简历处理服务。用户上传文字型 PDF 或 DOCX 后，可核对提取的事实、选择目标岗位、调用一个已配置的模型服务生成来源可追溯的简历内容，并下载固定中文模板的 PDF。

页面中的材料和生成结果只保留在浏览器内存中，刷新页面会清空。服务端在请求处理期间使用内存上传和内存 PDF 缓冲，不提供账号、历史记录或持久化存储。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```sh
npm ci
cp .env.example .env
```

在 `.env` 选择并配置**一家**服务商：设置 `AI_PROVIDER` 为 `openai`、`deepseek` 或 `qwen`，再填写该服务商对应的 key 和 model。例如选择 OpenAI 时填写 `OPENAI_API_KEY` 与 `OPENAI_MODEL`；选择 DeepSeek 或通义千问时填写各自的 `*_API_KEY` 与 `*_MODEL`。

```sh
npm run dev:full
```

该命令同时启动 Vite 页面和 Node API 服务；Node 会通过 `--env-file=.env` 读取刚才创建的配置，开发时 Vite 会把 `/api` 转发给本地 Node 服务。供应商密钥只存在于 Node 服务的环境变量中，浏览器代码不会读取它们。不要把密钥提交到 Git，也不要将密钥粘贴到聊天、Issue 或截图中。

## 当前功能与边界

- 支持文字型 PDF 和 DOCX；单文件最大 10 MB，PDF 最多 10 页。
- 扫描型或没有可提取文字的 PDF 暂不支持；用户可改用带文字的文件或在线填写。
- 上传后先核对事实和来源片段。生成内容必须引用这些来源，但投递前仍必须由用户核对事实。
- 支持 OpenAI、DeepSeek、通义千问三家服务商，运行时只启用其中一家。生成成功与否取决于该服务的可用性及本地配置。
- PDF 采用固定中文模板导出，响应以附件方式下载。
- 账号、持久化存储、OCR、后台队列和真实供应商质量评估尚未实现。

## API

| 接口 | 用途 |
| --- | --- |
| `GET /api/config` | 返回当前服务商、模型和是否完成配置，不返回密钥。 |
| `POST /api/extract` | 接收 `resume` 文件字段，提取可核对的事实与来源片段。 |
| `POST /api/optimize` | 接收确认后的事实和目标岗位，返回通过来源校验的简历内容。 |
| `POST /api/export` | 接收确认后的事实与优化结果，返回 PDF 附件。 |

## 校验、构建与部署

```sh
npm test
npm run build
npm run test:sites
```

`npm test` 运行服务端、客户端状态和无密钥 DOCX→优化→PDF 回归测试；模型服务在该回归中由注入的假服务替代，因此不会使用真实 key 或网络。`npm run build` 生成 Vite/Sites 所需产物。`npm run test:sites` 只验证静态 Sites Worker 的打包行为。

Vite 和 Worker 的静态托管无法运行 Node 的文档识别、模型调用或 PDF 服务。生产环境必须部署独立的 Node 进程，并通过同域部署或正确的反向代理为前端提供 `/api`；不能只发布 `dist/client` 后期待这些接口可用。

## 主要文件

- `src/App.jsx`：首页、上传、事实核对、优化和下载流程。
- `server/`：Node API、文档提取、模型适配、结果校验和内存 PDF 导出。
- `tests/full-flow.test.mjs`：真实 DOCX 夹具、假模型服务与真实 PDF 导出的无密钥回归。
- `docs/selected-homepage.png`：已确认的首页视觉来源。
- `docs/AI与文档识别接入规划.md`：已实现能力和下一阶段事项。

字体采用 `@fontsource/noto-serif-sc`（OFL），图标采用 `@phosphor-icons/react`（MIT）。
