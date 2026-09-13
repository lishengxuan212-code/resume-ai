import { normalizedSectionType } from './section-types.js';
import { normalizeResumeText } from './display-text.js';

const text = value => normalizeResumeText(value);
const rawText = value => typeof value === 'string' ? value.trim() : '';
const stableId = (kind, first, second) => `${kind}-${first}-${second}`;

/** Converts checked resume content into a template-only document model. */
export function toRenderResume(facts = {}, resume = {}, presentation = {}) {
  return {
    schemaVersion: 1,
    basics: {
      name: text(facts.name),
      headline: text(resume.targetRole),
      contactText: rawText(facts.contact),
      avatarDataUrl: rawText(presentation.avatarDataUrl),
    },
    summary: text(resume.summary),
    sections: (resume.sections ?? []).map((section, sectionIndex) => ({
      id: text(section.id) || stableId('section', sectionIndex + 1, normalizedSectionType(section.type, section.heading)),
      type: normalizedSectionType(section.type, section.heading),
      title: text(section.heading),
      items: (section.entries ?? []).map((entry, entryIndex) => ({
        id: text(entry.id) || stableId('entry', sectionIndex + 1, entryIndex + 1),
        title: text(entry.title),
        organization: text(entry.organization),
        period: text(entry.dates),
        bullets: (entry.bullets ?? []).map((bullet, bulletIndex) => ({
          id: text(bullet.id) || stableId('bullet', `${sectionIndex + 1}-${entryIndex + 1}`, bulletIndex + 1),
          title: text(bullet.title),
          text: text(typeof bullet === 'string' ? bullet : bullet.text),
        })).filter(bullet => bullet.title || bullet.text),
      })),
    })).filter(section => section.title && section.items.length),
  };
}
