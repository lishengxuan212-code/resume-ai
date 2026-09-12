// Explicit opt-in live check; synthetic material only. Never logs credentials,
// provider response bodies, or private resumes. Not part of npm test.
import http from 'node:http';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';

const responsibilities = [
  '整理用户反馈：每周从客服工单中摘录用户问题，按照支付、权益领取和活动说明归类。对于描述不清的问题，我向客服确认出现步骤，再把问题表交给产品同事。我没有独立决定产品方案，也没有可确认的转化率提升数据。',
  '会员权益维护：根据已经批准的活动方案更新权益说明表，逐项核对使用期限和领取条件。遇到页面文案和规则不一致时，我记录具体位置并联系设计与开发确认，修订后再次检查。最终提交权益说明表及上线检查记录。',
  '活动执行支持：协助负责人准备活动素材清单，按排期跟进设计稿提交情况。在活动上线前核对跳转链接和落地页说明，把发现的问题汇总给负责人。活动期间整理客服反馈，结束后汇总执行问题供团队复盘。',
  '周报汇总：收集同事提交的工作记录，按项目归类进展、待协调事项和风险，标注尚未提交的记录。将汇总表发送给负责人并保存原始文件。我只负责信息收集和整理，没有分析销售渠道，也没有负责增长策略。',
  '内容运营：根据负责人提供的选题整理发布清单，核对稿件中的活动时间与产品说明。发布后记录链接和用户留言，将反复出现的问题归类给客服。文章内容由团队共同审阅，我没有独立制定内容策略。',
  '项目协作：参加产品与客服的例会，记录已确认的需求和待核实问题，将任务清单发送给各负责人。后续根据负责人反馈更新状态，整理已完成事项的材料链接，协助保存项目文档，便于团队查找。',
];
const experiences = [
  ['产品运营', '示例软件公司', '2023.04-2025.06', responsibilities.slice(0, 3)],
  ['运营助理', '示例服务公司', '2021.07-2023.03', responsibilities.slice(3)],
].map(([title, organization, dates, items], index) => ({ title, organization, dates, description: items.map((x, n) => `${n + 1}. ${x}`).join('\n'), sourceIds: [`work-${index}`] }));
const facts = { name: '测试同学', contact: 'test@example.com', education: [{ school: '示例大学', major: '信息管理', degree: '本科', dates: '2017.09-2021.06', sourceIds: ['education'] }], experiences, skills: ['Excel：整理工作记录和活动问题清单'], warnings: [], sourceBlocks: [
  { id: 'education', text: '示例大学 信息管理 本科 2017.09-2021.06', page: null },
  ...experiences.map(x => ({ id: x.sourceIds[0], text: `${x.organization} ${x.title} ${x.dates}\n${x.description}`, page: null })),
  { id: 'skills', text: 'Excel：整理工作记录和活动问题清单', page: null },
] };
if (process.argv.includes('--long')) {
  for (let index=2; index<8; index++) {
    const entry = { ...experiences[index%2], organization: `示例项目组${index}`, sourceIds: [`work-${index}`], description: responsibilities.map((text,n)=>`${n+1}. ${text}`).join('\n') };
    facts.experiences.push(entry);
    facts.sourceBlocks.push({ id: entry.sourceIds[0], text: `${entry.organization} ${entry.title} ${entry.dates}\n${entry.description}`, page: null });
  }
}
let diagnosis;
if (process.argv.includes('--diagnosis-case')) {
  facts.experiences[0].description += '\n4. 付费转化：推动新用户付费率提升100%，现有材料没有记录比较基期或同比、环比口径。';
  facts.sourceBlocks.find(block => block.id === 'work-0').text = `${facts.experiences[0].organization} ${facts.experiences[0].title} ${facts.experiences[0].dates}\n${facts.experiences[0].description}`;
  facts.skills = ['工具使用技能：Axure、Excel、禅道、企业内部AI工具、企业自研数据看板'];
  facts.sourceBlocks.find(block => block.id === 'skills').text = facts.skills[0];
  diagnosis = { methodologyVersion: '0.1', findings: [
    { dimension: '清晰度', issue: '“推动新用户付费率提升100%”未说明比较基期、同比或环比口径，数字语义不明确', evidenceSourceIds: ['work-0'], suggestedAction: '确认百分比口径；无法确认时省略歧义数字', ruleIds: ['F03'] },
    { dimension: '能力证据', issue: '个人优势存在能力标签堆叠，缺少具体任务或成果支撑', evidenceSourceIds: ['work-0'], suggestedAction: '用已确认的用户反馈、会员权益和活动执行任务概括优势', ruleIds: ['E03'] },
  ], questions: [{ id: 'q1', question: '付费率提升100%具体是什么比较口径？', reason: '避免把同比、环比或翻倍含义写错', suggestedRewrite: '推动新用户付费率改善。', sourceIds: ['work-0'], ruleIds: ['F03'] }], canOptimizeDirectly: true };
}
const baseline = process.argv.includes('--baseline');
const config = readConfig({ ...process.env, ...(baseline ? { AI_TIMEOUT_MS: '30000' } : {}) });
let calls = 0;
let sample;
const fetchImpl = async (url, options) => {
  calls++;
  if (baseline) { const body = JSON.parse(options.body); delete body.thinking; options = { ...options, body: JSON.stringify(body) }; }
  const response = await fetch(url, options);
  if (process.argv.includes('--inspect-synthetic') && response.ok) {
    const data = await response.clone().json();
    try { sample = JSON.parse(data.choices?.[0]?.message?.content); } catch { sample = { malformed: true }; }
  }
  return response;
};
const server = http.createServer(createApp({ config, fetchImpl }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const start = Date.now();
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/optimize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, targetRole: '产品运营', skipQuestions: true, ...(diagnosis ? { diagnosis } : {}) }) });
  const result = await response.json();
  if (sample) console.log(JSON.stringify({ syntheticModelOutput: sample }, null, 2));
  console.log(JSON.stringify({ mode: baseline ? 'old-settings' : 'new-settings', sourceCharacters: facts.sourceBlocks.reduce((n,x) => n+x.text.length,0), provider: config.provider, model: config.model, timeoutMs: config.timeoutMs, elapsedMs: Date.now()-start, providerCalls: calls, status: response.status, error: result.error, methodologyVersion: result.resume?.methodologyVersion, quality: result.resume?.quality, bullets: result.resume?.sections.flatMap(x=>x.entries).flatMap(x=>x.bullets).length }, null, 2));
  if (response.ok) {
    const pdf = await fetch(`http://127.0.0.1:${server.address().port}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts: result.facts, resume: result.resume }) });
    const bytes = Buffer.from(await pdf.arrayBuffer());
    console.log(JSON.stringify({ exportStatus: pdf.status, validPdf: bytes.subarray(0,5).toString() === '%PDF-', bytes: bytes.length }));
  } else if (!baseline) process.exitCode = 1;
} finally { await new Promise(resolve => server.close(resolve)); }
