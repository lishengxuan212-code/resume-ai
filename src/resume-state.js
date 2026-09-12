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
    experiences: experience ? [{ title: '', organization: '', dates: '', description: experience, sourceIds: ['form-b3'] }] : [],
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
  const entries = (list, keys) => list.filter(entry => keys.some(key => trim(entry[key]))).map(entry => {
    const sourceIds = entry.sourceIds.map(trim);
    if (!sourceIds.length || sourceIds.some(id => !ids.has(id))) throw new Error('这条材料的来源尚未保存，请补充内容后重试。');
    return { ...Object.fromEntries(keys.map(key => [key, trim(entry[key])])), sourceIds };
  });
  return {
    name: trim(facts.name), contact: trim(facts.contact),
    education: entries(facts.education, ['school', 'major', 'degree', 'dates']),
    experiences: entries(facts.experiences, ['title', 'organization', 'dates', 'description']),
    skills: facts.skills.map(trim).filter(Boolean), warnings: facts.warnings.map(trim).filter(Boolean), sourceBlocks,
  };
}

export function updateReviewedSkills(facts, text) {
  const id = 'review-skills';
  let sourceBlocks = facts.sourceBlocks.filter(block => block.id !== id);
  if (trim(text)) {
    if (sourceBlocks.length >= 30) throw new Error('补充材料已达到上限，请先精简来源原文。');
    sourceBlocks = [...sourceBlocks, { id, text: trim(text), page: null }];
  }
  return { ...facts, skills: text.split('\n'), sourceBlocks };
}

// Keep provenance out of the user's way. An edited entry becomes a separately
// recorded user statement; the imported original stays available for comparison.
export function updateReviewedEntry(facts, collection, index, patch) {
  const entry = { ...facts[collection][index], ...patch };
  const fields = collection === 'education'
    ? [['school', '学校'], ['major', '专业'], ['degree', '学历'], ['dates', '就读时间']]
    : [['organization', '公司或组织'], ['title', '职位'], ['dates', '工作时间'], ['description', '工作内容']];
  const text = fields.filter(([key]) => trim(entry[key])).map(([key, label]) => `${label}：${trim(entry[key])}`).join('\n');
  if (text.length > 12000) throw new Error('这条材料过长，请精简后再保存。');
  let id = entry.sourceIds.find(value => /^review-entry-\d+$/.test(value));
  let sourceBlocks = [...facts.sourceBlocks];
  if (text) {
    if (!id) {
      if (sourceBlocks.length >= 30) throw new Error('补充材料已达到上限，请先精简来源原文。');
      let number = 1;
      while (sourceBlocks.some(block => block.id === `review-entry-${number}`)) number++;
      id = `review-entry-${number}`;
      sourceBlocks.push({ id, text, page: null });
    } else sourceBlocks = sourceBlocks.map(block => block.id === id ? { ...block, text } : block);
    entry.sourceIds = [id];
  } else {
    sourceBlocks = sourceBlocks.filter(block => block.id !== id);
    entry.sourceIds = [];
  }
  return { ...facts, sourceBlocks, [collection]: facts[collection].map((item, i) => i === index ? entry : item) };
}

export function removeReviewedEntry(facts, collection, index) {
  const removedIds = facts[collection][index].sourceIds.filter(id => /^review-entry-\d+$/.test(id));
  const next = { ...facts, [collection]: facts[collection].filter((_, i) => i !== index) };
  const remainingIds = new Set([...next.education, ...next.experiences].flatMap(entry => entry.sourceIds));
  return { ...next, sourceBlocks: facts.sourceBlocks.filter(block => !removedIds.includes(block.id) || remainingIds.has(block.id)) };
}
