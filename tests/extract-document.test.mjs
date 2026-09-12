import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildFacts } from "../server/facts.js";
import { extractDocument } from "../server/extract-document.js";
import { validateOptimizeInput } from "../server/resume-validation.js";
import { docxWithParagraphs } from "./helpers/docx.mjs";
import PDFDocument from "pdfkit";

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

test('PDF prefers parser line endings while retaining existing space normalization', async () => {
  const buffer = await pdfWithPages([['A'.repeat(7000), 'B'.repeat(6000)]]);
  const { facts } = await extractDocument({ originalname: 'lines.pdf', buffer, size: buffer.length });
  assert.equal(facts.sourceBlocks[0].text.trim(), 'A'.repeat(7000));
  assert.equal(facts.sourceBlocks[1].text.trim(), 'B'.repeat(6000));
  assert.match(facts.sourceBlocks.map(block => block.text).join(''), /^A{7000} +B{6000}$/);
  assert.doesNotThrow(() => validateOptimizeInput({ facts, targetRole: '产品助理' }));
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
