import { METHODOLOGY_VERSION } from './methodology/index.js';
import { normalizeResumeText } from '../shared/resume/display-text.js';

const clean = value => String(value ?? '').trim();
const numberedHeading = /^\s*(\d{1,3})[.、．]\s*(.+)$/u;

const sourceIdsFor = (entry, facts) => entry?.sourceIds?.filter(id => facts.sourceBlocks.some(block => block.id === id))?.length
  ? entry.sourceIds.filter(id => facts.sourceBlocks.some(block => block.id === id))
  : facts.sourceBlocks.slice(0, 1).map(block => block.id);

function joinedText(lines) {
  return lines.map(line => normalizeResumeText(clean(line))).filter(Boolean).join('\n');
}

function titledBullet(title, bodyLines, sourceIds, id) {
  const fullTitle = clean(title) || '已核对经历';
  const visibleTitle = fullTitle.slice(0, 200);
  const titleOverflow = fullTitle.slice(200);
  const text = joinedText([titleOverflow, ...bodyLines]) || visibleTitle;
  return { id, title: visibleTitle, text, sourceIds, ruleIds: ['F01'] };
}

/**
 * Preserve numbered responsibilities from the reviewed material. PDF line
 * wrapping is joined inside a responsibility; no content is split by character
 * count or discarded.
 */
function descriptionBullets(description, fallbackTitle, sourceIds, idPrefix) {
  const lines = clean(description).split(/\r?\n/u).map(clean).filter(Boolean);
  if (!lines.length) return [];

  const bullets = [];
  let prelude = [];
  let current = null;
  const flushCurrent = () => {
    if (!current) return;
    bullets.push(titledBullet(current.title, current.body, sourceIds, `${idPrefix}-${bullets.length + 1}`));
    current = null;
  };
  const flushPrelude = () => {
    if (!prelude.length) return;
    const [first, ...rest] = prelude;
    const labelled = first.match(/^([^：:]{2,80})[：:]\s*(.*)$/u);
    if (labelled) bullets.push(titledBullet(labelled[1], [labelled[2], ...rest], sourceIds, `${idPrefix}-${bullets.length + 1}`));
    else if (prelude.length > 1 && first.length <= 80) bullets.push(titledBullet(first, rest, sourceIds, `${idPrefix}-${bullets.length + 1}`));
    else bullets.push(titledBullet(fallbackTitle || '已核对经历', prelude, sourceIds, `${idPrefix}-${bullets.length + 1}`));
    prelude = [];
  };

  for (const line of lines) {
    const numbered = line.match(numberedHeading);
    if (numbered) {
      flushPrelude();
      flushCurrent();
      current = { title: numbered[2], body: [] };
    } else if (current) current.body.push(line);
    else prelude.push(line);
  }
  flushPrelude();
  flushCurrent();
  return bullets;
}

function experienceSection(facts) {
  const entries = (facts.experiences ?? []).map((entry, entryIndex) => {
    const sourceIds = sourceIdsFor(entry, facts);
    const bullets = descriptionBullets(entry.description, entry.title, sourceIds, `fallback-experience-${entryIndex + 1}`);
    return {
      id: `fallback-experience-${entryIndex + 1}`,
      title: clean(entry.title),
      organization: clean(entry.organization),
      dates: clean(entry.dates),
      bullets: bullets.length ? bullets : [titledBullet(entry.title || '已核对经历', [entry.organization, entry.dates], sourceIds, `fallback-experience-${entryIndex + 1}-1`)],
    };
  }).filter(entry => entry.title || entry.organization || entry.dates || entry.bullets.length);
  return entries.length ? { type: 'experience', heading: '工作/实习经历', entries } : null;
}

function sourceSection(facts) {
  const entries = facts.sourceBlocks.map((source, index) => ({
    id: `fallback-source-${index + 1}`,
    title: '', organization: '', dates: '',
    bullets: descriptionBullets(source.text, '已核对材料', [source.id], `fallback-source-${index + 1}`),
  })).filter(entry => entry.bullets.length);
  return entries.length ? { type: 'custom', heading: '相关经历', entries } : null;
}

function skillSection(facts) {
  const sourceIds = facts.sourceBlocks.slice(0, 1).map(block => block.id);
  const bullets = (facts.skills ?? []).map((skill, index) => {
    const [label, ...rest] = clean(skill).split(/[：:]/u);
    const hasLabel = rest.length > 0;
    return titledBullet(hasLabel ? label : skill, [hasLabel ? rest.join('：') : skill], sourceIds, `fallback-skill-${index + 1}`);
  }).filter(bullet => bullet.text);
  return bullets.length ? { type: 'skills', heading: '技能', entries: [{ id: 'fallback-skills', title: '', organization: '', dates: '', bullets }] } : null;
}

/** A source-preserving draft used only when all structured rewrites fail. */
export function buildConservativeResume(input) {
  const facts = input.facts;
  const experience = experienceSection(facts);
  const skills = skillSection(facts);
  const sections = [experience, skills, !experience && sourceSection(facts)].filter(Boolean);
  return {
    methodologyVersion: METHODOLOGY_VERSION,
    summary: '',
    targetRole: clean(input.targetRole),
    sections,
    omissions: [],
    warnings: [],
  };
}
