import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// Run against a local Vite server; override the module path for a bundled runtime.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const baseUrl = process.env.RESUME_TEST_URL ?? 'http://localhost:5178';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
test.after(() => browser.close());

async function reviewPage(t, config = { configured: true, provider: 'openai', model: 'test-model' }) {
  const page = await browser.newPage();
  t.after(() => page.close());
  page.setDefaultTimeout(5000);
  await page.route('**/api/config', route => route.fulfill({ json: config }));
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '没有简历？在线填写' }).click();
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill('张三');
  await page.getByRole('textbox', { name: '一段值得讲述的经历' }).fill('原始访谈经历');
  await page.getByRole('button', { name: '核对填写内容' }).click();
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill('修改后的姓名');
  await page.getByRole('textbox', { name: '目标岗位', exact: true }).fill('产品助理');
  await page.getByRole('textbox', { name: '经历内容', exact: true }).fill('已核对的访谈经历');
  await page.getByRole('textbox', { name: '原文 2', exact: true }).fill('已核对的访谈经历');
  return page;
}

for (const [provider, label] of [['openai', 'OpenAI'], ['deepseek', 'DeepSeek'], ['qwen', '通义千问']]) {
  test(`review identifies ${label} and model before submission without exposing secrets`, async t => {
    const page = await reviewPage(t, { configured: true, provider, model: 'test-model', apiKey: 'fake-key-must-not-render' });
    assert.match(await page.locator('dialog .service-status').innerText(), new RegExp(label));
    assert.match(await page.locator('dialog .service-status').innerText(), /test-model/);
    assert.equal(await page.getByRole('button', { name: '确认事实并优化', exact: true }).isEnabled(), true);
    assert.ok(!(await page.locator('body').innerText()).includes('fake-key-must-not-render'));
  });
}

test('review names an unconfigured provider and prevents submission', async t => {
  const page = await reviewPage(t, { configured: false, provider: 'qwen', model: null });
  assert.match(await page.locator('dialog .service-status').innerText(), /通义千问.*尚未配置/);
  assert.equal(await page.getByRole('button', { name: '确认事实并优化', exact: true }).isDisabled(), true);
});

async function failedReplacement(page) {
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.route('**/api/extract', route => route.fulfill({ status: 503, json: { error: { message: '替换识别暂时失败，请重试。' } } }));
  await page.getByLabel('选择简历文件', { exact: true }).setInputFiles({ name: 'replacement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await page.locator('dialog .error').filter({ hasText: '替换识别暂时失败' }).waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
}

test('failed replacement retains unsaved factual edits and the review entry point', async t => {
  const page = await reviewPage(t);
  await failedReplacement(page);
  assert.equal(await page.getByRole('button', { name: '继续核对我的材料', exact: true }).count(), 1, 'failed replacement must retain the review entry point');
  await page.getByRole('button', { name: '继续核对我的材料', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '姓名', exact: true }).inputValue(), '修改后的姓名');
  assert.equal(await page.getByRole('textbox', { name: '目标岗位', exact: true }).inputValue(), '产品助理');
  assert.equal(await page.getByRole('textbox', { name: '经历内容', exact: true }).inputValue(), '已核对的访谈经历');
  assert.equal(await page.getByRole('textbox', { name: '原文 2', exact: true }).inputValue(), '已核对的访谈经历');
});

test('failed replacement retains the already generated resume and download action', async t => {
  const page = await reviewPage(t);
  await page.route('**/api/optimize', route => route.fulfill({ json: { resume: { summary: '已生成的访谈简历', targetRole: '产品助理', provider: 'openai', model: 'test-model', sections: [{ heading: '经历', entries: [{ title: '访谈', organization: '', dates: '', bullets: ['已核对的访谈经历'], sourceIds: ['form-b3'] }] }] } } }));
  await page.getByRole('button', { name: '确认事实并优化', exact: true }).click();
  await page.getByRole('heading', { name: '你的优化简历', exact: true }).waitFor();
  await failedReplacement(page);
  assert.equal(await page.getByRole('button', { name: '查看优化结果', exact: true }).count(), 1, 'failed replacement must retain the result entry point');
  await page.getByRole('button', { name: '查看优化结果', exact: true }).click();
  assert.equal(await page.getByText('已生成的访谈简历', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '下载 PDF', exact: true }).isEnabled(), true);
});

test('an unused added source can be removed, while a cited source stays protected', async t => {
  const page = await reviewPage(t);
  await page.getByRole('button', { name: '补充来源原文', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '删除原文 3', exact: true }).count(), 1, 'an accidentally added blank source needs a removal control');
  await page.getByRole('button', { name: '删除原文 3', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '原文 3', exact: true }).count(), 0);
  await page.getByRole('button', { name: '保存事实修改', exact: true }).click();
  await page.locator('dialog').getByText('事实修改已保存在当前页面。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '补充来源原文', exact: true }).click();
  await page.getByRole('textbox', { name: '原文 3', exact: true }).fill('补充访谈证据');
  await page.getByRole('checkbox', { name: '原文 3：补充访谈证据', exact: true }).check();
  assert.equal(await page.getByRole('button', { name: '删除原文 3', exact: true }).isDisabled(), true);
  await page.getByRole('checkbox', { name: '原文 3：补充访谈证据', exact: true }).uncheck();
  await page.getByRole('button', { name: '删除原文 3', exact: true }).click();
  let submitted;
  await page.route('**/api/optimize', route => { submitted = route.request().postDataJSON(); return route.fulfill({ status: 503, json: { error: { message: '已验证提交' } } }); });
  await page.getByRole('button', { name: '确认事实并优化', exact: true }).click();
  await page.locator('dialog .error').filter({ hasText: '已验证提交' }).waitFor();
  assert.deepEqual(submitted.facts.experiences[0].sourceIds, ['form-b3']);
  assert.deepEqual(submitted.facts.sourceBlocks.map(block => block.id), ['form-b1', 'form-b3']);
});
