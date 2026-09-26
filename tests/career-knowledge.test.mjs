import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCareerContext, careerContextForPrompt, selectCareerPack } from '../server/career-knowledge/index.js';

const facts = (...blocks) => ({ sourceBlocks: blocks.map((text, index) => ({ id: `b${index + 1}`, text, page: 1 })) });

test('selects a versioned role pack from target role and job description', () => {
  assert.equal(selectCareerPack('产品助理').id, 'product');
  assert.equal(selectCareerPack('实习生', '需要完成用户分层和活动复盘').id, 'operations');
  assert.equal(selectCareerPack('未知岗位').id, 'general');
});

test('separates direct, transferable and missing evidence without inventing a score', () => {
  const direct = buildCareerContext({ facts: facts('负责用户访谈并整理用户反馈。'), targetRole: '产品助理' });
  assert.equal(direct.matchMode, 'direct');
  assert.equal(direct.directEvidence[0].evidenceSourceIds[0], 'b1');
  assert.ok(direct.requirementCoverage.some(item => item.status === 'evidenced'));

  const transferable = buildCareerContext({ facts: facts('整理团队周报，跟进项目节点并完成复盘。'), targetRole: '产品助理' });
  assert.equal(transferable.matchMode, 'transferable');
  assert.ok(transferable.transferableEvidence.some(item => item.label === '信息归纳'));
  assert.ok(transferable.candidateDirections.some(item => item.packId === 'operations'));
  assert.equal(Object.hasOwn(transferable, 'score'), false);

  const gap = buildCareerContext({ facts: facts('参加校内合唱演出。'), targetRole: '软件开发工程师' });
  assert.equal(gap.matchMode, 'gap');
  assert.ok(gap.missingEvidence.length > 0);
});

test('career prompt context keeps industry material separate from user facts', () => {
  const context = careerContextForPrompt({ facts: facts('使用 Python 清洗数据并提交分析报告。'), targetRole: '数据分析' });
  assert.equal(context.version, '0.2');
  assert.ok(context.sources.every(source => source.id && source.publishedAt && source.url));
  assert.match(context.instruction, /不是用户事实/);
});

test('states the finite sample boundary instead of claiming majority-market fit', () => {
  const baseline = buildCareerContext({ facts: facts('整理用户反馈。'), targetRole: '产品助理' });
  assert.equal(baseline.sampleBoundary.companyJdSamples, 0);
  assert.match(baseline.sampleBoundary.note, /不能代表多数企业/);

  const withJd = buildCareerContext({ facts: facts('整理用户反馈。'), targetRole: '产品助理', jobDescription: '负责用户访谈和需求分析' });
  assert.equal(withJd.sampleBoundary.companyJdSamples, 1);
  assert.equal(withJd.sampleBoundary.userJobDescriptionIncluded, true);
});
