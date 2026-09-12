const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const NAME_PATTERN = /^[\p{Script=Han}]{2,6}$/u;
const DATE_RANGE = /(20\d{2}(?:[.\/-]\d{1,2})?\s*(?:至|到|[-—~～])\s*(?:20\d{2}(?:[.\/-]\d{1,2})?|至今|现在))/;
const SCHOOL = /([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z· ]{1,30}(?:大学|学院|学校|University|College))/u;
const DEGREE = /(博士|硕士(?:研究生)?|学士|本科|大专|专科|高中|MBA)/;
const SKILL_HEADING = /(?:技能|专业技能|专业能力|证书|资格证|资质|语言能力|熟练|精通|掌握|熟悉)/i;
const WORK_HEADING = /^(?:工作经历|工作经验|任职经历|实习经历|职业经历|社会实践)(?:[：:]|\s|$)/i;
const EDUCATION_HEADING = /^(?:教育背景|教育经历|学历)(?:[：:]|\s|$)/i;
const SECTION_HEADING = /^(?:教育背景|教育经历|学历|工作经历|工作经验|任职经历|实习经历|职业经历|社会实践|项目经历|项目经验|专业技能|技能|证书|资格证|自我评价|个人评价|兴趣爱好)(?:[：:]|\s|$)/i;

function clean(value) { return value.replace(/^[：:\s•·-]+|[：:\s；;，,。]+$/g, "").trim(); }
function lines(block) { return block.text.split(/\r?\n/).map(clean).filter(Boolean); }
function startDate(dates) { return Number((dates.match(/20\d{2}/)?.[0] ?? "0")); }

function extractName(sourceBlocks) {
  const text = sourceBlocks.map((block) => block.text).join("\n");
  const labelled = text.match(/(?:姓名|名字)[：:\s]*([\p{Script=Han}]{2,6})/u)?.[1];
  if (labelled) return labelled;
  return sourceBlocks.slice(0, 2).flatMap(lines).slice(0, 8).find((line) => NAME_PATTERN.test(line) && !SECTION_HEADING.test(line) && !/(?:大学|学院|专业|简历|求职)/.test(line)) ?? "";
}

function extractSkills(block) {
  const blockLines = lines(block), result = [];
  for (const [index, line] of blockLines.entries()) {
    const headed = line.match(/^(?:专业)?(?:技能|证书|资格证|语言能力)[：:]?\s*(.*)$/i);
    const candidate = headed?.[1] || (SKILL_HEADING.test(line) ? line.replace(/^(?:熟练|精通|掌握|熟悉)[：:]?\s*/i, "") : "");
    if (!candidate) continue;
    for (const item of candidate.split(/[、,，/｜|]+/).map(clean)) if (item && item.length <= 100 && !/^(技能|证书|专业能力)$/i.test(item)) result.push(item);
    if (/^(?:专业)?(?:技能|证书|资格证|语言能力)[：:]?$/i.test(line) && blockLines[index + 1]) result.push(...blockLines[index + 1].split(/[、,，/｜|]+/).map(clean).filter(Boolean));
  }
  return result;
}

function extractEducation(block) {
  const blockLines = lines(block), text = blockLines.join(" ");
  const school = text.match(SCHOOL)?.[1]?.trim() ?? "", degree = text.match(DEGREE)?.[1] ?? "", dates = text.match(DATE_RANGE)?.[1] ?? "";
  if (!school && !degree) return [];
  const labelledMajor = text.match(/(?:专业|主修)[：:\s]*([^，,；;。\n]{2,30}?)(?=\s*(?:专业技能|技能|证书|工作经历|项目经历)|$)/)?.[1]?.trim();
  const educationStart = blockLines.findIndex((line) => EDUCATION_HEADING.test(line));
  const end = educationStart < 0 ? blockLines.length : (() => { const index = blockLines.findIndex((line, i) => i > educationStart && SECTION_HEADING.test(line)); return index < 0 ? blockLines.length : index; })();
  const inferredMajor = blockLines.slice(Math.max(0, educationStart), end).find((line) => /(?:专业|工程|科学|管理|设计|语言|经济|医学|法学|文学|教育学)$/.test(line) && !SCHOOL.test(line));
  return [{ school, major: labelledMajor || inferredMajor || "", degree, dates, sourceIds: [block.id] }];
}

function extractWork(block) {
  const blockLines = lines(block);
  const headers = blockLines.map((line, index) => WORK_HEADING.test(line) ? index : -1).filter((index) => index >= 0);
  const ranges = headers.length ? headers.map((start) => { const endIndex = blockLines.findIndex((line, i) => i > start && SECTION_HEADING.test(line)); return [start + 1, endIndex < 0 ? blockLines.length : endIndex]; }) : [[0, blockLines.length]];
  const entries = [];
  for (const [start, end] of ranges) {
    const dateRows = [];
    for (let index = start; index < end; index += 1) if (DATE_RANGE.test(blockLines[index])) dateRows.push(index);
    for (const [position, index] of dateRows.entries()) {
      const previous = position === 0 ? start : dateRows[position - 1] + 1;
      const before = blockLines.slice(previous, index), after = blockLines.slice(index + 1, position + 1 < dateRows.length ? dateRows[position + 1] : end);
      const title = before.at(-1) ?? "", organization = before.length > 1 && /(?:公司|集团|银行|事务所|工作室|中心|有限公司)/.test(before.at(-2)) ? before.at(-2) : "";
      entries.push({ title, organization, dates: blockLines[index].match(DATE_RANGE)?.[1] ?? "", description: after.join("\n"), sourceIds: [block.id] });
    }
  }
  return entries;
}

export function buildFacts(sourceBlocks) {
  const text = sourceBlocks.map((block) => block.text).join("\n");
  const contacts = [...new Set([...(text.match(EMAIL_PATTERN) ?? []), ...(text.match(PHONE_PATTERN) ?? [])])];
  return {
    name: extractName(sourceBlocks), contact: contacts.join(" "),
    education: sourceBlocks.flatMap(extractEducation).sort((a, b) => startDate(b.dates) - startDate(a.dates)),
    experiences: sourceBlocks.flatMap(extractWork).filter((entry) => entry.title || entry.description).sort((a, b) => startDate(b.dates) - startDate(a.dates)),
    skills: [...new Set(sourceBlocks.flatMap(extractSkills))], sourceBlocks, warnings: [],
  };
}
