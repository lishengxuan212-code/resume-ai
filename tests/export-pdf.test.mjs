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
      bullets: [{ title: "用户访谈", text: "负责产品用户访谈" }],
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

  const pdf = await exportPdf({ facts, resume: { ...resume, warnings: ['这是一条只在当前页面展示的简历提醒'] } });

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 2_000);
  const text = await extractText(pdf);
  assert.match(text, /用户访谈/);
  assert.doesNotMatch(text, /只在当前页面展示的简历提醒/);
});

test('the enabled recommended template preserves the canonical resume content', async () => {
  const exportPdf = await getExportPdf();
  const pdf = await exportPdf({ facts, resume, templateId: 'recommended' });
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  const text = await extractText(pdf);
  assert.match(text, /张三/);
  assert.match(text, /产品实习生/);
  assert.match(text, /用户访谈/);
});

test('numbers non-skill titles and keeps a later section heading with its first content', async () => {
  const exportPdf = await getExportPdf();
  const numberedResume = structuredClone(resume);
  numberedResume.sections = [{
    heading: '项目经历',
    entries: Array.from({ length: 8 }, (_, entryIndex) => ({
      title: `项目 ${entryIndex + 1}`,
      organization: '示例公司',
      dates: '2025.01 - 2025.06',
      bullets: Array.from({ length: 3 }, (_, bulletIndex) => ({ title: `项目推进 ${bulletIndex + 1}`, text: '完成用户调研、需求分析和跨团队协作，持续推动产品方案落地。' })),
    })),
  }, {
    type: 'skills',
    heading: '技能',
    entries: [{ title: '', organization: '', dates: '', bullets: [{ title: '付费与活动玩法', text: '具备活动设计和复盘经验。' }] }],
  }];
  numberedResume.sections[0].entries[0].bullets = [
    { title: '用户访谈', text: '负责产品用户访谈。' },
    { title: '需求梳理', text: '整理访谈结论并跟进需求。' },
  ];

  const pages = await extractPageTexts(await exportPdf({ facts, resume: numberedResume }));
  const text = pages.join(' ');
  assert.match(text, /1\.\s*用户访谈\s*负责产品用户访谈/);
  assert.match(text, /2\.\s*需求梳理\s*整理访谈结论并跟进需求/);
  const skillsPage = pages.find(page => page.includes('技能'));
  assert.ok(skillsPage, '技能模块必须被渲染');
  assert.match(skillsPage, /付费与活动玩法/);
});

test('uses the reference layout with top education and separators between experiences', async () => {
  const exportPdf = await getExportPdf();
  const pdf = await exportPdf({
    facts: { ...facts, education: [{ school: '四川传媒学院', major: '播音与主持艺术', degree: '学士学位', dates: '2019.09 - 2023.06' }] },
    resume: { ...resume, sections: [{ ...resume.sections[0], entries: [...resume.sections[0].entries, { title: '运营实习生', organization: '示例公司', dates: '2024.01 - 2024.06', bullets: [{ title: '活动执行', text: '完成活动执行与复盘。' }] }] }] },
    templateId: 'recommended',
  });
  const text = await extractText(pdf);
  assert.match(text, /四川传媒学院/);
  assert.match(text, /运营实习生/);
});

test("exports long reviewed content across pages without throwing", async () => {
  const exportPdf = await getExportPdf();
  assert.equal(typeof exportPdf, "function");
  const longResume = structuredClone(resume);
  longResume.sections = Array.from({ length: 2 }, (_, sectionIndex) => ({
    heading: `项目经历 ${sectionIndex + 1}`,
    entries: Array.from({ length: 5 }, (_, entryIndex) => ({
      title: `产品项目 ${entryIndex + 1}`,
      organization: "示例公司",
      dates: "2025.01 - 2025.06",
      bullets: Array.from({ length: 3 }, (_, bulletIndex) => ({ title: `项目推进 ${bulletIndex + 1}`, text: "完成用户调研、需求分析和跨团队协作，持续推动产品方案落地。" })),
      sourceIds: ["p1-b1"],
    })),
  }));

  const pages = await extractPageTexts(await exportPdf({ facts, resume: longResume }));
  assert.ok(pages.length > 1);
  assert.match(pages.at(-1), /项目推进 3/);
});

test('wraps a long Chinese phrase without adding a renderer hyphen', async () => {
  const exportPdf = await getExportPdf();
  const wrappedResume = structuredClone(resume);
  wrappedResume.sections[0].entries[0].bullets[0].text = '透明奖池上线期间产品营收提升20%，活动付费率8%，复购率40%。'.repeat(5);
  const text = await extractText(await exportPdf({ facts, resume: wrappedResume }));
  assert.match(text.replace(/\s/g, ''), /透明奖池上线期间产品营收提升20%/);
  assert.doesNotMatch(text, /上线期-\s*间/);
});

test('uses the optional local avatar and normalizes extraction-only Chinese gaps', async () => {
  const exportPdf = await getExportPdf();
  const avatarDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyeiiigD//2Q==';
  const spacedResume = structuredClone(resume);
  spacedResume.sections[0].entries[0].bullets[0].text = '大促活动执行 参与；用户分层与付费转化 基于 LTV 与 RF';
  const text = await extractText(await exportPdf({ facts, resume: spacedResume, presentation: { avatarDataUrl } }));
  assert.match(text.replace(/\s/g, ''), /大促活动执行参与；用户分层与付费转化基于LTV与RF/);
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

test("renders skills as one-line title-colon-body items without entry headings", async () => {
  const exportPdf = await getExportPdf();
  const skillResume = structuredClone(resume);
  skillResume.sections = [{ heading: '技能', entries: [{ title: '', organization: '', dates: '', bullets: [{ title: '付费与活动玩法', text: '具备付费卡点设计、会员体系设计和活动复盘经验。' }] }] }];

  const text = await extractText(await exportPdf({ facts, resume: skillResume }));

  assert.match(text.replace(/\s/g, ''), /付费与活动玩法：具备付费卡点设计、会员体系设计和活动复盘经验。/);
});
