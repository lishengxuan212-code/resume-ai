export const SECTION_TYPES = Object.freeze([
  'experience', 'education', 'project', 'skills', 'campus', 'award', 'certificate', 'custom',
]);

const aliases = new Map([
  ['技能', 'skills'], ['专业技能', 'skills'], ['核心技能', 'skills'], ['技能清单', 'skills'], ['专业能力', 'skills'],
  ['教育经历', 'education'], ['教育背景', 'education'],
  ['项目经历', 'project'], ['项目经验', 'project'],
  ['实习经历', 'experience'], ['工作经历', 'experience'], ['相关经历', 'experience'],
  ['校园经历', 'campus'], ['获奖经历', 'award'], ['荣誉奖项', 'award'], ['证书', 'certificate'],
]);

export function inferSectionType(heading) {
  const normalized = String(heading ?? '').trim();
  return aliases.get(normalized) ?? 'custom';
}

export function validSectionType(value) {
  return SECTION_TYPES.includes(value);
}

export function normalizedSectionType(value, heading) {
  return validSectionType(value) ? value : inferSectionType(heading);
}
