import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AppError } from './errors.js';
import { validateUpload } from './document-validation.js';

const CHILD_PATH = fileURLToPath(new URL('./document-child.js', import.meta.url));
const PARSE_TIMEOUT_MS = 25_000;

export function extractDocumentIsolated(file) {
  validateUpload(file);
  return new Promise((resolve, reject) => {
    const child = fork(CHILD_PATH, [], {
      execArgv: ['--max-old-space-size=256'],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      windowsHide: true,
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      if (child.connected) child.disconnect();
      if (!child.killed) child.kill();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new AppError(408, 'document_timeout', '文档处理超时，请精简文件后重试。')), PARSE_TIMEOUT_MS);
    timer.unref?.();
    child.once('error', () => finish(new AppError(400, 'document_unreadable', '文档无法解析，请确认文件未损坏或未加密。')));
    child.once('exit', () => {
      if (!settled) finish(new AppError(400, 'document_unreadable', '文档处理失败，请精简文件后重试。'));
    });
    child.once('message', message => {
      if (message?.ok) return finish(null, message.result);
      const safe = message?.error;
      finish(new AppError(safe?.status ?? 400, safe?.code ?? 'document_unreadable', safe?.message ?? '文档无法解析，请确认文件未损坏或未加密。'));
    });
    child.send({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    }, error => {
      if (error) finish(new AppError(400, 'document_unreadable', '文档处理失败，请稍后重试。'));
    });
  });
}
