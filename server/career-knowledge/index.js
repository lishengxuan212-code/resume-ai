import { CAREER_KNOWLEDGE_VERSION, CAREER_PACKS, CAREER_SOURCES } from './v0.2.js';

const normalize = value => String(value ?? '').replace(/\s+/gu, '').toLowerCase();
const includesAny = (value, patterns) => patterns.some(pattern => value.includes(normalize(pattern)));

export function selectCareerPack(targetRole = '', jobDescription = '') {
  const query = normalize(`${targetRole} ${jobDescription}`);
  const ranked = CAREER_PACKS.filter(pack => pack.id !== 'general').map(pack => ({
    pack,
    score: pack.rolePatterns.reduce((score, pattern) => score + (query.includes(normalize(pattern)) ? normalize(pattern).length : 0), 0),
  })).sort((left, right) => right.score - left.score);
  return ranked[0]?.score > 0 ? ranked[0].pack : CAREER_PACKS.find(pack => pack.id === 'general');
}

function evidenceFor(blocks, item) {
  const matches = blocks.filter(block => includesAny(normalize(block.text), item.patterns)).slice(0, 4);
  return matches.length ? { label: item.label, targetTask: item.targetTask, evidenceSourceIds: matches.map(block => block.id) } : null;
}

export function buildCareerContext({ facts, targetRole = '', jobDescription = '' }) {
  const pack = selectCareerPack(targetRole, jobDescription);
  const blocks = Array.isArray(facts?.sourceBlocks) ? facts.sourceBlocks : [];
  const directEvidence = pack.directEvidence.map(item => evidenceFor(blocks, item)).filter(Boolean);
  const transferableEvidence = pack.transferableEvidence.map(item => evidenceFor(blocks, item)).filter(Boolean);
  const matchedLabels = new Set([...directEvidence, ...transferableEvidence].map(item => item.label));
  const missingEvidence = [
    ...pack.directEvidence.filter(item => !matchedLabels.has(item.label)).map(item => item.targetTask),
    ...pack.commonGaps,
  ].filter((item, index, values) => item && values.indexOf(item) === index).slice(0, 5);
  const matchMode = directEvidence.length ? 'direct' : transferableEvidence.length ? 'transferable' : 'gap';
  const directByLabel = new Map(directEvidence.map(item => [item.label, item]));
  const requirementCoverage = pack.directEvidence.map(item => {
    const evidence = directByLabel.get(item.label);
    return {
      label: item.label,
      requirement: item.targetTask,
      status: evidence ? 'evidenced' : 'missing',
      evidenceSourceIds: evidence?.evidenceSourceIds || [],
    };
  });
  const candidateDirections = CAREER_PACKS.filter(candidate => !['general', pack.id].includes(candidate.id)).map(candidate => {
    const candidateDirect = candidate.directEvidence.map(item => evidenceFor(blocks, item)).filter(Boolean);
    const candidateTransferable = candidate.transferableEvidence.map(item => evidenceFor(blocks, item)).filter(Boolean);
    return { candidate, candidateDirect, candidateTransferable, rank: candidateDirect.length * 3 + candidateTransferable.length };
  }).filter(item => item.rank > 0).sort((left, right) => right.rank - left.rank).slice(0, 3).map(item => ({
    packId: item.candidate.id,
    label: item.candidate.label,
    industry: item.candidate.industry,
    evidenceType: item.candidateDirect.length ? 'direct' : 'transferable',
    evidenceLabels: [...item.candidateDirect, ...item.candidateTransferable].map(evidence => evidence.label).slice(0, 4),
  }));
  const sources = pack.sourceIds.map(id => CAREER_SOURCES[id]).filter(Boolean).map(source => ({
    id: source.id,
    label: source.label,
    publisher: source.publisher,
    publishedAt: source.publishedAt,
    url: source.url,
    scope: source.scope,
    applicableIndustry: source.applicableIndustry,
    roleFamilies: source.roleFamilies,
    seniority: source.seniority,
    evidenceType: source.evidenceType,
    capturedAt: source.capturedAt,
    updateStatus: source.updateStatus,
  }));
  return {
    version: CAREER_KNOWLEDGE_VERSION,
    packId: pack.id,
    label: pack.label,
    industry: pack.industry,
    matchMode,
    roleMission: pack.roleMission,
    requirementCoverage,
    sampleBoundary: {
      asOf: '2026-09-26',
      companyJdSamples: jobDescription.trim() ? 1 : 0,
      userJobDescriptionIncluded: Boolean(jobDescription.trim()),
      basis: jobDescription.trim() ? '用户提供的目标岗位说明 + 离线岗位通用基线' : '离线岗位通用基线',
      note: jobDescription.trim()
        ? '当前覆盖判断包含用户提供的一份目标岗位说明，仍不能代表多数企业。'
        : '当前尚未纳入足够且持续更新的企业岗位样本，只能作为岗位通用基线，不能代表多数企业。',
    },
    directEvidence,
    transferableEvidence,
    missingEvidence,
    candidateDirections,
    sources,
  };
}

export function careerContextForPrompt(input) {
  const context = buildCareerContext(input);
  return {
    ...context,
    instruction: '这是离线职业知识、岗位要求基线和保守的关键词映射，只用于判断相关性、提出问题和选择表达角度，不是用户事实。requirementCoverage 仅表示当前材料对有限要求基线的证据覆盖，不是录用概率，也不能代表多数企业。简历正文中的每个主张仍必须由用户来源支持。不得把行业趋势、岗位任务或缺失证据写成用户已经具备的经历。matchMode=transferable 或 gap 时，应在诊断中明确区分直接证据、可迁移证据和待补证内容。',
  };
}
