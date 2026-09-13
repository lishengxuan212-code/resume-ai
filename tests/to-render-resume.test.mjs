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
    basics: { name: '张三', headline: '产品助理', contactText: '13800000000', avatarDataUrl: '', education: [] },
    summary: '产品经历',
    sections: [{ id: 'section-1-skills', type: 'skills', title: '专业技能', items: [{ id: 'entry-1-1', title: '', organization: '', period: '', bullets: [{ id: 'bullet-1-1-1', title: '原型与数据处理', text: '使用 Axure。' }] }] }],
  });
});

test('moves reviewed education into the top information model and avoids a duplicate section', () => {
  const result = toRenderResume({ education: [{ school: '四川传媒学院', major: '播音与主持艺术', degree: '学士学位', dates: '2019.09 - 2023.06' }] }, {
    sections: [{ type: 'education', heading: '教育背景', entries: [{ title: '四川传媒学院', bullets: [{ title: '学历', text: '学士学位' }] }] }],
  });
  assert.deepEqual(result.basics.education, [{ id: 'education-1-1', school: '四川传媒学院', major: '播音与主持艺术', degree: '学士学位', period: '2019.09 - 2023.06' }]);
  assert.equal(result.sections.length, 0);
});

test('removes extraction gaps in Chinese text while retaining regular English spacing', () => {
  const result = toRenderResume({}, { summary: '大促活动执行 参与；用户分层与付费转化 基于 LTV 与 RF', sections: [{ heading: '项目 经历', entries: [{ title: '活动 执行', organization: 'Example Team', dates: '2025.01 - 2025.06', bullets: [{ title: '用户 分层', text: '基于 LTV 与 RF 完成 分层' }] }] }] });
  assert.equal(result.summary, '大促活动执行参与；用户分层与付费转化基于LTV与RF');
  assert.equal(result.sections[0].title, '项目经历');
  assert.equal(result.sections[0].items[0].organization, 'Example Team');
  assert.equal(result.sections[0].items[0].bullets[0].text, '基于LTV与RF完成分层');
});

test('preserves an explicit type when users rename the visible heading', () => {
  const result = toRenderResume({}, { sections: [{ id: 'work', type: 'experience', heading: '我的实践', entries: [] }] });
  assert.equal(result.sections.length, 0);
  const withItem = toRenderResume({}, { sections: [{ id: 'work', type: 'experience', heading: '我的实践', entries: [{ id: 'job', title: '', organization: '', dates: '', bullets: [{ title: '访谈', text: '完成访谈' }] }] }] });
  assert.equal(withItem.sections[0].type, 'experience');
  assert.equal(withItem.sections[0].title, '我的实践');
});

test('keeps education out of the personal summary without removing a work audience', () => {
  const result = toRenderResume({ education: [{ school: '示例大学', major: '信息管理', degree: '本科' }] }, {
    summary: '毕业于示例大学信息管理专业本科。负责大学生用户的活动运营与反馈整理。',
    sections: [],
  });
  assert.equal(result.summary, '负责大学生用户的活动运营与反馈整理。');
});

test('does not render a personal summary or section removed from the current resume', () => {
  const result = toRenderResume({}, {
    summary: '',
    sections: [{ heading: '工作经历', entries: [{ title: '产品运营', bullets: [{ title: '活动运营', text: '完成活动复盘。' }] }] }],
  });
  assert.equal(result.summary, '');
  assert.equal(result.sections.length, 1);

  const afterSectionRemoval = toRenderResume({}, { summary: '', sections: [] });
  assert.equal(afterSectionRemoval.summary, '');
  assert.deepEqual(afterSectionRemoval.sections, []);
});
