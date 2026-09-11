import assert from "node:assert/strict";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { validateOptimizeInput } from "../server/resume-validation.js";

const facts = {
  name: "张三",
  contact: "zhangsan@example.com · 13800000000",
  education: [],
  experiences: [],
  skills: [],
  warnings: [],
  sourceBlocks: [{ id: "p1-b1", text: "负责产品用户访谈", page: 1 }],
};

const resume = {
  summary: "具备用户研究和需求分析经验。",
  targetRole: "产品助理",
  sections: [{
    heading: "工作经历",
    entries: [{
      title: "产品实习生",
      organization: "示例公司",
      dates: "2025.01 - 2025.06",
      bullets: ["负责产品用户访谈"],
      sourceIds: ["p1-b1"],
    }],
  }],
};

async function getExportPdf() {
  const module = await import("../server/export-pdf.js").catch(() => ({}));
  return module.exportPdf;
}

async function extractPageTexts(pdf) {
  const document = await getDocument({ data: new Uint8Array(pdf) }).promise;
  return Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
    const page = await document.getPage(index + 1);
    return (await page.getTextContent()).items.map((item) => item.str).join(" ");
  }));
}

async function extractText(pdf) {
  return (await extractPageTexts(pdf)).join(" ");
}

test("exports a non-empty Chinese PDF from reviewed facts and resume", async () => {
  const exportPdf = await getExportPdf();
  assert.equal(typeof exportPdf, "function");

  const pdf = await exportPdf({ facts, resume });

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 2_000);
});

test("exports long reviewed content across pages without throwing", async () => {
  const exportPdf = await getExportPdf();
  assert.equal(typeof exportPdf, "function");
  const longResume = structuredClone(resume);
  longResume.sections = Array.from({ length: 8 }, (_, sectionIndex) => ({
    heading: `项目经历 ${sectionIndex + 1}`,
    entries: Array.from({ length: 20 }, (_, entryIndex) => ({
      title: `产品项目 ${entryIndex + 1}`,
      organization: "示例公司",
      dates: "2025.01 - 2025.06",
      bullets: Array.from({ length: 8 }, () => "完成用户调研、需求分析和跨团队协作，持续推动产品方案落地。"),
      sourceIds: ["p1-b1"],
    })),
  }));

  await assert.doesNotReject(() => exportPdf({ facts, resume: longResume }));
});

test("skips labels for absent optional values", async () => {
  const exportPdf = await getExportPdf();
  const pdf = await exportPdf({
    facts: { ...facts, name: "", contact: null },
    resume: { summary: "", targetRole: null, sections: [] },
  });

  const text = await extractText(pdf);
  assert.doesNotMatch(text, /目标岗位|摘要|undefined|null/);
});

test("keeps an allowed long contact on the first PDF page", async () => {
  const exportPdf = await getExportPdf();
  const acceptedFacts = validateOptimizeInput({
    facts: { ...facts, name: "", contact: "联".repeat(8_000) },
    targetRole: resume.targetRole,
  }).facts;

  const pages = await extractPageTexts(await exportPdf({ facts: acceptedFacts, resume }));

  assert.match(pages[0], /联/);
});
