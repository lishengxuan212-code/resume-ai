export function validateFile(file) {
  if (!file || file.size === 0) return '这个文件是空的，请重新选择。';
  if (!/\.(pdf|docx)$/i.test(file.name)) return '请选择 PDF 或 DOCX 格式的简历。';
  if (file.size > 10 * 1024 * 1024) return '文件需小于或等于 10 MB，请选择较小的版本。';
  return '';
}

export function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
