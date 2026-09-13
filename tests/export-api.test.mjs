import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../server/app.js";

const facts = {
  name: "张三",
  contact: "zhangsan@example.com",
  education: [],
  experiences: [],
  skills: [],
  warnings: [],
  sourceBlocks: [{ id: "p1-b1", text: "示例公司 产品实习生 2025.01 - 2025.06：负责产品用户访谈", page: 1 }],
};

const resume = {
  methodologyVersion: '0.1',
  summary: "具备用户研究经验。",
  targetRole: "产品助理",
  sections: [{
    heading: "工作经历",
    entries: [{
      title: "产品实习生",
      organization: "示例公司",
      dates: "2025.01 - 2025.06",
      bullets: [{ title: '用户访谈', text: '开展产品用户访谈并整理反馈', sourceIds: ['p1-b1'], ruleIds: ['F01', 'E02'] }],
    }],
  }],
  omissions: [],
  warnings: [],
};

async function post(body, options = {}) {
  const server = http.createServer(createApp(options));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      disposition: response.headers.get("content-disposition"),
      body: await response.text(),
    };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("exports a reviewed resume as a PDF attachment", async () => {
  const result = await post({ facts, resume }, { services: { exportPdf: async () => Buffer.from("%PDF-test") } });

  assert.equal(result.status, 200);
  assert.match(result.contentType, /^application\/pdf(?:;|$)/);
  assert.equal(result.disposition, 'attachment; filename="optimized-resume.pdf"');
});

test('lists the templates actually enabled by the export service', async () => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/templates`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      templates: [
        { id: 'classic', name: '经典', version: 1 },
        { id: 'minimal', name: '简约', version: 1 },
        { id: 'sidebar', name: '紧凑', version: 1 },
      ],
      defaultTemplateId: 'classic',
    });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('passes the selected template to the PDF service and rejects unknown templates', async () => {
  let received;
  const selected = await post({ facts, resume, templateId: 'sidebar' }, { services: { exportPdf: async input => { received = input; return Buffer.from('%PDF-test'); } } });
  assert.equal(selected.status, 200);
  assert.equal(received.templateId, 'sidebar');
  assert.equal(received.presentation.avatarDataUrl, '');
  let calls = 0;
  const unknown = await post({ facts, resume, templateId: 'not-a-template' }, { services: { exportPdf: async () => { calls += 1; return Buffer.from('%PDF-test'); } } });
  assert.equal(unknown.status, 400);
  assert.match(unknown.body, /请选择可用的简历模板/);
  assert.equal(calls, 0);
});

test('forwards a valid optional avatar while rejecting malformed presentation data', async () => {
  let received;
  const avatarDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyeiiigD//2Q==';
  const valid = await post({ facts, resume, presentation: { avatarDataUrl } }, { services: { exportPdf: async input => { received = input; return Buffer.from('%PDF-test'); } } });
  assert.equal(valid.status, 200);
  assert.equal(received.presentation.avatarDataUrl, avatarDataUrl);
  const invalid = await post({ facts, resume, presentation: { avatarDataUrl: 'https://example.com/avatar.png' } }, { services: { exportPdf: async () => Buffer.from('%PDF-test') } });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body, /头像格式或大小无效/);
});

test("exports user-confirmed final-page edits without requiring another AI pass", async () => {
  let exported;
  const editedResume = structuredClone(resume);
  editedResume.summary = "具备 3 年产品运营经验。";
  editedResume.sections[0].entries[0].title = "高级产品运营";
  editedResume.sections[0].entries[0].bullets[0] = {
    ...editedResume.sections[0].entries[0].bullets[0],
    title: "工具",
    text: "Axure（精通）、Excel（精通）",
  };

  const result = await post({ facts, resume: editedResume }, {
    services: { exportPdf: async input => { exported = input; return Buffer.from("%PDF-test"); } },
  });

  assert.equal(result.status, 200);
  assert.equal(exported.resume.summary, "具备 3 年产品运营经验。");
  assert.equal(exported.resume.sections[0].entries[0].title, "高级产品运营");
  assert.equal(exported.resume.sections[0].entries[0].bullets[0].text, "Axure（精通）、Excel（精通）");
});

test("rejects an unknown source ID without calling the PDF service", async () => {
  let calls = 0;
  const invalidResume = structuredClone(resume);
  invalidResume.sections[0].entries[0].bullets[0].sourceIds = ["missing-source"];

  const result = await post({ facts, resume: invalidResume }, {
    services: { exportPdf: async () => { calls += 1; return Buffer.from("%PDF-test"); } },
  });

  assert.equal(result.status, 400);
  assert.match(result.contentType, /^application\/json(?:;|$)/);
  assert.deepEqual(JSON.parse(result.body), {
    error: { code: "request_invalid", message: "请提供有效的简历事实和优化结果。" },
  });
  assert.equal(calls, 0);
});
