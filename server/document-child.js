import { AppError } from './errors.js';
import { extractDocument } from './extract-document.js';

process.once('message', async file => {
  try {
    const normalized = { ...file, buffer: Buffer.from(file.buffer) };
    const result = await extractDocument(normalized);
    process.send?.({ ok: true, result }, () => process.exit(0));
  } catch (error) {
    const safe = error instanceof AppError
      ? { status: error.status, code: error.code, message: error.message }
      : { status: 400, code: 'document_unreadable', message: '文档无法解析，请确认文件未损坏或未加密。' };
    process.send?.({ ok: false, error: safe }, () => process.exit(1));
  }
});
