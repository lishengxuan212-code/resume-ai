import { AppError } from './errors.js';
import { METHODOLOGY_VERSION, methodologyRuleMap, selectMethodologyRules } from './methodology/index.js';
import { MAX_CONFIRMED_SOURCE_BLOCKS, MAX_DIAGNOSIS_QUESTIONS, MAX_SOURCE_BLOCKS, MAX_SOURCE_BLOCK_TEXT_LENGTH } from './source-limits.js';
import { validateDiagnosis } from './diagnosis-validation.js';
import { normalizedSectionType, validSectionType } from '../shared/resume/section-types.js';

export function providerFailed() { return new AppError(502, 'provider_failed', 'AI 服务暂时无法生成简历，请稍后重试。'); }
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const isList = (value, max, required = true) => Array.isArray(value) && value.length <= max && (!required || value.length > 0);
const experienceDateRank = value => {
  const values = [...String(value ?? '').matchAll(/(\d{4})(?:[.\-/年]\s*(\d{1,2}))?/g)]
    .map(([, year, month]) => Number(year) * 100 + Number(month || 12));
  return values.length ? Math.max(...values) : -1;
};
const recentFirst = entries => entries.map((entry, index) => ({ entry, index, rank: experienceDateRank(entry.dates) }))
  .sort((left, right) => right.rank - left.rank || left.index - right.index).map(item => item.entry);

function cleanAnswers(value, fail) {
  const answers = value === undefined ? [] : value;
  if (!isList(answers, MAX_DIAGNOSIS_QUESTIONS, false)) fail();
  const ids = new Set();
  return answers.map(answer => {
    if (!isObject(answer) || !isText(answer.questionId, 40, true) || !isText(answer.answer, 3000, true) || ids.has(answer.questionId)) fail();
    ids.add(answer.questionId);
    return { questionId: answer.questionId.trim(), answer: answer.answer.trim() };
  });
}

export function appendAnswerSources(facts, answers) {
  if (!answers?.length) return facts;
  const used = new Set(facts.sourceBlocks.map(block => block.id));
  const blocks = answers.map((answer, index) => {
    const stem = `answer-${String(answer.questionId || index + 1).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || index + 1}`;
    let id = stem; let suffix = 2;
    while (used.has(id)) id = `${stem}-${suffix++}`;
    used.add(id);
    return { id, text: answer.answer, page: null };
  });
  if (facts.sourceBlocks.length + blocks.length > MAX_CONFIRMED_SOURCE_BLOCKS) throw new AppError(400, 'request_invalid', '补充回答过多，无法加入当前材料。');
  return { ...facts, sourceBlocks: [...facts.sourceBlocks, ...blocks] };
}

export function validateOptimizedResume(value, facts, provider, model, options = {}) {
  const fail = () => { throw providerFailed(); };
  if (!isObject(value) || value.methodologyVersion !== METHODOLOGY_VERSION || !isText(value.summary, 1000) || !isText(value.targetRole, 200, true) || !isList(value.sections, 8)) fail();
  if (!isObject(facts) || !isList(facts.sourceBlocks, MAX_CONFIRMED_SOURCE_BLOCKS)) fail();
  const sources = new Map(facts.sourceBlocks.map(block => [block?.id, block?.text ?? '']));
  const normalize = text => String(text ?? '').replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase();
  const allSourceText = normalize([...sources.values()].join('\n'));
  const genericTitles = new Set(['教育背景', '工作经历', '项目经历', '专业技能', '核心技能', '技能', '个人概述', '个人优势'].map(normalize));
  const skillSectionTitles = new Set(['技能', '专业技能', '核心技能', '技能清单', '专业能力'].map(normalize));
  const knownRules = methodologyRuleMap();
  const internalRuleCode = new RegExp(`(^|[^A-Za-z0-9])(?:${[...knownRules.keys()].join('|')})(?=$|[^A-Za-z0-9])`, 'i');
  const isVisibleText = (value, max, required = false) => isText(value, max, required) && !internalRuleCode.test(value);
  const allowedRules = new Set(options.ruleIds ?? knownRules.keys());
  const validRules = ids => isList(ids, 16) && ids.every(id => typeof id === 'string' && knownRules.has(id) && allowedRules.has(id));
  const validSources = ids => isList(ids, MAX_SOURCE_BLOCKS) && ids.every(id => typeof id === 'string' && sources.has(id));
  const numberTokens = text => [...String(text ?? '').replaceAll('％', '%').matchAll(/\d+(?:[.,]\d+)*(?:%)?/g)].map(match => match[0]);
  const validNumbers = (output, ids) => {
    if (options.userConfirmedEdits) return true;
    const cited = ids.map(id => sources.get(id)).join(' ');
    const citedNumbers = new Set(numberTokens(cited));
    return numberTokens(output).every(number => citedNumbers.has(number));
  };
  const validSkillPresentation = (output, ids, type) => {
    if (options.userConfirmedEdits) return true;
    if (type !== 'skills') return true;
    if (output.length > 160 || /企业内部|公司内部|企业自研|内部\s*AI|自研数据看板/i.test(output)) return false;
    const cited = ids.map(id => sources.get(id)).join(' ');
    return [...output.matchAll(/精通|熟练|掌握|擅长/g)].every(match => cited.includes(match[0]));
  };
  const skillCategoryTitles = new Set(['办公软件', '办公技能', '办公工具', '数据分析', '专业工具', '工具技能', '语言能力', '专业能力', '技能与工具'].map(normalize));
  const genericBulletTitles = new Set(['工作内容', '经历描述', '工作职责', '职责描述', '主要工作', '核心职责', '项目内容', '经历要点'].map(normalize));
  const genericSkillBulletTitles = new Set(['商业化运营', '用户运营', '产品运营', '运营技能', '工具', '常用工具', '工具使用', '工具能力', '技能清单', '专业技能', '专业能力', '核心技能'].map(normalize));
  const validEntryMetadata = (entry, type) => {
    if (options.userConfirmedEdits) return true;
    const title = normalize(entry.title);
    const organization = normalize(entry.organization);
    const metadataNumbers = `${entry.title} ${entry.organization} ${entry.dates}`.match(/\d+(?:[.,]\d+)*/g) ?? [];
    const isSkillCategory = type === 'skills' && !organization && !entry.dates && (skillCategoryTitles.has(title) || /技能|工具|软件|语言|证书/.test(entry.title));
    return (!title || genericTitles.has(title) || isSkillCategory || allSourceText.includes(title))
      && (!organization || allSourceText.includes(organization))
      && metadataNumbers.every(number => [...sources.values()].some(text => text.includes(number)));
  };
  const derivedExperienceDurations = value.summary.match(/(?:约|近|超过|共)?[一二三四五六七八九十两\d]+(?:余|多)?年(?:工作|相关)?(?:经验|经历)/g) ?? [];
  if (!isVisibleText(value.summary, 1000) || !validNumbers(value.summary, [...sources.keys()]) || (!options.userConfirmedEdits && derivedExperienceDurations.some(duration => !allSourceText.includes(normalize(duration))))) fail();
  const sections = value.sections.map(section => {
    if (!isObject(section) || !isVisibleText(section.heading, 200, true) || !isList(section.entries, 20) || (section.type !== undefined && !validSectionType(section.type))) fail();
    const inferredType = normalizedSectionType(section.type, section.heading);
    const type = inferredType === 'skills' || skillSectionTitles.has(normalize(section.heading)) ? 'skills' : inferredType;
    const heading = type === 'skills' ? '技能' : section.heading.trim();
    const entries = section.entries.map(entry => {
      const allowsEmptyBullets = type === 'education';
      const skillEntry = type === 'skills';
      if (!isObject(entry) || !['title', 'organization', 'dates'].every(key => isVisibleText(entry[key], 200)) || !isList(entry.bullets, 8, !allowsEmptyBullets) || (skillEntry ? Boolean(entry.organization.trim() || entry.dates.trim()) : !validEntryMetadata(entry, type))) fail();
      const bullets = entry.bullets.map(bullet => {
        if (!isObject(bullet) || !isVisibleText(bullet.title, 80, true) || (!options.userConfirmedEdits && (genericBulletTitles.has(normalize(bullet.title)) || (skillEntry && genericSkillBulletTitles.has(normalize(bullet.title))))) || !isVisibleText(bullet.text, 500, true) || !validSources(bullet.sourceIds) || !validRules(bullet.ruleIds) || !bullet.ruleIds.includes('F01') || !validNumbers(`${bullet.title} ${bullet.text}`, bullet.sourceIds) || !validSkillPresentation(`${bullet.title} ${bullet.text}`, bullet.sourceIds, type)) fail();
        return { title: bullet.title.trim(), text: bullet.text.trim(), sourceIds: [...bullet.sourceIds], ruleIds: [...bullet.ruleIds] };
      });
      return { title: skillEntry ? '' : entry.title, organization: entry.organization, dates: entry.dates, bullets };
    });
    return { type, heading, entries: type === 'experience' ? recentFirst(entries) : entries };
  });
  const answeredQuestionIds = new Set((options.answers ?? []).filter(answer => answer?.answer?.trim()).map(answer => answer.questionId));
  const unresolvedPercentages = (options.diagnosis?.findings ?? []).flatMap(finding => {
    const diagnosisText = `${finding.issue ?? ''} ${finding.suggestedAction ?? ''}`;
    if (!/歧义|口径|基期|同比|环比|百分点|绝对增长|翻倍/.test(diagnosisText)) return [];
    const evidenceIds = new Set(finding.evidenceSourceIds ?? []);
    const relatedQuestions = (options.diagnosis?.questions ?? []).filter(question => question.sourceIds?.some(id => evidenceIds.has(id)));
    if (relatedQuestions.some(question => answeredQuestionIds.has(question.id))) return [];
    return [...diagnosisText.matchAll(/\d+(?:[.,]\d+)*(?:%|％)/g)].map(match => match[0]);
  });
  const generatedVisibleText = [value.summary, ...sections.flatMap(section => [section.heading, ...section.entries.flatMap(entry => [entry.title, entry.organization, entry.dates, ...entry.bullets.flatMap(bullet => [bullet.title, bullet.text])])])].join('\n');
  if (unresolvedPercentages.some(number => generatedVisibleText.includes(number))) fail();
  const omissions = value.omissions === undefined ? [] : value.omissions;
  if (!isList(omissions, 30, false)) fail();
  const cleanOmissions = omissions.map(item => {
    if (!isObject(item) || !validSources(item.sourceIds) || !isVisibleText(item.reason, 300, true) || !validRules(item.ruleIds)) fail();
    return { sourceIds: [...item.sourceIds], reason: item.reason.trim(), ruleIds: [...item.ruleIds] };
  });
  const warnings = value.warnings === undefined ? [] : value.warnings;
  if (!isList(warnings, 20, false) || !warnings.every(item => isVisibleText(item, 300, true))) fail();
  return { methodologyVersion: METHODOLOGY_VERSION, summary: value.summary, targetRole: value.targetRole, sections, omissions: cleanOmissions, warnings: [...warnings], provider, model, ...(value.quality ? { quality: value.quality } : {}) };
}

export function validateOptimizeInput(value) {
  const fail = () => { throw new AppError(400, 'request_invalid', '请提供有效的简历事实、来源片段和目标岗位。'); };
  if (!isObject(value) || !isText(value.targetRole, 200, true) || !isObject(value.facts)) fail();
  const facts = value.facts;
  if (!isList(facts.sourceBlocks, MAX_CONFIRMED_SOURCE_BLOCKS)) fail();
  const answerBlockCount = facts.sourceBlocks.filter(block => typeof block?.id === 'string' && block.id.startsWith('answer-')).length;
  if (answerBlockCount > MAX_DIAGNOSIS_QUESTIONS || facts.sourceBlocks.length - answerBlockCount > MAX_SOURCE_BLOCKS) fail();
  const ids = new Set();
  const sourceBlocks = facts.sourceBlocks.map(block => {
    if (!isObject(block) || !isText(block.id, 200, true) || !isText(block.text, MAX_SOURCE_BLOCK_TEXT_LENGTH, true) || ids.has(block.id)) fail();
    if (block.page !== undefined && block.page !== null && (!Number.isInteger(block.page) || block.page < 1)) fail();
    ids.add(block.id);
    return { id: block.id, text: block.text, page: block.page ?? null };
  });
  const textField = (field, max = 12000) => {
    const text = facts[field] === undefined ? '' : facts[field];
    if (!isText(text, max)) fail();
    return text;
  };
  const textList = field => {
    const values = facts[field] === undefined ? [] : facts[field];
    if (!isList(values, 100, false) || !values.every(text => isText(text, 12000, true))) fail();
    return [...values];
  };
  const entries = (field, keys) => {
    const values = facts[field] === undefined ? [] : facts[field];
    if (!isList(values, 20, false)) fail();
    return values.map(entry => {
      if (!isObject(entry) || !keys.every(key => isText(entry[key], key === 'description' ? 12000 : 200))) fail();
      if (!isList(entry.sourceIds, MAX_SOURCE_BLOCKS) || !entry.sourceIds.every(id => typeof id === 'string' && ids.has(id))) fail();
      return { ...Object.fromEntries(keys.map(key => [key, entry[key]])), sourceIds: [...entry.sourceIds] };
    });
  };
  const answers = cleanAnswers(value.answers, fail);
  if (value.skipQuestions !== undefined && typeof value.skipQuestions !== 'boolean') fail();
  const jobDescription = value.jobDescription === undefined ? '' : value.jobDescription;
  if (!isText(jobDescription, 12000)) fail();
  const cleanFacts = { name: textField('name', 200), contact: textField('contact'), education: entries('education', ['school', 'major', 'degree', 'dates']), experiences: entries('experiences', ['title', 'organization', 'dates', 'description']), skills: textList('skills'), sourceBlocks, warnings: textList('warnings') };
  let diagnosis;
  if (value.diagnosis !== undefined && value.diagnosis !== null) {
    try {
      const checked = validateDiagnosis(value.diagnosis, cleanFacts, 'context', 'context');
      diagnosis = { methodologyVersion: checked.methodologyVersion, findings: checked.findings, questions: checked.questions, canOptimizeDirectly: true };
    } catch { fail(); }
  }
  return { facts: appendAnswerSources(cleanFacts, answers), targetRole: value.targetRole.trim(), jobDescription: jobDescription.trim(), answers, skipQuestions: Boolean(value.skipQuestions), ruleIds: selectMethodologyRules({ stage: 'optimize', targetRole: value.targetRole, jobDescription }).map(rule => rule.id), ...(diagnosis ? { diagnosis } : {}) };
}

export function validateDiagnosisInput(value) {
  const input = validateOptimizeInput({ ...value, answers: [], skipQuestions: false });
  return { facts: input.facts, targetRole: input.targetRole, jobDescription: input.jobDescription, ruleIds: selectMethodologyRules({ stage: 'diagnose', targetRole: input.targetRole, jobDescription: input.jobDescription }).map(rule => rule.id) };
}
