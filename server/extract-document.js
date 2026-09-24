import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AppError } from "./errors.js";
import { buildFacts } from "./facts.js";
import { validateUpload } from "./document-validation.js";
import { MAX_SOURCE_BLOCKS, MAX_SOURCE_BLOCK_TEXT_LENGTH } from "./source-limits.js";
import { extractPdfAvatar } from './extract-avatar.js';

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

function isSameVisualLine(left, right) {
  // PDF coordinates use points. A small tolerance keeps characters rendered
  // with fractional baselines together while preserving separate text rows.
  return Math.abs(left.y - right.y) <= 2;
}

function joinVisualLine(entries) {
  entries.sort((left, right) => left.x - right.x || left.index - right.index);
  let text = "";
  let previous;
  for (const entry of entries) {
    const { item, x } = entry;
    const fontHeight = Math.max(Math.abs(item.height ?? 0), 1);
    const gap = previous ? x - (previous.x + previous.item.width) : 0;
    // Adjacent glyphs may be separate PDF items (especially Chinese). Inserting
    // a space between every item invents word breaks. Preserve actual gaps,
    // including the wider separators between company, role and date fields.
    if (gap >= fontHeight) text = text.trimEnd() + "  ";
    else if (gap > fontHeight * 0.15 && !/\s$/.test(text) && !/^\s/.test(item.str)) text += " ";
    text += /^\s+$/.test(item.str) && item.width >= fontHeight ? "  " : item.str;
    previous = entry;
  }
  return text.trim();
}

function pdfTextInVisualOrder(items) {
  const positioned = items
    .filter((item) => item.str)
    .map((item, index) => ({
      item,
      index,
      x: item.transform?.[4],
      y: item.transform?.[5],
    }));

  if (positioned.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
    return items.map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`).join("");
  }

  positioned.sort((left, right) => right.y - left.y || left.x - right.x || left.index - right.index);
  const lines = [];
  for (const entry of positioned) {
    // Sorted rows need only compare with the last row, avoiding a scan of all
    // preceding lines for every text item on a dense page.
    const line = lines.at(-1);
    if (line && isSameVisualLine(line, entry)) line.entries.push(entry);
    else lines.push({ y: entry.y, entries: [entry] });
  }

  return lines
    .map((line) => joinVisualLine(line.entries))
    .join("\n");
}

async function extractPdf(buffer) {
  let loadingTask;
  let document;
  try {
    loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      maxImageSize: 16_000_000,
    });
    document = await loadingTask.promise;
    if (document.numPages > 10) {
      throw unreadable("PDF 最多支持 10 页");
    }

    const sourceBlocks = [];
    let avatarDataUrl = '';
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      if (pageNumber === 1) avatarDataUrl = await extractPdfAvatar(page).catch(() => '');
      const textContent = await page.getTextContent();
      // A PDF content stream may write text boxes out of their visual order.
      // Restore rows from their page coordinates before segmenting headings and
      // numbered responsibilities, so neighboring items do not trade content.
      const rawText = pdfTextInVisualOrder(textContent.items);
      const text = rawText.trim();
      if (text) appendSourceBlocks(sourceBlocks, text, pageNumber);
    }

    if (sourceBlocks.length === 0) {
      throw unreadable("该 PDF 没有可提取文字，可能是扫描型文件");
    }
    return { sourceBlocks, avatarDataUrl };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unreadable("PDF 文件无法解析，请确认文件未损坏或未加密");
  } finally {
    await loadingTask?.destroy();
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
    return { sourceBlocks, avatarDataUrl: '' };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unreadable("DOCX 文件无法解析，请确认文件未损坏或未加密");
  }
}

export async function extractDocument(file) {
  validateUpload(file);
  const extension = file.originalname.match(/\.([^.]+)$/)[1].toLowerCase();
  const { sourceBlocks, avatarDataUrl } = extension === "pdf" ? await extractPdf(file.buffer) : await extractDocx(file.buffer);
  return { facts: buildFacts(sourceBlocks), presentation: { avatarDataUrl } };
}
