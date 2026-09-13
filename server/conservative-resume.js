import { METHODOLOGY_VERSION } from './methodology/index.js';

const clean = value => String(value ?? '').trim();
const sourceIdsFor = (entry, facts) => entry?.sourceIds?.filter(id => facts.sourceBlocks.some(block => block.id === id))?.length
  ? entry.sourceIds.filter(id => facts.sourceBlocks.some(block => block.id === id))
  : facts.sourceBlocks.slice(0, 1).map(block => block.id);

function splitDescription(value) {
  const chunks = clean(value).split(/\n+/).flatMap(line => line.match(/[^。！？；]{1,470}[。！？；]?/gu) ?? []).map(clean).filter(Boolean);
  return chunks.length ? chunks.slice(0, 8) : [];
}

function factBullet(text, fallbackTitle, sourceIds, index) {
  const matched = text.match(/^\s*(?:\d+[.、．]\s*)?([^：:]{2,40})[：:]\s*(.+)$/u);
  const title = clean(matched?.[1]) || clean(fallbackTitle) || '已核对经历';
  const body = clean(matched?.[2]) || clean(text);
  return { title, text: body.slice(0, 500), sourceIds, ruleIds: ['F01'], id: `fallback-bullet-${index + 1}` };
}

function experienceSection(facts) {
  const entries = (facts.experiences ?? []).flatMap((entry, entryIndex) => {
    const sourceIds = sourceIdsFor(entry, facts);
    const bullets = splitDescription(entry.description).map((text, bulletIndex) => factBullet(text, entry.title, sourceIds, bulletIndex));
    return bullets.length ? [{ id: `fallback-experience-${entryIndex + 1}`, title: clean(entry.title), organization: clean(entry.organization), dates: clean(entry.dates), bullets }] : [];
  });
  return entries.length ? { type: 'experience', heading: '工作/实习经历', entries } : null;
}

function sourceSection(facts) {
  const source = facts.sourceBlocks.find(block => clean(block.text));
  if (!source) return null;
  const bullets = splitDescription(source.text).slice(0, 4).map((text, index) => factBullet(text, '已核对经历', [source.id], index));
  return bullets.length ? { type: 'custom', heading: '相关经历', entries: [{ id: 'fallback-source-entry', title: '', organization: '', dates: '', bullets }] } : null;
}

function skillSection(facts) {
  const sourceIds = facts.sourceBlocks.slice(0, 1).map(block => block.id);
  const bullets = (facts.skills ?? []).flatMap((skill, index) => {
    const [label, ...rest] = clean(skill).split(/[：:]/u);
    const title = clean(rest.length ? label : '实践方法');
    const text = clean(rest.length ? rest.join('：') : skill);
    return title && text ? [{ id: `fallback-skill-${index + 1}`, title, text: text.slice(0, 160), sourceIds, ruleIds: ['F01'] }] : [];
  });
  return bullets.length ? { type: 'skills', heading: '技能', entries: [{ id: 'fallback-skills', title: '', organization: '', dates: '', bullets }] } : null;
}

/** A transparent no-invention fallback used only when the user skips diagnosis questions. */
export function buildConservativeResume(input) {
  const facts = input.facts;
  const experience = experienceSection(facts);
  const sections = [experience, skillSection(facts), !experience && sourceSection(facts)].filter(Boolean);
  return {
    methodologyVersion: METHODOLOGY_VERSION,
    summary: '基于已核对事实整理。',
    targetRole: clean(input.targetRole),
    sections: sections.length ? sections : [{ type: 'custom', heading: '相关经历', entries: [{ id: 'fallback-empty', title: '', organization: '', dates: '', bullets: [{ id: 'fallback-empty-bullet', title: '已核对经历', text: clean(facts.sourceBlocks[0]?.text).slice(0, 500) || '未提供可整理的经历内容。', sourceIds: facts.sourceBlocks.slice(0, 1).map(block => block.id), ruleIds: ['F01'] }] }] }],
    omissions: [],
    warnings: ['AI 未能完成有效改写，当前版本仅按已核对事实保守整理；投递前请自行核对表达。'],
  };
}
