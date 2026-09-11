import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import { createApp } from "../server/app.js";

async function withApp(run) {
  const server = http.createServer(createApp({ config: { provider: "openai", model: null, configured: false } }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function formWithResume(buffer, filename) {
  const form = new FormData();
  form.append("resume", new Blob([buffer]), filename);
  return form;
}

test("returns facts from a multipart PDF upload", async () => {
  const pdf = await readFile(new URL("./fixtures/resume.pdf", import.meta.url));
  const response = await withApp((url) => fetch(`${url}/api/extract`, { method: "POST", body: formWithResume(pdf, "resume.pdf") }));

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).facts.sourceBlocks, [
    { id: "p1-b1", text: "Resume Project Experience", page: 1 },
  ]);
});

test("returns a readable 400 response when the resume field is absent", async () => {
  const response = await withApp((url) => fetch(`${url}/api/extract`, { method: "POST", body: new FormData() }));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /上传|文件/);
});

test("rejects a forged PDF multipart upload", async () => {
  const response = await withApp((url) => fetch(`${url}/api/extract`, {
    method: "POST",
    body: formWithResume(Buffer.from("MZ executable"), "resume.pdf"),
  }));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /PDF|格式/);
});

test("rejects an upload larger than 10 MB", async () => {
  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
  oversized.write("%PDF-");
  const response = await withApp((url) => fetch(`${url}/api/extract`, {
    method: "POST",
    body: formWithResume(oversized, "resume.pdf"),
  }));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /10 MB/);
});

test("returns a readable 400 response for an empty-text PDF", async () => {
  const emptyTextPdf = await readFile(new URL("./fixtures/scan.pdf", import.meta.url));
  const response = await withApp((url) => fetch(`${url}/api/extract`, {
    method: "POST",
    body: formWithResume(emptyTextPdf, "scan.pdf"),
  }));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /扫描型|无法解析/);
});
