import { RecommendedTemplate } from './templates/recommended.js';

const templates = Object.freeze({
  recommended: Object.freeze({ id: 'recommended', name: '推荐', version: 1, create: RecommendedTemplate }),
});

export function getResumeTemplate(id = 'recommended') {
  return templates[id] ?? null;
}

export function listResumeTemplates() {
  return Object.values(templates).map(({ id, name, version }) => ({ id, name, version }));
}
