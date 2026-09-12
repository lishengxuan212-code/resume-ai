import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOptimizeInput } from '../server/resume-validation.js';
const state = await import('../src/resume-state.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const draft = { name: ' 张三 ', contact: ' 13800000000 ', school: ' 测试大学 ', major: ' 计算机 ', role: ' 产品助理 ', experience: ' 负责用户访谈\n整理反馈 ' };

test('online experience retains its original text and cites form-b3', () => {
  assert.equal(typeof state.draftToFacts, 'function', 'draftToFacts must be implemented');
  const facts = state.draftToFacts(draft);
  assert.deepEqual(facts.sourceBlocks, [
    { id: 'form-b1', text: '张三\n13800000000\n产品助理', page: null },
    { id: 'form-b2', text: '测试大学\n计算机', page: null },
    { id: 'form-b3', text: '负责用户访谈\n整理反馈', page: null },
  ]);
  assert.deepEqual(facts.experiences, [{ title: '', organization: '', dates: '', description: '负责用户访谈\n整理反馈', sourceIds: ['form-b3'] }]);
  assert.deepEqual(facts.education, [{ school: '测试大学', major: '计算机', degree: '', dates: '', sourceIds: ['form-b2'] }]);
  assert.equal(facts.targetRole, '产品助理');
  assert.deepEqual(facts.skills, []);
  assert.deepEqual(facts.warnings, []);
});

test('blank education does not create a fabricated education entry or empty source', () => {
  assert.equal(typeof state.draftToFacts, 'function');
  const facts = state.draftToFacts({ ...draft, school: ' ', major: '' });
  assert.deepEqual(facts.education, []);
  assert.ok(!facts.sourceBlocks.some(block => block.id === 'form-b2'));
});

test('draft round trip preserves every existing form field after trimming', () => {
  assert.equal(typeof state.factsToDraft, 'function');
  assert.deepEqual(state.factsToDraft(state.draftToFacts(draft)), {
    name: '张三', contact: '13800000000', school: '测试大学', major: '计算机', role: '产品助理', experience: '负责用户访谈\n整理反馈',
  });
});

test('saving review trims edited fields while retaining imported source IDs and page numbers', () => {
  assert.equal(typeof state.prepareReviewedFacts, 'function');
  const result = state.prepareReviewedFacts({ name: ' 张三 ', contact: '', education: [], experiences: [{ title: ' 实习 ', organization: '', dates: '', description: ' 更新经历 ', sourceIds: ['p2-b1'] }], skills: [' 访谈 ', ' '], warnings: [], sourceBlocks: [{ id: 'p2-b1', text: ' 更新原文 ', page: 2 }] });
  assert.equal(result.name, '张三');
  assert.deepEqual(result.skills, ['访谈']);
  assert.deepEqual(result.sourceBlocks, [{ id: 'p2-b1', text: '更新原文', page: 2 }]);
  assert.deepEqual(result.experiences[0], { title: '实习', organization: '', dates: '', description: '更新经历', sourceIds: ['p2-b1'] });
});

test('review cannot submit empty sources or entries without valid citations', () => {
  assert.equal(typeof state.prepareReviewedFacts, 'function');
  const facts = { ...state.draftToFacts(draft), sourceBlocks: [{ id: 'form-b3', text: ' ' }] };
  assert.throws(() => state.prepareReviewedFacts(facts), /来源原文/);
  const missing = state.draftToFacts(draft);
  missing.experiences[0].sourceIds = [];
  assert.throws(() => state.prepareReviewedFacts(missing), /来源/);
});

test('new work facts get a source automatically without replacing imported text', () => {
  const facts = state.draftToFacts(draft);
  const updated = state.updateReviewedEntry(facts, 'experiences', 0, { description: '核对后补充：整理实际访谈记录。' });
  const entry = updated.experiences[0];
  assert.equal(updated.sourceBlocks.find(block => block.id === 'form-b3').text, '负责用户访谈\n整理反馈');
  assert.match(entry.sourceIds[0], /^review-entry-/);
  assert.match(updated.sourceBlocks.find(block => block.id === entry.sourceIds[0]).text, /核对后补充/);
  assert.doesNotThrow(() => state.prepareReviewedFacts(updated));
  assert.doesNotThrow(() => validateOptimizeInput({ facts: state.prepareReviewedFacts(updated), targetRole: '产品助理' }));
  const revised = state.updateReviewedEntry(updated, 'experiences', 0, { title: '产品助理' });
  assert.equal(revised.sourceBlocks.length, updated.sourceBlocks.length, 'editing must reuse the same source');
  assert.deepEqual(revised.experiences[0].sourceIds, entry.sourceIds);
});

test('adding and deleting education manages only its automatically created source', () => {
  const facts = state.draftToFacts(draft);
  facts.education.push({ school: '', major: '', degree: '', dates: '', sourceIds: [] });
  const updated = state.updateReviewedEntry(facts, 'education', 1, { school: '补充大学' });
  assert.doesNotThrow(() => state.prepareReviewedFacts(updated));
  const removed = state.removeReviewedEntry(updated, 'education', 1);
  assert.deepEqual(removed.sourceBlocks, facts.sourceBlocks);
  assert.equal(removed.education.length, 1);
});

test('skill corrections are recorded once and empty new entries are omitted', () => {
  let facts = state.draftToFacts(draft);
  facts.education.push({ school: '', major: '', degree: '', dates: '', sourceIds: [] });
  facts = state.updateReviewedSkills(facts, '数据分析：Excel');
  facts = state.updateReviewedSkills(facts, '数据分析：Excel\n设计：Axure');
  const saved = state.prepareReviewedFacts(facts);
  assert.equal(saved.education.length, 1);
  assert.equal(saved.sourceBlocks.filter(block => block.id === 'review-skills').length, 1);
  assert.deepEqual(saved.skills, ['数据分析：Excel', '设计：Axure']);
});

test('automatic sources respect the extraction limit instead of silently losing edits', () => {
  const facts = state.draftToFacts(draft);
  facts.sourceBlocks = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}-b1`, text: '原文', page: 1 }));
  assert.throws(() => state.updateReviewedEntry(facts, 'experiences', 0, { description: '补充事实' }), /上限/);
  assert.throws(() => state.updateReviewedSkills(facts, '新技能'), /上限/);
});
