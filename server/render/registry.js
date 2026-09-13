import { ClassicTemplate } from './templates/classic.js';
import { MinimalTemplate } from './templates/minimal.js';
import { SidebarTemplate } from './templates/sidebar.js';

const templates = Object.freeze({
  classic: Object.freeze({ id: 'classic', name: '经典', version: 1, create: ClassicTemplate }),
  minimal: Object.freeze({ id: 'minimal', name: '简约', version: 1, create: MinimalTemplate }),
  sidebar: Object.freeze({ id: 'sidebar', name: '紧凑', version: 1, create: SidebarTemplate }),
});

export function getResumeTemplate(id = 'classic') {
  return templates[id] ?? null;
}

export function listResumeTemplates() {
  return Object.values(templates).map(({ id, name, version }) => ({ id, name, version }));
}
