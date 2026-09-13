import { normalizedSectionType } from './section-types.js';
import { normalizeResumeText, wrapChinesePdfText } from './display-text.js';
import { withoutEducationBackground } from './summary.js';

const text = value => normalizeResumeText(value);
const displayText = value => wrapChinesePdfText(value);
const rawText = value => typeof value === 'string' ? value.trim() : '';
const stableId = (kind, first, second) => `${kind}-${first}-${second}`;

/** Converts checked resume content into a template-only document model. */
export function toRenderResume(facts = {}, resume = {}, presentation = {}) {
  return {
    schemaVersion: 1,
    basics: {
      name: displayText(facts.name),
      headline: displayText(resume.targetRole),
      contactText: rawText(facts.contact),
      avatarDataUrl: rawText(presentation.avatarDataUrl),
      education: (facts.education ?? []).map((entry, index) => ({
        id: text(entry.id) || stableId('education', index + 1, 1),
        school: displayText(entry.school),
        major: displayText(entry.major),
        degree: displayText(entry.degree),
        period: displayText(entry.dates),
      })).filter(entry => entry.school || entry.major || entry.degree || entry.period),
    },
    summary: wrapChinesePdfText(withoutEducationBackground(text(resume.summary), facts.education)),
    sections: (resume.sections ?? []).filter(section => !(facts.education?.length && normalizedSectionType(section.type, section.heading) === 'education')).map((section, sectionIndex) => ({
      id: text(section.id) || stableId('section', sectionIndex + 1, normalizedSectionType(section.type, section.heading)),
      type: normalizedSectionType(section.type, section.heading),
      title: displayText(section.heading),
      items: (section.entries ?? []).map((entry, entryIndex) => ({
        id: text(entry.id) || stableId('entry', sectionIndex + 1, entryIndex + 1),
        title: displayText(entry.title),
        organization: displayText(entry.organization),
        period: displayText(entry.dates),
        bullets: (entry.bullets ?? []).map((bullet, bulletIndex) => ({
          id: text(bullet.id) || stableId('bullet', `${sectionIndex + 1}-${entryIndex + 1}`, bulletIndex + 1),
          title: displayText(bullet.title),
          text: displayText(typeof bullet === 'string' ? bullet : bullet.text),
        })).filter(bullet => bullet.title || bullet.text),
      })),
    })).filter(section => section.title && section.items.length),
  };
}
