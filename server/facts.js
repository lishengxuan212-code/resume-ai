const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const NAME_PATTERN = /^[\p{Script=Han}]{2,6}$/u;
const DATE_RANGE = /(20\d{2}(?:[.\/-]\d{1,2})?\s*(?:至|到|[-—~～]+)\s*(?:20\d{2}(?:[.\/-]\d{1,2})?|至今|现在))/;
const SCHOOL = /([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z· ]{1,30}(?:大学|学院|学校|University|College))/u;
const DEGREE = /(博士|硕士(?:研究生)?|学士|本科|大专|专科|高中|MBA)/;
const SKILL_SECTION_HEADING = /^(?:技能\s*[／/]?\s*(?:证书及其他)?|专业技能|专业能力|技能|证书(?:[／/]执照)?|资格证|语言能力)(?:[：:]|\s|$)/i;
const WORK_HEADING = /^(?:工作(?:\/|和)?实习经历|工作经历|工作经验|任职经历|实习经历|职业经历|社会实践)(?:[：:]|\s|$)/i;
const EDUCATION_HEADING = /^(?:教育背景|教育经历|学历)(?:[：:]|\s|$)/i;
const SECTION_HEADING = /^(?:教育背景|教育经历|学历|工作(?:\/|和)?实习经历|工作经历|工作经验|任职经历|实习经历|职业经历|社会实践|项目经历|项目经验|技能\s*[／/]?\s*(?:证书及其他)?|专业技能|证书|资格证|个人优势总结|个人优势|个人总结|自我评价|个人评价|兴趣爱好)(?:[：:]|\s|$)/i;
const ORGANIZATION = /(?:公司|集团|银行|事务所|工作室|中心|有限公司)/;
const BULLET_PREFIX = /^[●•·\-\uF06C]\s*/u;

function clean(value) { return String(value ?? '').replace(/^[：:\s•·-]+|[：:\s；;，,。]+$/g, '').trim(); }
function lines(block) { return block.text.split(/\r?\n/u).map(clean).filter(Boolean); }
function records(sourceBlocks) {
  return sourceBlocks.flatMap(block => block.text.split(/\r?\n/u)
    .map(text => text.trim()).filter(Boolean)
    .map(text => ({ text, sourceId: block.id, page: block.page ?? null })));
}
function startDate(dates) { return Number((dates.match(/20\d{2}/)?.[0] ?? '0')); }

function extractName(sourceBlocks) {
  const text = sourceBlocks.map(block => block.text).join('\n');
  const labelled = text.match(/(?:姓名|名字)[：:\s]*([\p{Script=Han}]{2,6})/u)?.[1];
  if (labelled) return labelled;
  return sourceBlocks.slice(0, 2).flatMap(lines).slice(0, 8).find(line => NAME_PATTERN.test(line) && !SECTION_HEADING.test(line) && !/(?:大学|学院|专业|简历|求职)/.test(line)) ?? '';
}

const normalizeSkill = value => value
  .replace(BULLET_PREFIX, '')
  .replace(/\s+/g, ' ')
  .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '')
  .replace(/\s*([：:、，,／/])\s*/g, '$1')
  .trim();

/** Only explicit skill/certificate sections may produce skills. */
function extractSkills(sourceBlocks) {
  const all = records(sourceBlocks);
  const headings = all.map((record, index) => SKILL_SECTION_HEADING.test(record.text) ? index : -1).filter(index => index >= 0);
  const result = [];
  for (const start of headings) {
    const endIndex = all.findIndex((record, index) => index > start && SECTION_HEADING.test(record.text));
    const end = endIndex < 0 ? all.length : endIndex;
    let current = normalizeSkill(all[start].text.replace(SKILL_SECTION_HEADING, ''));
    const flush = () => {
      const value = normalizeSkill(current);
      if (value) result.push(value);
      current = '';
    };
    for (const record of all.slice(start + 1, end)) {
      const line = record.text.trim();
      if (BULLET_PREFIX.test(line)) {
        flush();
        current = line.replace(BULLET_PREFIX, '');
        continue;
      }
      const labelled = /^[^：:\n]{1,24}[：:]/u.test(line);
      if (!current) current = line;
      else if (labelled && /[：:]/u.test(current)) { flush(); current = line; }
      else current += /[：:]/u.test(current) ? `、${line}` : line;
    }
    flush();
  }
  return [...new Set(result)];
}

function extractEducation(block) {
  const blockLines = lines(block), text = blockLines.join(' ');
  const schoolLine = blockLines.find(line => SCHOOL.test(line)) ?? '';
  const schoolMatch = schoolLine.match(/[\p{Script=Han}A-Za-z]{2,20}(?:大学|学院|学校)/u);
  const school = schoolMatch?.[0] ?? '', degree = text.match(DEGREE)?.[1] ?? '', dates = text.match(DATE_RANGE)?.[1] ?? '';
  if (!school && !degree) return [];
  const labelledMajor = text.match(/(?:专业|主修)[：:\s]*([^，,；;。\n]{2,30}?)(?=\s*(?:专业技能|技能|证书|工作经历|项目经历)|$)/)?.[1]?.trim();
  const educationStart = blockLines.findIndex(line => EDUCATION_HEADING.test(line));
  const end = educationStart < 0 ? blockLines.length : (() => { const index = blockLines.findIndex((line, i) => i > educationStart && SECTION_HEADING.test(line)); return index < 0 ? blockLines.length : index; })();
  const inferredMajor = blockLines.slice(Math.max(0, educationStart), end).find(line => /(?:专业|工程|科学|管理|设计|语言|经济|医学|法学|文学|教育学)$/.test(line) && !SCHOOL.test(line));
  const inlineMajor = schoolMatch ? schoolLine.slice((schoolMatch.index ?? 0) + schoolMatch[0].length).replace(/^[—\-\s]+/, '').split(DEGREE)[0].trim() : '';
  return [{ school, major: labelledMajor || inlineMajor || inferredMajor || '', degree, dates, sourceIds: [block.id] }];
}

function metadataForDate(all, rangeStart, dateIndex) {
  const dateRecord = all[dateIndex];
  const dateMatch = dateRecord.text.match(DATE_RANGE);
  const inline = dateMatch ? dateRecord.text.slice(0, dateMatch.index).trim() : '';
  const inlineParts = inline.split(/\s{2,}/u).filter(Boolean);
  if (inlineParts.length) {
    return {
      headerStart: dateIndex,
      title: clean(inlineParts.at(-1)),
      organization: clean(inlineParts.length > 1 ? inlineParts.slice(0, -1).join(' ') : ''),
      dates: dateMatch?.[1] ?? '',
    };
  }
  const titleRecord = all[dateIndex - 1];
  const organizationRecord = all[dateIndex - 2];
  const organization = organizationRecord && dateIndex - 2 >= rangeStart && ORGANIZATION.test(organizationRecord.text) ? clean(organizationRecord.text) : '';
  return {
    headerStart: organization ? dateIndex - 2 : Math.max(rangeStart, dateIndex - 1),
    title: clean(titleRecord?.text),
    organization,
    dates: dateMatch?.[1] ?? '',
  };
}

/** Parse work ranges across page/source boundaries so continuations stay attached. */
function extractWork(sourceBlocks) {
  const all = records(sourceBlocks);
  const headers = all.map((record, index) => WORK_HEADING.test(record.text) ? index : -1).filter(index => index >= 0);
  const ranges = headers.length
    ? headers.map(start => {
      const endIndex = all.findIndex((record, index) => index > start && SECTION_HEADING.test(record.text));
      return [start + 1, endIndex < 0 ? all.length : endIndex];
    })
    : [[0, all.length]];
  const entries = [];
  for (const [start, end] of ranges) {
    const dateRows = [];
    for (let index = start; index < end; index += 1) {
      if (DATE_RANGE.test(all[index].text) && !/^(?:注|备注|\d{1,2}[.、])/.test(all[index].text)) dateRows.push(index);
    }
    const metadata = dateRows.map(index => metadataForDate(all, start, index));
    for (const [position, dateIndex] of dateRows.entries()) {
      const info = metadata[position];
      const descriptionEnd = metadata[position + 1]?.headerStart ?? end;
      const descriptionRecords = all.slice(dateIndex + 1, descriptionEnd).filter(record => !/^\d{1,2}[.、]$/u.test(record.text));
      const sourceIds = [...new Set(all.slice(info.headerStart, descriptionEnd).map(record => record.sourceId))];
      entries.push({
        title: info.title,
        organization: info.organization,
        dates: info.dates,
        description: descriptionRecords.map(record => record.text).join('\n'),
        sourceIds,
      });
    }
  }
  return entries;
}

export function buildFacts(sourceBlocks) {
  const text = sourceBlocks.map(block => block.text).join('\n');
  const contacts = [...new Set([...(text.match(EMAIL_PATTERN) ?? []), ...(text.match(PHONE_PATTERN) ?? [])])];
  return {
    name: extractName(sourceBlocks), contact: contacts.join(' '),
    education: sourceBlocks.flatMap(extractEducation).sort((a, b) => startDate(b.dates) - startDate(a.dates)),
    experiences: extractWork(sourceBlocks).filter(entry => entry.title || entry.description).sort((a, b) => startDate(b.dates) - startDate(a.dates)),
    skills: extractSkills(sourceBlocks), sourceBlocks, warnings: [],
  };
}
