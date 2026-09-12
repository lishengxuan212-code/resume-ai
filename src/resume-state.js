const trim = value => typeof value === 'string' ? value.trim() : '';

export function draftToFacts(draft) {
  const name = trim(draft.name), contact = trim(draft.contact), targetRole = trim(draft.role);
  const school = trim(draft.school), major = trim(draft.major), experience = trim(draft.experience);
  const blocks = [
    ['form-b1', [name, contact, targetRole].filter(Boolean).join('\n')],
    ['form-b2', [school, major].filter(Boolean).join('\n')],
    ['form-b3', experience],
  ];
  return {
    name, contact, targetRole,
    education: school || major ? [{ school, major, degree: '', dates: '', sourceIds: ['form-b2'] }] : [],
    experiences: experience ? [{ type: 'work', title: '', organization: '', dates: '', description: experience, sourceIds: ['form-b3'] }] : [],
    skills: [], warnings: [],
    sourceBlocks: blocks.filter(([, text]) => text).map(([id, text]) => ({ id, text, page: null })),
  };
}

export function factsToDraft(facts) {
  return {
    name: trim(facts.name), contact: trim(facts.contact),
    school: trim(facts.education?.[0]?.school), major: trim(facts.education?.[0]?.major),
    role: trim(facts.targetRole),
    experience: (facts.experiences ?? []).map(entry => trim(entry.description)).filter(Boolean).join('\n\n'),
  };
}

export function prepareReviewedFacts(facts) {
  const sourceBlocks = facts.sourceBlocks.map(block => ({ id: trim(block.id), text: trim(block.text), page: block.page ?? null }));
  if (!sourceBlocks.length || sourceBlocks.some(block => !block.text)) throw new Error('请补充来源原文，不能提交空白来源。');
  const ids = new Set(sourceBlocks.map(block => block.id));
  if (ids.size !== sourceBlocks.length || ids.has('')) throw new Error('来源标识有误，请重新选择简历。');
  const entries = (list, keys) => list.map(entry => {
    const sourceIds = entry.sourceIds.map(trim);
    if (!sourceIds.length || sourceIds.some(id => !ids.has(id))) throw new Error('请为每条教育和经历选择对应的来源原文。');
    return { ...Object.fromEntries(keys.map(key => [key, trim(entry[key])])), sourceIds };
  });
  return {
    name: trim(facts.name), contact: trim(facts.contact),
    education: entries(facts.education, ['school', 'major', 'degree', 'dates']),
    experiences: entries(facts.experiences, ['type', 'title', 'organization', 'dates', 'description']).map((entry) => ({ ...entry, type: entry.type === 'project' ? 'project' : 'work' })),
    skills: facts.skills.map(trim).filter(Boolean), warnings: facts.warnings.map(trim).filter(Boolean), sourceBlocks,
  };
}
