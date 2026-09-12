import assert from "node:assert/strict";
import test from "node:test";
import { validateOptimizedResume } from "../server/resume-validation.js";
import { AppError } from "../server/errors.js";

const facts = { sourceBlocks: [{ id: "p1-b1", text: "实习：负责用户访谈" }] };
const resume = { methodologyVersion: '0.1', summary: "访谈经验", targetRole: "产品助理", sections: [{ heading: "经历", entries: [{ title: "实习", organization: "", dates: "", bullets: [{ title: '用户访谈', text: '开展用户访谈并整理反馈', sourceIds: ['p1-b1'], ruleIds: ['F01', 'E02'] }] }] }], omissions: [], warnings: [] };
const validate = (value, sourceFacts = facts) => validateOptimizedResume(value, sourceFacts, "openai", "server-model");
const failure = (error) => error instanceof AppError && error.status === 502 && error.code === "provider_failed";

test("validation projects only approved fields and uses server provider/model", () => {
  const value = structuredClone(resume);
  Object.assign(value, { provider: "qwen", model: "forged", apiKey: "discard-me" });
  value.sections[0].extra = "discard-me";
  value.sections[0].entries[0].extra = "discard-me";
  assert.deepEqual(validate(value), { ...resume, provider: "openai", model: "server-model" });
});

test('skill entry category labels are removed without relaxing employment title checks', () => {
  const value = structuredClone(resume);
  value.sections[0].heading = '专业技能';
  value.sections[0].entries[0].title = '办公软件';
  assert.equal(validate(value).sections[0].entries[0].title, '');
  value.sections[0].heading = '工作经历';
  assert.throws(()=>validate(value), failure);
});

for (const [label, mutate] of [
  ["null", () => null], ["array root", () => []],
  ["missing summary", (v) => { delete v.summary; }], ["long summary", (v) => { v.summary = "字".repeat(1001); }],
  ["empty role", (v) => { v.targetRole = " "; }], ["long role", (v) => { v.targetRole = "字".repeat(201); }],
  ["empty sections", (v) => { v.sections = []; }], ["object sections", (v) => { v.sections = {}; }],
  ["too many sections", (v) => { v.sections = Array(9).fill(v.sections[0]); }],
  ["null section", (v) => { v.sections = [null]; }],
  ["empty entries", (v) => { v.sections[0].entries = []; }], ["object entries", (v) => { v.sections[0].entries = {}; }],
  ["too many entries", (v) => { v.sections[0].entries = Array(21).fill(v.sections[0].entries[0]); }],
  ["null entry", (v) => { v.sections[0].entries = [null]; }],
  ["empty bullets", (v) => { v.sections[0].entries[0].bullets = []; }],
  ["object bullets", (v) => { v.sections[0].entries[0].bullets = {}; }],
  ["missing bullet title", (v) => { delete v.sections[0].entries[0].bullets[0].title; }],
  ["blank bullet title", (v) => { v.sections[0].entries[0].bullets[0].title = " "; }],
  ["long bullet title", (v) => { v.sections[0].entries[0].bullets[0].title = "字".repeat(81); }],
  ["generic bullet title", (v) => { v.sections[0].entries[0].bullets[0].title = "工作内容"; }],
  ["blank bullet", (v) => { v.sections[0].entries[0].bullets[0].text = " "; }],
  ["non-object bullet", (v) => { v.sections[0].entries[0].bullets = [1]; }],
  ["long bullet", (v) => { v.sections[0].entries[0].bullets[0].text = "字".repeat(501); }],
  ["too many bullets", (v) => { v.sections[0].entries[0].bullets = Array(9).fill(v.sections[0].entries[0].bullets[0]); }],
  ["missing sourceIds", (v) => { delete v.sections[0].entries[0].bullets[0].sourceIds; }],
  ["empty sourceIds", (v) => { v.sections[0].entries[0].bullets[0].sourceIds = []; }],
  ["non-array sourceIds", (v) => { v.sections[0].entries[0].bullets[0].sourceIds = "p1-b1"; }],
  ["unknown source ID", (v) => { v.sections[0].entries[0].bullets[0].sourceIds = ["unknown"]; }],
  ["mixed valid and unknown IDs", (v) => { v.sections[0].entries[0].bullets[0].sourceIds = ["p1-b1", "unknown"]; }],
  ["missing F01 rule", (v) => { v.sections[0].entries[0].bullets[0].ruleIds = ['E02']; }],
  ["unknown rule", (v) => { v.sections[0].entries[0].bullets[0].ruleIds = ['F01', 'X99']; }],
  ["internal rule in bullet title", (v) => { v.sections[0].entries[0].bullets[0].title = 'F03 用户访谈'; }],
  ["internal rule in bullet text", (v) => { v.sections[0].entries[0].bullets[0].text = '按照 E02 开展用户访谈'; }],
  ["internal rule in summary", (v) => { v.summary = '使用 D03 优化后的访谈经验'; }],
  ["invented summary experience length", (v) => { v.summary = '具备2年产品经验'; }],
  ["invented Chinese summary experience length", (v) => { v.summary = '具备约四年工作经历'; }],
  ["invented title", (v) => { v.sections[0].entries[0].title = '高级增长经理'; }],
  ["invented organization", (v) => { v.sections[0].entries[0].organization = '虚构科技公司'; }],
  ["invented dates", (v) => { v.sections[0].entries[0].dates = '2099.01'; }],
  ...["heading", "title", "organization", "dates"].flatMap((field) => [
    [`long ${field}`, (v) => { (field === "heading" ? v.sections[0] : v.sections[0].entries[0])[field] = "字".repeat(201); }],
    [`non-string ${field}`, (v) => { (field === "heading" ? v.sections[0] : v.sections[0].entries[0])[field] = {}; }],
  ]),
]) {
  test(`rejects ${label}`, () => {
    const value = structuredClone(resume);
    const replacement = mutate(value);
    assert.throws(() => validate(replacement === undefined ? value : replacement), failure);
  });
}

test("accepts inclusive string and array limits, preserving text without HTML interpretation", () => {
  const value = structuredClone(resume);
  value.summary = "字".repeat(1000);
  value.targetRole = "字".repeat(200);
  const entry = value.sections[0].entries[0];
  for (const field of ["title", "organization", "dates"]) entry[field] = "字".repeat(200);
  entry.bullets = [{ title: '安全文本', text: "<script>alert('plain text')</script>", sourceIds: ['p1-b1'], ruleIds: ['F01'] }, ...Array(7).fill({ title: '边界标题', text: "字".repeat(500), sourceIds: ['p1-b1'], ruleIds: ['F01'] })];
  value.sections[0].heading = "字".repeat(200);
  value.sections[0].entries = Array(20).fill(entry);
  value.sections = Array(8).fill(value.sections[0]);
  const limitFacts = { sourceBlocks: [{ id: 'p1-b1', text: `${entry.title} ${entry.organization} ${entry.dates}` }] };
  assert.deepEqual(validate(value, limitFacts), { ...value, provider: "openai", model: "server-model" });
});

test('an unresolved diagnosed percentage cannot pass through unchanged after questions are skipped', () => {
  const percentageFacts = { sourceBlocks: [{ id: 'b1', text: '推动新用户付费率提升100%' }] };
  const diagnosis = { methodologyVersion: '0.1', findings: [{ dimension: '清晰度', issue: '“提升100%”未说明相对基期、同比或环比，数字口径存在歧义', evidenceSourceIds: ['b1'], suggestedAction: '明确百分比口径', ruleIds: ['F03'] }], questions: [{ id: 'q1', question: '100%具体是什么口径？', reason: '避免数字歧义', suggestedRewrite: '推动新用户付费率提升。', sourceIds: ['b1'], ruleIds: ['F03'] }], canOptimizeDirectly: true };
  const output = { methodologyVersion: '0.1', summary: '', targetRole: '运营', sections: [{ heading: '工作经历', entries: [{ title: '', organization: '', dates: '', bullets: [{ title: '付费转化', text: '推动新用户付费率提升100%', sourceIds: ['b1'], ruleIds: ['F01', 'F03'] }] }] }], omissions: [], warnings: [] };
  assert.throws(() => validateOptimizedResume(output, percentageFacts, 'test', 'test', { diagnosis, answers: [] }), failure);
  const conservative = structuredClone(output);
  conservative.sections[0].entries[0].bullets[0].text = '推动新用户付费率提升';
  assert.equal(validateOptimizedResume(conservative, percentageFacts, 'test', 'test', { diagnosis, answers: [] }).sections[0].entries[0].bullets[0].text, '推动新用户付费率提升');
  assert.doesNotThrow(() => validateOptimizedResume(output, percentageFacts, 'test', 'test', { diagnosis, answers: [{ questionId: 'q1', answer: '相对上期翻倍' }] }));
});

test('skills stay concise, transferable and do not invent proficiency levels', () => {
  const skillFacts = { sourceBlocks: [{ id: 'skills', text: '工具使用技能：Axure、Excel、禅道、企业内部AI工具、企业自研数据看板' }] };
  const output = { methodologyVersion: '0.1', summary: '', targetRole: '产品运营', sections: [{ heading: '专业技能', entries: [{ title: '办公软件', organization: '', dates: '', bullets: [{ title: '原型与数据处理', text: '使用 Axure、Excel、禅道支持日常工作。', sourceIds: ['skills'], ruleIds: ['F01', 'E03'] }] }] }], omissions: [], warnings: [] };
  const normalized = validateOptimizedResume(output, skillFacts, 'test', 'test');
  assert.equal(normalized.sections[0].heading, '技能');
  assert.equal(normalized.sections[0].entries[0].title, '');
  assert.equal(normalized.sections[0].entries[0].bullets[0].text, '使用 Axure、Excel、禅道支持日常工作。');
  const internal = structuredClone(output);
  internal.sections[0].entries[0].bullets[0].text = 'Axure、Excel、企业内部AI工具、企业自研数据看板';
  assert.throws(() => validateOptimizedResume(internal, skillFacts, 'test', 'test'), failure);
  const inventedLevel = structuredClone(output);
  inventedLevel.sections[0].entries[0].bullets[0].text = 'Axure（精通）、Excel（精通）';
  assert.throws(() => validateOptimizedResume(inventedLevel, skillFacts, 'test', 'test'), failure);
  const supportedLevelFacts = { sourceBlocks: [{ id: 'skills', text: '精通 Axure，精通 Excel' }] };
  assert.doesNotThrow(() => validateOptimizedResume(inventedLevel, supportedLevelFacts, 'test', 'test'));
  const category = structuredClone(output);
  category.sections[0].entries[0].title = '工具与软件使用';
  assert.doesNotThrow(() => validateOptimizedResume(category, skillFacts, 'test', 'test'));
  for (const title of ['商业化运营', '用户运营', '产品运营', '运营技能', '工具', '常用工具', '工具使用', '工具能力']) {
    const broadTitle = structuredClone(output);
    broadTitle.sections[0].entries[0].bullets[0].title = title;
    assert.throws(() => validateOptimizedResume(broadTitle, skillFacts, 'test', 'test'), failure);
  }
  const genericList = structuredClone(output);
  genericList.sections[0].heading = '技能清单';
  genericList.sections[0].entries[0].title = '技能清单';
  const cleanList = validateOptimizedResume(genericList, skillFacts, 'test', 'test');
  assert.equal(cleanList.sections[0].heading, '技能');
  assert.equal(cleanList.sections[0].entries[0].title, '');
});

test('education may omit bullets when no coursework, award or project fact exists', () => {
  const educationFacts = { sourceBlocks: [{ id: 'education', text: '示例大学 信息管理 本科 2017.09-2021.06' }] };
  const output = { methodologyVersion: '0.1', summary: '', targetRole: '产品运营', sections: [{ heading: '教育经历', entries: [{ title: '信息管理 本科', organization: '示例大学', dates: '2017.09-2021.06', bullets: [] }] }], omissions: [], warnings: [] };
  assert.equal(validateOptimizedResume(output, educationFacts, 'test', 'test').sections[0].entries[0].bullets.length, 0);
});
