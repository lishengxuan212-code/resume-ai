import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AppError } from "./errors.js";
import { buildFacts } from "./facts.js";
import { validateUpload } from "./document-validation.js";

function unreadable(message) {
  return new AppError(400, "document_unreadable", message);
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
      const text = textContent.items.map((item) => item.str).join(" ").trim();
      if (text) sourceBlocks.push({ id: `p${pageNumber}-b1`, text, page: pageNumber });
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
    return [{ id: "docx-b1", text, page: null }];
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
