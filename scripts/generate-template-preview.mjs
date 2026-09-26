import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderResumePdf } from '../server/render/render-pdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const avatarDataUrl = `data:image/jpeg;base64,${(await readFile(path.join(root, 'public', 'assets', 'fictional-template-avatar.jpg'))).toString('base64')}`;
const facts = {
  name: '林知夏',
  contact: '138 0000 0000 · linzhixia@example.com',
  education: [{ school: '示例大学', major: '信息管理', degree: '本科', dates: '2021.09 - 2025.06', sourceIds: ['sample-education'] }],
  experiences: [], skills: [], warnings: [],
  sourceBlocks: [
    { id: 'sample-education', text: '示例大学 信息管理 本科 2021.09 - 2025.06', page: 1 },
    { id: 'sample-work', text: '知行科技 产品运营实习生 2024.06 - 2024.12。整理用户反馈、协助活动执行并完成复盘。', page: 1 },
    { id: 'sample-project', text: '校园项目 项目负责人 2023.09 - 2024.01。完成问卷设计、信息归纳和项目推进。', page: 1 },
    { id: 'sample-skills', text: '数据处理：Excel、SQL。原型设计：Figma、Axure。', page: 1 },
  ],
};
const resume = {
  methodologyVersion: '0.1',
  targetRole: '产品助理',
  summary: '具备用户反馈整理、活动执行和项目推进经验，能够从真实任务中归纳问题并形成清晰交付。',
  sections: [
    { type: 'experience', heading: '实习经历', entries: [{ title: '产品运营实习生', organization: '知行科技', dates: '2024.06 - 2024.12', bullets: [
      { title: '用户反馈整理', text: '收集并归类用户反馈，形成问题清单并协助团队跟进。', sourceIds: ['sample-work'], ruleIds: ['F01'] },
      { title: '活动执行与复盘', text: '协助活动物料、上线检查和结果复盘，完整记录执行过程。', sourceIds: ['sample-work'], ruleIds: ['F01'] },
    ] }] },
    { type: 'project', heading: '项目经历', entries: [{ title: '校园体验调研', organization: '校园项目', dates: '2023.09 - 2024.01', bullets: [
      { title: '调研与归纳', text: '完成问卷设计和信息归纳，整理主要问题与建议方向。', sourceIds: ['sample-project'], ruleIds: ['F01'] },
      { title: '项目推进', text: '协调成员分工与交付节点，按计划完成阶段成果。', sourceIds: ['sample-project'], ruleIds: ['F01'] },
    ] }] },
    { type: 'skills', heading: '技能', entries: [{ title: '', organization: '', dates: '', bullets: [
      { title: '数据处理', text: '使用 Excel、SQL 完成数据整理与基础分析。', sourceIds: ['sample-skills'], ruleIds: ['F01'] },
      { title: '原型设计', text: '使用 Figma、Axure 完成页面原型与流程表达。', sourceIds: ['sample-skills'], ruleIds: ['F01'] },
    ] }] },
  ],
  omissions: [], warnings: [],
};

const destination = path.join(root, 'public', 'assets', 'recommended-template-preview.pdf');
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, await renderResumePdf({ facts, resume, templateId: 'recommended', presentation: { avatarDataUrl } }));
console.log(destination);
