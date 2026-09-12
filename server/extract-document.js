import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AppError } from "./errors.js";
import { buildFacts } from "./facts.js";
import { validateUpload } from "./document-validation.js";
import { MAX_SOURCE_BLOCKS, MAX_SOURCE_BLOCK_TEXT_LENGTH } from "./source-limits.js";

function unreadable(message) {
  return new AppError(400, "document_unreadable", message);
}

function appendSourceBlocks(blocks, text, page, lineEnds = []) {
  let start = 0;
  let index = 1;
  while (start < text.length) {
    let end = Math.min(start + MAX_SOURCE_BLOCK_TEXT_LENGTH, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end - 1) + 1;
      const lineEnd = lineEnds.findLast((offset) => offset > start && offset <= end) ?? 0;
      const boundary = Math.max(newline, lineEnd);
      // Keep delimiters when selecting a boundary for a nonblank chunk.
      if (boundary > start && text.slice(start, boundary).trim()) end = boundary;
    }
    const chunk = text.slice(start, end);
    // Blank gaps carry no source evidence and cannot pass optimization validation.
    // Count and number only meaningful chunks; retain their text and delimiters.
    if (chunk.trim()) {
      if (blocks.length >= MAX_SOURCE_BLOCKS) {
        throw new AppError(400, "document_too_long", "文档过长，暂时无法处理，请精简简历内容后重新上传。");
      }
      blocks.push({ id: `${page === null ? "docx" : `p${page}`}-b${index++}`, text: chunk, page });
    }
    start = end;
  }
}

async function extractPdf(buffer) {
  let document;
  try {
    document = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
    if (document.numPages > 10) {
      throw unreadable("PDF 最多支持 10 页");
    }

    const sourceBlocks = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      // Preserve parser line boundaries. Flattening every item into one line
      // loses the headings and date rows needed for reliable resume parsing.
      const rawText = textContent.items.map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`).join("");
      const text = rawText.trim();
      // PDF line endings are metadata. Retain the established space-normalized
      // text while using those positions to avoid splitting ordinary lines.
      let offset = -(rawText.length - rawText.trimStart().length);
      const lineEnds = [];
      for (const item of textContent.items) {
        offset += (item.str?.length ?? 0) + 1;
        if (item.hasEOL) lineEnds.push(offset);
      }
      if (text) appendSourceBlocks(sourceBlocks, text, pageNumber, lineEnds);
    }

    if (sourceBlocks.length === 0) {
      throw unreadable("该 PDF 没有可提取文字，可能是扫描型文件");
    }
    return sourceBlocks;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unreadable("PDF 文件无法解析，请确认文件未损坏或未加密");
  } finally {
    await document?.destroy();
  }
}

async function extractDocx(buffer) {
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    if (!text) {
      throw unreadable("DOCX 文件不含可提取文字");
    }
    const sourceBlocks = [];
    appendSourceBlocks(sourceBlocks, text, null);
    return sourceBlocks;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unreadable("DOCX 文件无法解析，请确认文件未损坏或未加密");
  }
}

export async function extractDocument(file) {
  validateUpload(file);
  const extension = file.originalname.match(/\.([^.]+)$/)[1].toLowerCase();
  const sourceBlocks = extension === "pdf" ? await extractPdf(file.buffer) : await extractDocx(file.buffer);
  return { facts: buildFacts(sourceBlocks) };
}
