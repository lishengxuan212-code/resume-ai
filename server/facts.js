const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const NAME_PATTERN = /^[\p{Script=Han}]{2,6}$/u;
const DATE_RANGE = /(20\d{2}(?:[.\/-]\d{1,2})?\s*(?:至|到|[-—~～])\s*(?:20\d{2}(?:[.\/-]\d{1,2})?|至今|现在))/;
const SCHOOL = /([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z· ]{1,30}(?:大学|学院|学校|University|College))/u;
const DEGREE = /(博士|硕士(?:研究生)?|学士|本科|大专|专科|高中|MBA)/;
const SKILL_HEADING = /(?:技能|专业技能|专业能力|证书|资格证|资质|语言能力|熟练|精通|掌握|熟悉)/i;
const WORK_HEADING = /(?:工作经历|工作经验|任职经历|实习经历|职业经历)/i;
const PROJECT_HEADING = /(?:项目经历|项目经验|项目实践|项目)/i;

function clean(value) { return value.replace(/^[：:\s•·-]+|[：:\s；;，,。]+$/g, "").trim(); }
function startDate(dates) { return Number((dates.match(/20\d{2}/)?.[0] ?? "0")); }

function extractSkills(block) {
  const lines = block.text.split(/\r?\n|[；;。]/).map(clean).filter(Boolean);
  const result = [];
  for (const [index, line] of lines.entries()) {
    const headed = line.match(/^(?:专业)?(?:技能|证书|资格证|语言能力)[：:]?\s*(.*)$/i);
    const candidate = headed?.[1] || (SKILL_HEADING.test(line) ? line.replace(/^(?:熟练|精通|掌握|熟悉)[：:]?\s*/i, "") : "");
    if (!candidate) continue;
    for (const item of candidate.split(/[、,，/｜|]+/).map(clean)) if (item && item.length <= 100 && !/^(技能|证书|专业能力)$/i.test(item)) result.push(item);
    if (/^(?:专业)?(?:技能|证书|资格证|语言能力)[：:]?$/i.test(line) && lines[index + 1]) result.push(...lines[index + 1].split(/[、,，/｜|]+/).map(clean).filter(Boolean));
  }
  return result;
}

function extractEducation(block) {
  const text = block.text.replace(/\s+/g, " ");
  const school = text.match(SCHOOL)?.[1]?.trim() ?? "";
  const degree = text.match(DEGREE)?.[1] ?? "";
  const dates = text.match(DATE_RANGE)?.[1] ?? "";
  if (!school && !degree) return [];
  const major = text.match(/(?:专业|主修)[：:\s]*(.{2,30}?)(?=\s*(?:专业技能|技能|证书|工作经历|项目经历)|$)/)?.[1]?.trim() ?? "";
  return [{ school, major, degree, dates, sourceIds: [block.id] }];
}

function extractExperiences(block) {
  const lines = block.text.split(/\r?\n/).map(clean).filter(Boolean);
  let section = "";
  return lines.flatMap((line, index) => {
    if (/(?:教育背景|教育经历|学历)/.test(line)) section = "education";
    if (WORK_HEADING.test(line)) section = "work";
    if (PROJECT_HEADING.test(line)) section = "project";
    const dates = line.match(DATE_RANGE)?.[1];
    if (!dates) return [];
    if (section === "education") return [];
    const context = lines.slice(Math.max(0, index - 2), index + 1).join(" ");
    const type = section || (/(?:项目|系统|平台|小程序|课题)/.test(context) ? "project" : "work");
    return [{ type, title: clean(lines[index - 1] ?? ""), organization: "", dates, description: lines.slice(index + 1, index + 4).join("\n"), sourceIds: [block.id] }];
  });
}

export function buildFacts(sourceBlocks) {
  const sourceText = sourceBlocks.map((block) => block.text).join("\n");
  const firstLine = sourceBlocks.flatMap((block) => block.text.split(/\r?\n/)).find((line) => line.trim())?.trim() ?? "";
  const contacts = [...new Set([
    ...(sourceText.match(EMAIL_PATTERN) ?? []),
    ...(sourceText.match(PHONE_PATTERN) ?? []),
  ])];

  const education = sourceBlocks.flatMap(extractEducation).sort((a, b) => startDate(b.dates) - startDate(a.dates));
  const experiences = sourceBlocks.flatMap(extractExperiences).sort((a, b) => startDate(b.dates) - startDate(a.dates));
  const skills = [...new Set(sourceBlocks.flatMap(extractSkills))];
  return {
    name: NAME_PATTERN.test(firstLine) ? firstLine : "",
    contact: contacts.join(" "),
    education,
    experiences,
    skills,
    sourceBlocks,
    warnings: [],
  };
}
