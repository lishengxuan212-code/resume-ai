import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildFacts } from "../server/facts.js";
import { extractDocument } from "../server/extract-document.js";
import { validateOptimizeInput } from "../server/resume-validation.js";
import { docxWithParagraphs } from "./helpers/docx.mjs";
import { numberedResumePdf, expectedResponsibilities } from './helpers/positioned-pdf.mjs';
import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";

const chineseFont = fileURLToPath(new URL(
  '../node_modules/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff', import.meta.url,
));

async function pdfWithPages(texts) {
  const pdf = new PDFDocument({ autoFirstPage: false });
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  for (const text of texts) {
    pdf.addPage().fontSize(0.01);
    for (const [index, line] of (Array.isArray(text) ? text : [text]).entries()) {
      pdf.text(line, 10, 10 + index * 10, { lineBreak: false });
    }
  }
  pdf.end();
  return complete;
}

async function pdfWithOutOfOrderTextStream() {
  const pdf = new PDFDocument({ autoFirstPage: false });
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.addPage().font(chineseFont).fontSize(12);
  // PDF content streams can be written in an order different from their visual
  // position. This mirrors adjacent numbered responsibilities being swapped.
  pdf.text('5. 第五项标题', 40, 100, { lineBreak: false });
  pdf.text('6. 第六项标题', 40, 220, { lineBreak: false });
  pdf.text('第五项内容', 40, 125, { lineBreak: false });
  pdf.text('第六项内容', 40, 245, { lineBreak: false });
  pdf.end();
  return complete;
}

test('long real PDF pages split into bounded sources with page-local stable IDs', async () => {
  const buffer = await pdfWithPages(['A'.repeat(13000), 'Second page']);
  const { facts } = await extractDocument({ originalname: 'long.pdf', buffer, size: buffer.length });
  assert.deepEqual(facts.sourceBlocks.map(block => [block.id, block.page]), [['p1-b1', 1], ['p1-b2', 1], ['p2-b1', 2]]);
  assert.equal(facts.sourceBlocks.filter(block => block.page === 1).map(block => block.text).join(''), 'A'.repeat(13000));
  assert.doesNotThrow(() => validateOptimizeInput({ facts, targetRole: '产品助理' }));
});

test('PDF enforces source count across pages, not separately per page', async () => {
  const buffer = await pdfWithPages(Array.from({ length: 8 }, () => 'A'.repeat(36001)));
  await assert.rejects(extractDocument({ originalname: 'long.pdf', buffer, size: buffer.length }),
    error => error.status === 400 && error.code === 'document_too_long');
});

test('PDF preserves parser line endings for structured resume extraction', async () => {
  const buffer = await pdfWithPages([['A'.repeat(7000), 'B'.repeat(6000)]]);
  const { facts } = await extractDocument({ originalname: 'lines.pdf', buffer, size: buffer.length });
  assert.equal(facts.sourceBlocks[0].text.trim(), 'A'.repeat(7000));
  assert.equal(facts.sourceBlocks[1].text.trim(), 'B'.repeat(6000));
  assert.match(facts.sourceBlocks.map(block => block.text).join(''), /^A{7000}\s+B{6000}$/);
  assert.doesNotThrow(() => validateOptimizeInput({ facts, targetRole: '产品助理' }));
});

test('PDF restores visual top-to-bottom order when its text stream is out of order', async () => {
  const buffer = await pdfWithOutOfOrderTextStream();
  const { facts } = await extractDocument({ originalname: 'positioned.pdf', buffer, size: buffer.length });
  const text = facts.sourceBlocks.map(block => block.text).join('\n');
  assert.deepEqual(text.split('\n'), ['5. 第五项标题', '第五项内容', '6. 第六项标题', '第六项内容']);
});

test('PDF keeps adjacent numbered responsibilities with their own bodies in reviewed work facts', async () => {
  const buffer = await numberedResumePdf();
  const { facts } = await extractDocument({ originalname: 'numbered.pdf', buffer, size: buffer.length });
  assert.equal(facts.experiences.length, 1);
  assert.deepEqual(facts.experiences[0], {
    title: '产品运营', organization: '示例公司', dates: '2023.04-至今',
    description: expectedResponsibilities, sourceIds: ['p1-b1'],
  });
  assert.match(facts.sourceBlocks[0].text, /负责会员体系。\n第五项的补充说明。/);
  assert.doesNotThrow(() => validateOptimizeInput({ facts, targetRole: '产品运营' }));
});

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

for (const [label, paragraphs] of [
  ['paragraph boundaries', ['甲'.repeat(7000), '乙'.repeat(6000), '结尾']],
  ['a single overlong paragraph', ['甲'.repeat(24001)]],
  ['a paragraph exactly at the limit', ['甲'.repeat(12000), '乙']],
]) {
  test(`long DOCX preserves text and validates for optimization: ${label}`, async () => {
    const buffer = await docxWithParagraphs(paragraphs);
    const { facts } = await extractDocument({ originalname: 'long.docx', buffer, size: buffer.length });
    assert.ok(facts.sourceBlocks.length > 1, 'long documents must be split before review');
    assert.ok(facts.sourceBlocks.every(block => block.text.length <= 12000 && block.text.trim()));
    assert.equal(facts.sourceBlocks.map(block => block.text).join(''), paragraphs.join('\n\n'));
    assert.deepEqual(facts.sourceBlocks.map(block => [block.id, block.page]), facts.sourceBlocks.map((_, index) => [`docx-b${index + 1}`, null]));
    if (label === 'paragraph boundaries') assert.equal(facts.sourceBlocks[0].text, paragraphs[0] + '\n\n');
    assert.doesNotThrow(() => validateOptimizeInput({ facts, targetRole: '产品助理' }));
  });
}

for (const [label, gap] of [
  ['a whitespace-only paragraph', [' '.repeat(12000)]],
  ['many empty paragraphs', Array(7000).fill('')],
  ['more than 30 whitespace-only chunks', [' '.repeat(360000)]],
]) {
  test(`DOCX ignores blank source chunks and remains valid: ${label}`, async () => {
    const first = 'A'.repeat(12000);
    const buffer = await docxWithParagraphs([first, ...gap, 'B with words']);
    const { facts } = await extractDocument({ originalname: 'blank-gaps.docx', buffer, size: buffer.length });
    assert.doesNotThrow(() => validateOptimizeInput({ facts, targetRole: '产品助理' }));
    assert.deepEqual(facts.sourceBlocks.map(block => [block.id, block.page]), [['docx-b1', null], ['docx-b2', null]]);
    assert.deepEqual(facts.sourceBlocks.map(block => block.text.trim()), [first, 'B with words']);
    assert.ok(facts.sourceBlocks.every(block => block.text.length <= 12000));
  });
}

test('DOCX requiring 31 source chunks is rejected at extraction', async () => {
  const buffer = await docxWithParagraphs(['字'.repeat(360001)]);
  await assert.rejects(extractDocument({ originalname: 'too-long.docx', buffer, size: buffer.length }),
    error => error.status === 400 && error.code === 'document_too_long' && /过长.*精简/.test(error.message));
});

test('DOCX using exactly 30 full chunks is accepted by optimization validation', async () => {
  const buffer = await docxWithParagraphs(['字'.repeat(360000)]);
  const { facts } = await extractDocument({ originalname: 'limit.docx', buffer, size: buffer.length });
  assert.equal(facts.sourceBlocks.length, 30);
  assert.doesNotThrow(() => validateOptimizeInput({ facts, targetRole: '产品助理' }));
});

test("extracts a real text PDF into a page-numbered source block", async () => {
  const buffer = await fixture("resume.pdf");
  const result = await extractDocument({ originalname: "resume.pdf", buffer, size: buffer.length });

  assert.deepEqual(result.facts.sourceBlocks, [
    { id: "p1-b1", text: "Resume Project Experience", page: 1 },
  ]);
});

test("reports a scanned PDF when no extractable text exists", async () => {
  const buffer = await fixture("scan.pdf");
  await assert.rejects(
    extractDocument({ originalname: "scan.pdf", buffer, size: buffer.length }),
    /扫描型/,
  );
});

test("rejects a PDF with more than ten pages", async () => {
  const buffer = await fixture("eleven-pages.pdf");
  await assert.rejects(
    extractDocument({ originalname: "long-resume.pdf", buffer, size: buffer.length }),
    /10 页/,
  );
});

test("extracts project experience text from a real DOCX", async () => {
  const buffer = await fixture("resume.docx");
  const result = await extractDocument({ originalname: "resume.docx", buffer, size: buffer.length });

  assert.equal(result.facts.sourceBlocks[0].id, "docx-b1");
  assert.equal(result.facts.sourceBlocks[0].page, null);
  assert.match(result.facts.sourceBlocks[0].text, /项目经历/);
});

test("returns a readable error for a corrupted DOCX", async () => {
  const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x63, 0x6f, 0x72, 0x72, 0x75, 0x70, 0x74]);
  await assert.rejects(
    extractDocument({ originalname: "corrupt.docx", buffer, size: buffer.length }),
    /DOCX 文件无法解析/,
  );
});

test("keeps raw blocks while only pre-filling explicit contact details", () => {
  const sourceBlocks = [{ id: "docx-b1", text: "张三\nzhangsan@example.com\n13800138000\n教育背景：示例大学", page: null }];
  const facts = buildFacts(sourceBlocks);

  assert.deepEqual(facts, {
    name: "张三",
    contact: "zhangsan@example.com 13800138000",
    education: [{ school: "示例大学", major: "", degree: "", dates: "", sourceIds: ["docx-b1"] }],
    experiences: [],
    skills: [],
    sourceBlocks,
    warnings: [],
  });
});

test("identifies a labelled name, major and date-ordered work experience without a project category", () => {
  const facts = buildFacts([{ id: "docx-b1", page: null, text: "姓名：李四\n教育背景：测试大学 本科 2018.09-2022.06 专业：软件工程\n工作经历\n产品助理\n2024.03-至今\n负责用户访谈\n运营实习生\n2022.06-2023.12\n负责内容运营" }]);
  assert.equal(facts.name, "李四");
  assert.equal(facts.education[0].major, "软件工程");
  assert.deepEqual(facts.experiences.map((entry) => entry.dates), ["2024.03-至今", "2022.06-2023.12"]);
  assert.ok(facts.experiences.every((entry) => !Object.hasOwn(entry, "type")));
});

test("parses a common Chinese PDF row with school, major, company, role and a double-dash date", () => {
  const facts = buildFacts([{ id: "p1-b1", page: 1, text: "姓名：王小明\n期望城市：杭州\n教育背景\n成都信息工程大学 — 光电信息科学与工程 本科 2020-2024\n工作/实习经历\n迅游科技公司   产品运营   2023.04——至今\n1. 商业化活动全流程落地\n注：2023.04—2024.06 为产品运营实习生" }]);
  assert.equal(facts.name, "王小明");
  assert.deepEqual(facts.education[0], { school: "成都信息工程大学", major: "光电信息科学与工程", degree: "本科", dates: "2020-2024", sourceIds: ["p1-b1"] });
  assert.deepEqual(facts.experiences, [{ title: "产品运营", organization: "迅游科技公司", dates: "2023.04——至今", description: "1. 商业化活动全流程落地\n注：2023.04—2024.06 为产品运营实习生", sourceIds: ["p1-b1"] }]);
});

test("keeps work content after a standalone numbered line and an internship note", () => {
  const facts = buildFacts([{ id: "p1-b1", page: 1, text: "工作/实习经历\n示例公司   产品运营   2023.04——至今\n1.\n注：2023.04—2024.06 为实习生\n商业化活动全流程落地：\n主导活动方案与复盘\n2. 付费玩法设计\n提升转化" }]);
  assert.equal(facts.experiences.length, 1);
  assert.match(facts.experiences[0].description, /商业化活动全流程落地/);
  assert.match(facts.experiences[0].description, /付费玩法设计/);
  assert.doesNotMatch(facts.experiences[0].description, /^1\.$/);
});

test("keeps each category from a skills and certificates section as one skill entry", () => {
  const facts = buildFacts([{ id: "p2-b1", page: 2, text: "技能／证书及其他\n● 商业化运营：付费卡点 设计、会 员体系设计、活动复盘\n● 用户运营：用户分层、RFM 分析、LTV 分析\n● 产品运营：竞 品分析、Axure 原型设计\n● 工具使用：Axure、Excel、数据看板" }]);
  assert.deepEqual(facts.skills, [
    "商业化运营：付费卡点设计、会员体系设计、活动复盘",
    "用户运营：用户分层、RFM 分析、LTV 分析",
    "产品运营：竞品分析、Axure 原型设计",
    "工具使用：Axure、Excel、数据看板",
  ]);
});
