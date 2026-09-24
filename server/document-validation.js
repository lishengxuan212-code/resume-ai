import { AppError } from "./errors.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 500;
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_DOCX_ENTRY_BYTES = 20 * 1024 * 1024;

function invalid(message) {
  return new AppError(400, "document_invalid", message);
}

function validateDocxArchive(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  let end = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw invalid('DOCX 文件结构不完整');
  const entries = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  if (!entries || entries > MAX_DOCX_ENTRIES || centralOffset + centralSize > buffer.length) {
    throw invalid('DOCX 文件结构过大或不完整');
  }
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw invalid('DOCX 文件目录无效');
    const flags = buffer.readUInt16LE(cursor + 8);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (flags & 1 || uncompressed === 0xffffffff || uncompressed > MAX_DOCX_ENTRY_BYTES) throw invalid('DOCX 文件包含不支持或过大的内容');
    total += uncompressed;
    if (total > MAX_DOCX_UNCOMPRESSED_BYTES) throw invalid('DOCX 解压后内容不能超过 50 MB');
    cursor += 46 + nameLength + extraLength + commentLength;
  }
}

export function validateUpload(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw invalid("请上传简历文件");
  }

  if (file.size <= 0 || file.buffer.length <= 0) {
    throw invalid("上传文件不能为空");
  }

  if (file.size > MAX_UPLOAD_BYTES || file.buffer.length > MAX_UPLOAD_BYTES) {
    throw invalid("上传文件不能超过 10 MB");
  }

  const extension = file.originalname?.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (extension === "pdf") {
    if (!file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw invalid("PDF 文件格式不正确");
    }
    return;
  }

  if (extension === "docx") {
    if (!file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw invalid("DOCX 文件格式不正确");
    }
    validateDocxArchive(file.buffer);
    return;
  }

  throw invalid("仅支持 PDF 或 DOCX 格式的简历文件");
}
