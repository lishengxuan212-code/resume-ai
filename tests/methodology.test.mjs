import assert from 'node:assert/strict';
import test from 'node:test';
import { METHODOLOGY_RULES, METHODOLOGY_VERSION, selectMethodologyRules } from '../server/methodology/index.js';
import { buildPromptSections } from '../server/prompt.js';
import { validateOptimizeInput } from '../server/resume-validation.js';

const facts = { name: '张三', contact: '', education: [], experiences: [], skills: [], warnings: [], sourceBlocks: [{ id: 'b1', text: '课程项目中使用 Python 清洗问卷数据并提交分析报告。' }] };

test('methodology registry is versioned and has unique stable rule IDs', () => {
  assert.equal(METHODOLOGY_VERSION, '0.1');
  assert.equal(new Set(METHODOLOGY_RULES.map(rule => rule.id)).size, METHODOLOGY_RULES.length);
  assert.deepEqual(METHODOLOGY_RULES.filter(rule => ['F01', 'F02', 'F03', 'E01', 'E02', 'E03', 'E04', 'T01', 'T03', 'G01'].includes(rule.id)).map(rule => rule.id), ['F01', 'F02', 'F03', 'E01', 'E02', 'E03', 'E04', 'T01', 'T03', 'G01']);
});

test('JD activates T01 while ordinary optimization does not waste prompt space on it', () => {
  assert.equal(selectMethodologyRules({ stage: 'optimize', targetRole: '数据分析', jobDescription: '' }).some(rule => rule.id === 'T01'), false);
  assert.equal(selectMethodologyRules({ stage: 'optimize', targetRole: '数据分析', jobDescription: '要求 SQL' }).some(rule => rule.id === 'T01'), true);
});

test('prompt assembly exposes stable sections and keeps user material outside the system prompt', () => {
  const result = buildPromptSections('optimize', { facts, targetRole: '数据分析', jobDescription: '要求 SQL' });
  assert.deepEqual(result.sections.map(section => section.id), ['identity', 'trust-boundary', 'methodology', 'career-knowledge', 'career-boundary', 'task', 'resume-structure', 'schema']);
  assert.ok(result.sections.every(section => ['static', 'version', 'stage', 'turn'].includes(section.stability)));
  assert.ok(result.ruleIds.includes('T01'));
  assert.ok(!result.sections.map(section => section.content).join('\n').includes(facts.sourceBlocks[0].text));
});

test('diagnosis proposes a conservative rewrite and generated skill headings are fixed to 技能', () => {
  const diagnosisPrompt = buildPromptSections('diagnose', { facts, targetRole: '数据分析', jobDescription: '' });
  assert.ok(diagnosisPrompt.schema.properties.questions.items.properties.suggestedRewrite);
  assert.match(diagnosisPrompt.sections.find(section => section.id === 'task').content, /用户可以确认的保守、可投递表达/);
  const optimizePrompt = buildPromptSections('optimize', { facts, targetRole: '数据分析', jobDescription: '' });
  assert.match(optimizePrompt.sections.find(section => section.id === 'task').content, /heading 必须固定为“技能”/);
  assert.match(optimizePrompt.sections.find(section => section.id === 'task').content, /完整、来源明确的经历、职责、过程和结果必须保留/);
  assert.match(optimizePrompt.sections.find(section => section.id === 'task').content, /同一编号职责内连续的执行、方法与可核对结果/);
  assert.match(optimizePrompt.sections.find(section => section.id === 'career-boundary').content, /不得制造目标行业经验/);
  assert.match(optimizePrompt.sections.find(section => section.id === 'methodology').content, /E04/);
});

test('all bounded material answers become cited, user-confirmed source blocks', () => {
  const input = validateOptimizeInput({ facts, targetRole: '数据分析', answers: [{ questionId: 'q1', answer: '报告用于课程结项展示。' }, { questionId: 'q2', answer: '我独立负责数据清洗。' }] });
  assert.deepEqual(input.facts.sourceBlocks.slice(-2).map(block => block.id), ['answer-q1', 'answer-q2']);
  assert.match(input.facts.sourceBlocks.at(-1).text, /独立负责/);
  assert.equal(validateOptimizeInput({ facts, targetRole: '数据分析', answers: Array.from({ length: 12 }, (_, index) => ({ questionId: `q${index}`, answer: '回答' })) }).answers.length, 12);
  assert.throws(() => validateOptimizeInput({ facts, targetRole: '数据分析', answers: Array.from({ length: 13 }, (_, index) => ({ questionId: `q${index}`, answer: '回答' })) }), /有效的简历事实/);
});
