import assert from 'node:assert/strict';
import test from 'node:test';
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
  assert.deepEqual(facts.experiences, [{ type: 'work', title: '', organization: '', dates: '', description: '负责用户访谈\n整理反馈', sourceIds: ['form-b3'] }]);
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
  assert.deepEqual(result.experiences[0], { type: 'work', title: '实习', organization: '', dates: '', description: '更新经历', sourceIds: ['p2-b1'] });
});

test('review cannot submit empty sources or entries without valid citations', () => {
  assert.equal(typeof state.prepareReviewedFacts, 'function');
  const facts = { ...state.draftToFacts(draft), sourceBlocks: [{ id: 'form-b3', text: ' ' }] };
  assert.throws(() => state.prepareReviewedFacts(facts), /来源原文/);
  const missing = state.draftToFacts(draft);
  missing.experiences[0].sourceIds = [];
  assert.throws(() => state.prepareReviewedFacts(missing), /来源/);
});
