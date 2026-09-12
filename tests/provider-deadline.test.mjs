import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson } from '../server/providers/request-json.js';

test('complete-response budget allows a slow body and still aborts stalled bodies', async () => {
  const transport = delay => async () => ({ ok: true, json: () => new Promise(resolve => setTimeout(() => resolve({ complete: true }), delay)) });
  assert.deepEqual(await requestJson('https://example.test', {}, { timeoutMs: 250 }, transport(70)), { complete: true });
  await assert.rejects(requestJson('https://example.test', {}, { timeoutMs: 10 }, transport(70)), error => error.reason === 'timeout');
});

test('a stalled provider receives an abort and is not automatically re-requested', async () => {
  let signal, calls = 0;
  await assert.rejects(requestJson('https://example.test', {}, { timeoutMs: 10 }, async (url,options) => { calls++; signal=options.signal; return new Promise(()=>{}); }), error=>error.reason === 'timeout');
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
});
