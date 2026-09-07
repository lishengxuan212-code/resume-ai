# 简历首页前端预览

按本轮确认的黑色、磨砂 OFFER 首页制作。包含独立 OFFER 素材、中文艺术标题、4 秒/±6px 呼吸动画、手机断点、文件选择/拖放、经历填写与核对弹窗。

**当前状态：用户已确认首页初稿，正在规划真实文件识别与 AI 接入。** 前端代码已输出构建产物；当前环境自动浏览器预览受阻，不能把用户认可等同于自动化 QA 通过。详见 design-qa.md。

下一阶段方案见 [AI与文档识别接入规划](docs/AI与文档识别接入规划.md)。该方案尚未实现。

## 本轮范围

- 首页与入口交互；文件只在浏览器内选择，不上传到服务器。
- 填写内容仅保留在页面内存，刷新清空。
- 未接入真实 AI、账号服务、长期保存、简历解析和 PDF 导出。
- 登录入口仅说明账号功能尚未开放，不收集登录凭证。
- 文件选择暂接受 PDF/DOCX，最大 10 MB，仅验证文件名和大小。

## 本地开发

需要 Node.js 20.19+ 或 22.12+。

```sh
npm ci
npm run dev
```

## 构建与校验

```sh
npm run build
node --test tests/intake.test.mjs tests/sites-worker.test.mjs
```

静态文件输出到 dist/client。普通静态托管平台可使用该目录作为发布目录；浏览器应通过 HTTP 服务访问，不能仅双击 index.html。项目还保留了模板的 Worker 构建支持，本轮未部署到线上。

## 文件说明

- src/App.jsx：首页与填写流程。
- src/Modal.jsx：原生对话框、关闭和焦点恢复。
- src/styles.css：视觉样式、移动适配、呼吸动画。
- src/intake.js：文件校验。
- public/assets/offer.png：生成的 OFFER 素材。
- docs/selected-homepage.png：已选示意图。
- docs/homepage-design.md：本轮视觉与动效规范。
- docs/首次开发边界.md：此前确认的整体产品边界。

字体采用 @fontsource/noto-serif-sc（OFL），图标采用 @phosphor-icons/react（MIT），依赖声明与锁文件随源码保存。
