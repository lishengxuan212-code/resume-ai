import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile } from '../src/intake.js';

test('accepts a PDF with case-insensitive extension at the size boundary', () => {
  assert.equal(validateFile({ name: '简历.PDF', size: 10 * 1024 * 1024 }), '');
});
test('rejects an empty file', () => {
  assert.match(validateFile({ name: '简历.pdf', size: 0 }), /空/);
});
test('rejects unsupported formats', () => {
  assert.match(validateFile({ name: '文件.exe', size: 50 }), /PDF/);
});
test('rejects oversized files', () => {
  assert.match(validateFile({ name: '简历.docx', size: 10 * 1024 * 1024 + 1 }), /10 MB/);
});
