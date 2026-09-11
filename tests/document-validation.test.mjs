import assert from "node:assert/strict";
import test from "node:test";
import { validateUpload } from "../server/document-validation.js";

function file(originalname, buffer) {
  return { originalname, buffer, size: buffer.length };
}

test("rejects an executable disguised as a PDF", () => {
  assert.throws(
    () => validateUpload(file("resume.pdf", Buffer.from("MZ executable"))),
    (error) => error.status === 400 && /PDF|格式/.test(error.message),
  );
});

test("accepts a PDF exactly at the 10 MB limit", () => {
  const buffer = Buffer.alloc(10 * 1024 * 1024);
  buffer.write("%PDF-");
  assert.doesNotThrow(() => validateUpload(file("resume.pdf", buffer)));
});

test("rejects a file larger than 10 MB", () => {
  const buffer = Buffer.alloc(10 * 1024 * 1024 + 1);
  buffer.write("%PDF-");
  assert.throws(() => validateUpload(file("resume.pdf", buffer)), /10 MB/);
});

test("rejects a DOCX extension whose bytes are not a ZIP file", () => {
  assert.throws(() => validateUpload(file("resume.docx", Buffer.from("%PDF-"))), /DOCX|格式/);
});
