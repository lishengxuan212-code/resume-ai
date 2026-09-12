import assert from 'node:assert/strict';
import test from 'node:test';
import { toRenderResume } from '../shared/resume/to-render-resume.js';

test('maps legacy headings to stable render types without exposing provenance', () => {
  const result = toRenderResume(
    { name: '张三', contact: '13800000000' },
    { targetRole: '产品助理', summary: '产品经历', sections: [{ heading: '专业技能', entries: [{ title: '', organization: '', dates: '', bullets: [{ title: '原型与数据处理', text: '使用 Axure。', sourceIds: ['source-1'], ruleIds: ['F01'] }] }] }] },
  );
  assert.deepEqual(result, {
    schemaVersion: 1,
    basics: { name: '张三', headline: '产品助理', contactText: '13800000000' },
    summary: '产品经历',
    sections: [{ id: 'section-1-skills', type: 'skills', title: '专业技能', items: [{ id: 'entry-1-1', title: '', organization: '', period: '', bullets: [{ id: 'bullet-1-1-1', title: '原型与数据处理', text: '使用 Axure。' }] }] }],
  });
});

test('preserves an explicit type when users rename the visible heading', () => {
  const result = toRenderResume({}, { sections: [{ id: 'work', type: 'experience', heading: '我的实践', entries: [] }] });
  assert.equal(result.sections.length, 0);
  const withItem = toRenderResume({}, { sections: [{ id: 'work', type: 'experience', heading: '我的实践', entries: [{ id: 'job', title: '', organization: '', dates: '', bullets: [{ title: '访谈', text: '完成访谈' }] }] }] });
  assert.equal(withItem.sections[0].type, 'experience');
  assert.equal(withItem.sections[0].title, '我的实践');
});
