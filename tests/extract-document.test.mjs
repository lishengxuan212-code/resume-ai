import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildFacts } from "../server/facts.js";
import { extractDocument } from "../server/extract-document.js";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

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
    education: [],
    experiences: [],
    skills: [],
    sourceBlocks,
    warnings: [],
  });
});
