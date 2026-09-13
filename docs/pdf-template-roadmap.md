# 简历模板、预览与 PDF 交付规划

日期：2026-09-13  
工作分支：`codex/pdf-integration`；核查基线：`7971f55`。  
状态：待实施的产品与技术建议；本次只编写规划，未安装依赖、修改业务代码或运行测试。

## 1. 目标与判断

将已有的“事实 → 诊断 → AI 优化 → 人工编辑 → 固定 PDF”扩展为“确认内容 → 选择模板 → 查看真实分页 → 修改内容 → 下载所见版本”。核心价值是投递内容准确、中文清晰、排版稳定和预览下载一致。

保留现有事实、来源追踪、诊断、改写校验和用户确认编辑边界。新增自己的排版模型与模板注册表，不移植完整 Reactive Resume，也不要求模型生成字体、分栏或分页参数。

不能把“结构校验严格”等同于“事实绝对正确”：当前数字校验等规则仍有能力边界，继续保留用户核对。不能用“单栏”或某个引擎直接承诺 ATS 安全。不同招聘系统兼容性需用实际投递系统验证。

PDFKit 可以承载多个模板，现有困难是样式和排版集中在一个文件，并非库本身禁止多模板。React PDF 是候选方案，先验证中文字体、分页、运行方式和成本，再决定切换。第一版不立即删除旧导出实现。

## 2. 已核查代码

| 位置 | 已确认行为 | 对本次的影响 |
| --- | --- | --- |
| `server/prompt.js` | AI 输出包含 sections、entries、标题和正文；section 没有 type | 需要兼容扩展内容协议 |
| `server/resume-validation.js` | 依赖 heading 判断技能、教育及部分校验条件；清洗后只返回 heading/entries | 新字段必须贯穿清洗、校验和返回结果 |
| `server/app.js` | export 先校验事实和结果，允许最终页确认后的编辑；随后调用 exportPdf | 新预览和导出必须共用这一校验边界 |
| `server/export-pdf.js` | PDFKit、A4、固定字体和边距，技能按 heading 特判 | 抽离语义模型、模板配置与渲染器 |
| `src/ResultPage.jsx` | 全页编辑；标题影响技能展示；修改基本信息和结果 | 保持编辑功能，增加独立排版预览 |
| `src/api.js` | export 响应直接转 Blob 下载，随后释放 URL | 拆分“请求 PDF”和“下载已有 PDF” |
| `package.json` | React 19.2、Node 原生 ESM 直接运行 server；已有 pdfjs-dist | 验证 renderer 兼容；Node 不能直接加载 JSX |

## 3. 首版范围

### 第一轮可交付版本

- 一个中文单栏 Classic 模板，A4，白纸深色文字。
- 真实 PDF 预览，全部页面可查看，页数、缩放、更新状态明确。
- 内容仍在现有编辑区修改；模板切换、预览、下载均不调用 AI。
- 下载与当前预览使用相同 PDF Blob；没有最新有效预览时先生成最新版本。
- 保留固定的“技能”模块名、“小标题：正文”技能格式；简历提醒、来源编号和方法论编号不进入正式稿。
- 联系方式继续使用完整原始字符串，不新增手机号、邮箱、地址等必填字段。

### 后续轮次

1. 第二个 Modern 单栏模板：验证模板接口能复用，而不是仅仅换主题色。
2. 紧凑单栏模板：单独验收跨页阅读顺序、长联系方式和长段落换行。
3. 确有需求后再做章节排序、隐藏、有限密度选项和联系方式结构化。

本轮不扩展账号、历史版本、OCR、外部 PDF SaaS、自定义 CSS、任意字体上传、拖拽自由排版、自动压到一页，也不开展整套 Reactive Resume 模板迁移。

## 4. 用户流程与界面

AI 生成成功 → 原有全页结果核对 → 打开“排版预览” → 默认 Classic → 编辑并查看更新 → 下载 PDF。

- 宽屏可在同一结果工作区展开编辑/预览双栏；保留原有顶部、分区编辑入口和全局编辑状态。
- 窄屏采用“编辑内容 / 排版预览”切换，避免压缩成不可读的三栏。正式断点由实际内容宽度验收确定。
- 预览显示白色 A4 页面、真实页数、缩放及“正在更新预览”状态；不将普通网页卡片冒充最终纸面。
- 保留现有确认导出的等待蒙层。自动预览更新只使用预览区局部状态，否则每次编辑都会被遮罩打断。这是建议新增的交互区别，需要在实现时写入项目约定。
- 内容过长自然续页，提醒页数但不自动删除内容或缩小到不可读字号。
- 首版只开放模板选择和缩放；颜色、字体和密度先使用经过验证的模板预设。

## 5. 数据与职责

```text
facts：事实和来源
    ↓ 诊断、AI 优化、用户编辑
resume：正式内容，保留追踪元数据
    ↓ 服务端校验 + toRenderResume
RenderResume：仅正式稿可见内容
    ↓ templateId + 模板版本 + 字体预设
服务端 PDF renderer
    ↓
PDF Blob → PDF.js 预览 / 下载同一 Blob
```

采用一个 `toRenderResume(facts, resume)` 适配器即可，不再额外堆叠多个没有不同职责的 Normalizer/Adapter。协议放在 `shared/resume/`，前后端都可导入纯 JavaScript；UI 保留在 `src/`。

建议最小模型：

```js
{
  schemaVersion: 1,
  basics: { name: '张三', headline: '产品助理', contactText: '电话 / 邮箱' },
  summary: '已确认的个人概述',
  sections: [{
    id: 'section-a',
    type: 'experience',
    title: '实习经历',
    items: [{
      id: 'entry-a',
      title: '产品实习生',
      organization: '示例公司',
      period: '2025.03 - 2025.08',
      bullets: [{ id: 'bullet-a', title: '需求整理', text: '经用户确认的正文' }]
    }]
  }]
}
```

规则：

- 最小类型集为 experience、education、project、skills、campus、award、certificate、custom。
- type 表示语义，title/heading 是用户可见名称；改标题不改变 type。
- id 由应用在接收/迁移内容时分配一次，后续编辑保留；不让 AI 生成，不以用户可编辑标题或数组下标作为长期标识。相同类型可以出现多个 section。
- 技能仍保留 items/bullets 的统一外形，模板根据 type 直接渲染所有技能 bullet，隐藏泛化的 entry 元信息。
- 旧教育条目可能把专业、学历组合在 title 中。初版完整保留，不根据文字重新猜测结构。
- 联系方式整串保留，允许视觉换行，不擅自拆字段或重新排序。
- 不把 sourceIds、ruleIds、warnings、omissions、provider、model 映射进 RenderResume；这些继续留在内容层。必须先校验再映射，剥离字段不等于跳过校验。
- 缺少选填内容时不输出“未填写”“待补充”；保留有内容但无法识别类型的章节。
- 页数、分栏位置、字号、字体等均属于模板配置，不进入 AI 输出。

## 6. 旧数据迁移

1. 服务端先兼容新旧内容：旧版本没有 type 时，只在兼容入口按明确的标题别名映射，无法确定时使用 custom，不猜“相关经历”究竟是哪种经历。
2. 增加独立 `contentSchemaVersion: 2`；它与现有 methodologyVersion、排版 schemaVersion 各司其职。
3. 新版本 AI Schema 要求合法 type；未知枚举、新协议缺失 type、明显的技能标题/type 冲突均返回可读错误或走既有生成修复预算，不能以新类型绕过原有技能限制。
4. 同步修改 prompt、resume-validation、ResultPage、export 输入校验，保证清洗函数不丢失 type/id/version。
5. 教育空 bullets、技能标签及熟练度限制等由类型驱动；旧数据仅经过一次别名兼容，禁止模板重复维护标题猜测。
6. 保留现有来源、规则、歧义数字校验以及总计最多三次生成尝试；增加字段不获得新的重试预算。

迁移不能静默重排、遗漏、合并同类章节；自定义标题仍可编辑。若未来开放用户修改模块类型，需要单独定义校验边界。

## 7. 渲染与预览策略

### 引擎验证

候选为 `@react-pdf/renderer`。用虚构内容先验证：中文/英文混排、罕见姓名用字、数字标点、粗体、长行、1—3 页内容、跨页标题及段落。检查当前 React 19 与 Node 版本是否被所选版本支持，锁定安装版本后记录结果。

字体从随项目部署的资源读取；核查现有 Noto 字体子集覆盖和粗体资源，不假定网页显示正常就表示导出字形齐全。PDF 预览和下载必须使用同一字体资产版本。

单条长经历允许分拆跨页；不能给整段经历一律设置 wrap=false。章节标题和条目标题尽量与后续正文共同出现；超过单页高度的内容必须可继续分页。

初版 renderer 使用 Node 可直接导入的 `.js` 与 `React.createElement`，将共享渲染组件限制为少量小模块。若以后改 JSX，再单独增加服务端编译入口；不能直接在现有 `node server/index.js` 启动链中导入 `.jsx`。

### 同一产物预览与下载

复用 `/api/export` 作为 PDF 生成端点，由前端决定预览还是下载；首版不增加服务端文件存储或公开 PDF URL。

请求在原有 facts/resume 之外增加 `templateId`；省略时回到当前兼容导出路径，显式指定但未知的模板返回 400，不能悄悄替换成另一个模板。提供独立模板清单接口，列出服务端实际启用的模板和版本；字体及布局使用模板的固定预设。

前端将导出拆为 `requestResumePdf(facts, resume, { templateId, signal }) → Promise<Blob>` 和 `saveResumePdf(blob)`，预览也使用该 Blob。无需浏览器调用外部 AI 或 PDF 服务。

- 编辑结束/停止输入约 700ms 后提交；中文输入法组合输入期间不触发。这是初始交互参数，后续按实测调整。
- 每次内容、模板变化增加本地 revision，保留一个在途请求及一个最新待处理快照，避免按每个键击堆积渲染。
- 响应只在对应 revision 仍为最新时应用。取消 fetch 不代表服务端 CPU 渲染已停止，不能依赖取消请求解决并发成本。
- 下载仅使用与当前 revision 一致的有效 Blob；旧预览更新中点击下载，等待最新结果，不能下载旧文件。
- 输入暂时为空或其他无效编辑时，保留编辑内容，标明预览尚未更新，禁止把旧版标成当前稿。
- 预览失败显示局部错误及重试，保留已编辑内容；下载失败退出现有等待蒙层。
- 使用现有 pdfjs-dist 的浏览器构建和同版本本地 worker 展示页面；支持文本层、缩放和懒加载多页。Canvas 仅用于显示，下载仍是原始 PDF，不能下载页面截图。
- 替换预览/离开页面时释放 Blob URL、PDF.js 文档与渲染任务。服务端 PDF 响应设为 Cache-Control: no-store。
- 试用前记录峰值内存、单份耗时和同用户快速编辑的请求量；确定并发上限和超时。若需要真正中断渲染，使用独立 worker 并终止任务，不能只用 Promise 超时假装结束 CPU 工作。

## 8. 分阶段任务与交付

| 阶段 | 修改范围 | 可验收交付 | 进入下一阶段的条件 |
| --- | --- | --- | --- |
| A：内容协议与适配 | 新增 shared/resume/section-types.js、to-render-resume.js；修改 prompt、validation、结果编辑 | 新旧简历都可生成排版模型 | 改标题不改类型；来源不丢；custom 不被遗漏；技能规则不被绕过 |
| B：Classic 技术验证 | 新增 server/render/fonts.js、templates/classic.js、render-pdf.js；按需加入依赖 | 一个完整中文单栏 PDF 样本集 | 无缺字、截断、空白首页；内容可提取；长条目能续页；部署方式可运行 |
| C：模板化导出 | 新增模板 registry、修改 app.js 导出校验及元数据接口 | templateId=classic 可通过原 API 导出；旧路径保留 | 编辑后内容正确；未知模板拒绝；简历提醒与内部代码不进入 PDF |
| D：真实预览闭环 | 新增 src/ResumePreview.jsx、src/useResumePreview.js；修改 src/api.js、ResultPage、App、styles | 编辑、预览、下载形成完整用户流程 | 连续编辑不会展示旧结果；下载与预览一致；桌面和手机均可完成 |
| E：模板选择与回归 | 新增 `minimal.js`、`sidebar.js` 与模板选择 UI | 经典、简约、紧凑三种单栏密度 | 切换不改内容、不触发 AI；每种模板都完整覆盖内容并允许自然分页 |
| F：试用与扩展 | 更新 README、design-qa；按试用结果迭代 | 试用证据与是否上线的判断 | 中文质量、响应与成本可接受；再决定双栏及去除旧 PDFKit |

A 与 B 都应先完成，再将新引擎接到默认用户路径。首个交付终点是 D，不要把三模板全部完成作为第一个可用版本的前提。

候选目录：

```text
shared/resume/section-types.js
shared/resume/to-render-resume.js
server/render/fonts.js
server/render/registry.js
server/render/render-pdf.js
server/render/shared.js
server/render/templates/classic.js
server/render/templates/minimal.js
server/render/templates/sidebar.js
src/ResumePreview.jsx
src/useResumePreview.js
```

不预先建设通用 CSS 引擎、插件系统、数据库 schema 或为每个空类型建一个文件。存在真实布局差异时再拆出对应组件。

## 9. 验收清单

这些是未来实施的验收要求，本次未运行测试，也未获得新验证结果。

- 数据：旧 heading、新 type、自定义标题、同类多章节、空教育 bullets、技能、最终页编辑均保持内容和顺序。
- 正式稿：无来源编号、规则编号、生成提醒、占位词；所有可投递内容可通过 PDF 文本提取复核。
- 排版：中文与中英混排、长名称/联系方式、罕见用字、多段经历、页末标题、超长条目都可完整显示；自动多页无裁切。
- 用户流程：改字、输入法输入、快速连改、切模板、生成失败、失败重试、预览更新中下载均有确定行为。
- 一致性：下载复用当前预览 Blob；内容变化后旧 Blob 不能作为最新下载；模板变化不调用 AI。
- 环境：依赖锁定，字体离线可读，Node 启动可运行，预览 worker 无 CDN 依赖；不把 Node 渲染能力误认为静态 Worker 自带能力。
- 回归：实施阶段围绕改动运行数据适配、导出 API、PDF 文本与视觉检查、浏览器关键流程；发布前再按项目约定进行构建与 Sites 打包检查。既有 223 条测试的历史记录不能代替本次改动验证。

## 10. 待验证信息与参考

已确认：React PDF 官方文档提供 Node renderToBuffer、分页控制、字体注册和浏览器 Blob 生成能力。这只证明可选技术接口存在，不证明本项目中的中文质量与性能已达标。

- Node 接口：https://react-pdf.org/docs/v4/node
- 分页：https://react-pdf.org/docs/v4/advanced/page-wrapping
- 字体：https://react-pdf.org/docs/v4/fonts
- 浏览器生成：https://react-pdf.org/docs/v4/advanced/on-the-fly-rendering
- Reactive Resume 官方仓库：https://github.com/reactive-resume/reactive-resume

提供材料中的 `@reactive-resume/pdf` 为 private、workspace 依赖以及 Onyx 内部上下文结构，本次未成功读取对应文件，不能当作已核实的当前事实；若后续实际复用代码，固定上游提交后核查依赖及随代码的许可声明。当前计划不依赖这些未经核实的内部实现判断。

首版采用单栏并不宣称兼容所有招聘系统。双栏模板和具体配色未被当作已批准视觉稿；如要改变现有工作区视觉层级，应先提供与当前宽版结果页相容的具体设计供确认。
