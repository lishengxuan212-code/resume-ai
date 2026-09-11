import { AppError } from "./errors.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function invalid(message) {
  return new AppError(400, "document_invalid", message);
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
    return;
  }

  throw invalid("仅支持 PDF 或 DOCX 格式的简历文件");
}
