import { AppError } from "./errors.js";
import { MAX_SOURCE_BLOCKS, MAX_SOURCE_BLOCK_TEXT_LENGTH } from "./source-limits.js";

export function providerFailed() {
  return new AppError(502, "provider_failed", "AI 服务暂时无法生成简历，请稍后重试。");
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value, max, required = false) => typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
const isList = (value, max, required = true) => Array.isArray(value) && value.length <= max && (!required || value.length > 0);

export function validateOptimizedResume(value, facts, provider, model) {
  const fail = () => { throw providerFailed(); };
  if (!isObject(value) || !isText(value.summary, 1000) || !isText(value.targetRole, 200, true) || !isList(value.sections, 8)) fail();
  if (!isObject(facts) || !isList(facts.sourceBlocks, MAX_SOURCE_BLOCKS)) fail();
  const ids = new Set(facts.sourceBlocks.map((block) => block?.id));
  const sections = value.sections.map((section) => {
    if (!isObject(section) || !isText(section.heading, 200, true) || !isList(section.entries, 20)) fail();
    const entries = section.entries.map((entry) => {
      if (!isObject(entry) || !["title", "organization", "dates"].every((key) => isText(entry[key], 200))) fail();
      if (!isList(entry.bullets, 8) || !entry.bullets.every((bullet) => isText(bullet, 500, true))) fail();
      if (!isList(entry.sourceIds, MAX_SOURCE_BLOCKS) || !entry.sourceIds.every((id) => typeof id === "string" && ids.has(id))) fail();
      return { title: entry.title, organization: entry.organization, dates: entry.dates, bullets: [...entry.bullets], sourceIds: [...entry.sourceIds] };
    });
    return { heading: section.heading, entries };
  });
  return { summary: value.summary, targetRole: value.targetRole, sections, provider, model };
}

// Client-confirmed facts remain untrusted JSON. Project only known fields and
// validate their citations against the complete source-block list first.
export function validateOptimizeInput(value) {
  const fail = () => { throw new AppError(400, "request_invalid", "请提供有效的简历事实、来源片段和目标岗位。"); };
  if (!isObject(value) || !isText(value.targetRole, 200, true) || !isObject(value.facts)) fail();
  const facts = value.facts;
  if (!isList(facts.sourceBlocks, MAX_SOURCE_BLOCKS)) fail();
  const ids = new Set();
  const sourceBlocks = facts.sourceBlocks.map((block) => {
    if (!isObject(block) || !isText(block.id, 200, true) || !isText(block.text, MAX_SOURCE_BLOCK_TEXT_LENGTH, true) || ids.has(block.id)) fail();
    if (block.page !== undefined && block.page !== null && (!Number.isInteger(block.page) || block.page < 1)) fail();
    ids.add(block.id);
    return { id: block.id, text: block.text, page: block.page ?? null };
  });
  const textField = (field, max = 12000) => {
    const text = facts[field] === undefined ? "" : facts[field];
    if (!isText(text, max)) fail();
    return text;
  };
  const textList = (field) => {
    const values = facts[field] === undefined ? [] : facts[field];
    if (!isList(values, 100, false) || !values.every((text) => isText(text, 12000, true))) fail();
    return [...values];
  };
  const entries = (field, keys) => {
    const values = facts[field] === undefined ? [] : facts[field];
    if (!isList(values, 20, false)) fail();
    return values.map((entry) => {
      if (!isObject(entry) || !keys.every((key) => isText(entry[key], key === "description" ? 12000 : 200))) fail();
      if (!isList(entry.sourceIds, MAX_SOURCE_BLOCKS) || !entry.sourceIds.every((id) => typeof id === "string" && ids.has(id))) fail();
      return { ...Object.fromEntries(keys.map((key) => [key, entry[key]])), sourceIds: [...entry.sourceIds] };
    });
  };
  return {
    facts: {
      name: textField("name", 200), contact: textField("contact"),
      education: entries("education", ["school", "major", "degree", "dates"]),
      experiences: entries("experiences", ["title", "organization", "dates", "description"]),
      skills: textList("skills"), sourceBlocks, warnings: textList("warnings"),
    },
    targetRole: value.targetRole.trim(),
  };
}
