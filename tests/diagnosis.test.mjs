import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { validateDiagnosis } from '../server/diagnosis-validation.js';

const facts = { name: '张三', contact: '', education: [], experiences: [], skills: [], warnings: [], sourceBlocks: [{ id: 'b1', text: '负责整理团队周报。' }] };
const diagnosis = { methodologyVersion: '0.1', findings: [{ dimension: '能力证据', issue: '行动细节不足', evidenceSourceIds: ['b1'], suggestedAction: '补充汇总方式或交付物', ruleIds: ['E02'] }], questions: [{ id: 'q1', question: '你如何汇总周报？', reason: '用于形成具体行动描述', suggestedRewrite: '汇总团队周报，整理工作进展与待办事项。', sourceIds: ['b1'], ruleIds: ['Q01', 'E02'] }], canOptimizeDirectly: true };

test('diagnosis validation keeps all material questions within the safety bound and known citations/rules', () => {
  assert.equal(validateDiagnosis(diagnosis, facts, 'deepseek', 'test').questions.length, 1);
  const many = { ...diagnosis, questions: Array.from({ length: 12 }, (_, index) => ({ ...diagnosis.questions[0], id: `q${index}` })) };
  assert.equal(validateDiagnosis(many, facts, 'deepseek', 'test').questions.length, 12);
  const tooMany = { ...diagnosis, questions: Array.from({ length: 13 }, (_, index) => ({ ...diagnosis.questions[0], id: `q${index}` })) };
  assert.throws(() => validateDiagnosis(tooMany, facts, 'deepseek', 'test'), /暂时未能完成优化/);
  assert.throws(() => validateDiagnosis({ ...diagnosis, findings: [{ ...diagnosis.findings[0], evidenceSourceIds: ['unknown'] }] }, facts, 'deepseek', 'test'), /暂时未能完成优化/);
  assert.throws(() => validateDiagnosis({ ...diagnosis, findings: [{ ...diagnosis.findings[0], issue: 'F03 行动细节不足' }] }, facts, 'deepseek', 'test'), /暂时未能完成优化/);
  assert.throws(() => validateDiagnosis({ ...diagnosis, questions: [{ ...diagnosis.questions[0], suggestedRewrite: '' }] }, facts, 'deepseek', 'test'), /暂时未能完成优化/);
});

test('diagnose API returns versioned findings and questions without optimizing yet', async () => {
  let received;
  const server = http.createServer(createApp({ config: { provider: 'deepseek', model: 'test', configured: true }, services: { diagnoseResume: async input => { received = input; return diagnosis; } } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/diagnose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, targetRole: '运营助理' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).diagnosis.methodologyVersion, '0.1');
    assert.equal(received.targetRole, '运营助理');
    assert.ok(received.ruleIds.includes('Q01'));
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
