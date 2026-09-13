import assert from 'node:assert/strict';
import test from 'node:test';
import { assessOptimizationQuality, diceSimilarity } from '../server/optimization-quality.js';
import { validateOptimizedResume } from '../server/resume-validation.js';

const longText = '负责收集团队成员每周提交的工作记录，按照项目分类汇总进展、风险和待协调事项，最终整理为团队周报并发送给负责人。';
const facts = { sourceBlocks: [{ id: 'b1', text: longText }] };
const resume = text => validateOptimizedResume({ methodologyVersion: '0.1', summary: '', targetRole: '运营助理', sections: [{ heading: '项目经历', entries: [{ title: '', organization: '', dates: '', bullets: [{ title: '团队周报整理', text, sourceIds: ['b1'], ruleIds: ['F01', 'E02'] }] }] }], omissions: [], warnings: [] }, facts, 'test', 'test');

test('similarity checker distinguishes verbatim material from substantive restructuring', () => {
  assert.equal(diceSimilarity(longText, longText), 1);
  const copied = assessOptimizationQuality(resume(longText), facts);
  assert.equal(copied.substantiveChange, false);
  assert.equal(copied.reason, 'too_similar_to_source');
  const rewritten = assessOptimizationQuality(resume('按项目维度归类团队工作记录，汇总进展、风险及待协调事项，形成周报提交负责人。'), facts);
  assert.equal(rewritten.substantiveChange, true);
});

test('validation rejects a number that is absent from every cited source', () => {
  assert.throws(() => resume('按项目归类工作记录，推动效率提升 30%。'), /暂时无法完成优化/);
});
