# 简历识别与多模型切换设计

## 目标

将 PDF/DOCX 简历或在线填写内容转为用户可核对的事实，再生成 AI 优化后的中文简历，并下载固定模板的 PDF。服务端通过配置支持 OpenAI、DeepSeek 与阿里云通义千问三家模型服务。

## 本次范围

本版支持 10 MB 以内、最多 10 页的文字型 PDF 与 DOCX，不支持扫描件 OCR、账号体系、跨浏览器历史记录、后台任务队列和个人资料持久化保存。处理状态和简历内容仅在当前浏览器会话内保存；服务端只在处理请求时读取材料，不把上传文件写入磁盘。

## 用户流程

1. 用户上传一份 PDF/DOCX，或完成已有的在线填写表单。
2. 前端将材料发送至服务端，并展示真实的识别中状态。
3. 服务端验证文件类型、大小和文档结构，提取文本，返回可编辑事实、原文片段与识别告警。
4. 用户核对或修改事实，并填写目标岗位。
5. 服务端将已确认事实和目标岗位交给当前启用的模型服务，校验结构化结果后返回带来源标记的优化简历。
6. 用户查看生成结果，下载固定模板的中文 PDF。

## 架构

在 Vite 前端之外增加 Node HTTP 服务，开发与生产环境均由该服务提供 `/api` 接口。前端只调用同域接口；供应商密钥和 `AI_PROVIDER` 只存在于服务端环境变量中。业务层只使用 `generateResume(input)` 这一统一模型接口，OpenAI、DeepSeek 和通义千问各自通过适配器处理请求格式和响应格式差异。

第一版采用同步请求处理：识别和优化在同一个 HTTP 请求内返回结果，不接入队列。这个方案只适用于十页以内、单文件的 MVP；失败后用户可直接重试，浏览器内的已核对事实不会丢失。

## 数据结构

`ResumeFacts` 表示用户材料中的事实：

```js
{
  name: string,
  contact: string,
  education: [{ school: string, major: string, degree: string, dates: string, sourceIds: string[] }],
  experiences: [{ title: string, organization: string, dates: string, description: string, sourceIds: string[] }],
  skills: string[],
  sourceBlocks: [{ id: string, text: string, page: number | null }],
  warnings: string[]
}
```

`OptimizedResume` 表示可展示与导出的优化结果：

```js
{
  summary: string,
  targetRole: string,
  sections: [{ heading: string, entries: [{ title: string, organization: string, dates: string, bullets: string[], sourceIds: string[] }] }],
  provider: 'openai' | 'deepseek' | 'qwen',
  model: string
}
```

模型只能重组和清晰表达用户已确认的事实，不得编造指标、公司、学历、日期、技能或职责。每一条生成内容必须关联至少一个 `sourceId`；服务端拒绝不符合这一结构的模型结果，不能直接展示为简历。

## HTTP 接口

| 方法与路径 | 请求 | 成功响应 |
|---|---|---|
| `POST /api/extract` | multipart 字段 `resume` | `{ facts: ResumeFacts }` |
| `POST /api/optimize` | `{ facts: ResumeFacts, targetRole: string }` | `{ resume: OptimizedResume }` |
| `POST /api/export` | `{ facts: ResumeFacts, resume: OptimizedResume }` | PDF 附件 |
| `GET /api/config` | 无 | `{ provider, model, configured }` |

`/api/extract` 必须明确拒绝空文件、超限文件、不支持的格式、加密文件、损坏文件和没有可提取文字的文件。DOCX 使用原始文本提取；PDF 提取时保留页码，以便原文可追溯。前端需明确提示扫描型 PDF 暂不支持。

## 模型供应商配置

每次部署只启用一家供应商，由环境变量切换：

```ini
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini

# 可切换为以下服务
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat
QWEN_API_KEY=...
QWEN_MODEL=qwen-plus
```

启用的供应商必须具有对应 API 密钥。供应商名称无效或密钥未配置时，接口返回 `503` 配置错误。界面只展示当前供应商名称，绝不展示密钥。模型名称可通过环境变量调整，因为各家模型目录会变化。

## 安全与隐私约束

- 前端与服务端都验证：单文件、PDF/DOCX、最大 10 MB、PDF 最多 10 页。
- 不得将用户文件名用作服务器路径；普通日志不得记录完整简历、联系方式、API 密钥或完整模型响应。
- 提取文本、岗位描述和模型输出均是不可信输入，不能改变服务端指令，也不能以 HTML 方式插入页面。
- 本版不在文件、数据库、分析平台或普通日志中持久化个人资料。调用 OpenAI Responses API 时显式传入 `store: false`；其他供应商的数据保留规则需在上线配置前按其最新条款复核并告知用户。
- 不得伪造识别、优化或导出成功；未配置服务或处理失败时，应清晰说明原因。

## 界面要求

用户未开始操作时，保留已确认的黑色 OFFER 首页。用户提交材料后，沿用现有弹窗的语言和视觉风格，依次展示：识别中、可编辑事实核对、目标岗位输入、优化中、优化简历预览和 PDF 下载。对应后端能力接入后，删除界面中“仅前端预览”的旧文案；保留不支持文件和未配置 AI 服务的提示。

## 验收条件

- 有效的文字型 PDF 和 DOCX 均能返回原文片段与可编辑事实；不支持、空、超限和无文字文件均有明确失败结果。
- 修改 `AI_PROVIDER` 可切换 OpenAI、DeepSeek 或通义千问，无需改动前端源码。
- 每个供应商适配器独立构造请求，并将成功响应统一转换为 `OptimizedResume`。
- 服务端拒绝缺少来源标记或包含不支持结构的数据。
- 优化简历可以下载为非空 PDF，内容来自已核对的简历信息。
- 单元测试覆盖文件校验、供应商选择、模型响应校验和 PDF 生成；接口测试覆盖识别、配置错误、模型适配失败和导出。
