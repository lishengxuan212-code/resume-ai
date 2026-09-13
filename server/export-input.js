import { normalizedSectionType } from '../shared/resume/section-types.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();

function bullet(value) {
  if (!object(value)) return { title: '', text: text(value) };
  return { title: text(value.title), text: text(value.text) };
}

function entry(value) {
  if (!object(value)) return { title: '', organization: '', dates: '', bullets: [bullet(value)].filter(item => item.text) };
  return {
    title: text(value.title),
    organization: text(value.organization),
    dates: text(value.dates),
    bullets: list(value.bullets).map(bullet).filter(item => item.title || item.text),
  };
}

function section(value, index) {
  if (!object(value)) return { type: 'custom', heading: `相关经历 ${index + 1}`, entries: [entry(value)] };
  const heading = text(value.heading) || `相关经历 ${index + 1}`;
  return {
    type: normalizedSectionType(value.type, heading),
    heading,
    entries: list(value.entries).map(entry).filter(item => item.title || item.organization || item.dates || item.bullets.length),
  };
}

/**
 * PDF export is a user-confirmed presentation step. It intentionally keeps all
 * current text and only normalizes the shape React PDF needs to render safely.
 * Provenance and optimization-quality validation belong to the AI stage, not to
 * a user's ability to preview or download their own edited resume.
 */
export function normalizeExportInput(value = {}) {
  const sourceFacts = object(value.facts) ? value.facts : {};
  const sourceResume = object(value.resume) ? value.resume : {};
  const education = list(sourceFacts.education).filter(object).map(item => ({
    school: text(item.school), major: text(item.major), degree: text(item.degree), dates: text(item.dates),
  }));
  const sections = list(sourceResume.sections).map(section).filter(item => item.entries.length);
  const avatarDataUrl = typeof value.presentation?.avatarDataUrl === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.presentation.avatarDataUrl)
    ? value.presentation.avatarDataUrl
    : '';

  return {
    facts: { name: text(sourceFacts.name), contact: text(sourceFacts.contact), education },
    resume: { summary: text(sourceResume.summary), targetRole: text(sourceResume.targetRole), sections },
    presentation: { avatarDataUrl },
  };
}
