import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";

const FONT_PATH = fileURLToPath(new URL(
  "../node_modules/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff",
  import.meta.url,
));
const PAGE_MARGIN = 50;
const PAGE_BOTTOM_BUFFER = 12;

function presentText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : "";
}

function ensureSpace(document, height) {
  const pageBottom = document.page.height - document.page.margins.bottom;
  const printableHeight = pageBottom - document.page.margins.top;
  if (
    height <= printableHeight
    && document.y > document.page.margins.top
    && document.y + height + PAGE_BOTTOM_BUFFER > pageBottom
  ) {
    document.addPage();
  }
}

function writeText(document, value, options = {}) {
  const text = presentText(value);
  if (!text) return;
  const textOptions = { width: document.page.width - (PAGE_MARGIN * 2), ...options };
  ensureSpace(document, document.heightOfString(text, textOptions));
  document.text(text, textOptions);
}

function writeEntry(document, entry, inlineBullets = false) {
  document.fontSize(13);
  writeText(document, entry.title, { paragraphGap: 2 });

  const organizationAndDates = [presentText(entry.organization), presentText(entry.dates)].filter(Boolean).join("  ·  ");
  document.fontSize(10);
  writeText(document, organizationAndDates, { paragraphGap: 3 });

  document.fontSize(10);
  for (const bullet of entry.bullets ?? []) {
    const text = presentText(typeof bullet === 'string' ? bullet : bullet?.text);
    const title = presentText(typeof bullet === 'object' ? bullet?.title : '');
    if (inlineBullets && title && text) {
      writeText(document, `${title}：${text}`, { indent: 12, paragraphGap: 4 });
    } else if (title) {
      document.fontSize(10.5);
      writeText(document, `• ${title}`, { indent: 12, paragraphGap: 1 });
      document.fontSize(10);
      writeText(document, text, { indent: 23, paragraphGap: 4 });
    } else if (text) writeText(document, `• ${text}`, { indent: 12, paragraphGap: 3 });
  }
  document.moveDown(0.45);
}

/**
 * Render an already reviewed resume as a PDF entirely in memory.
 *
 * @param {{ facts: object, resume: object }} value
 * @returns {Promise<Buffer>}
 */
export function exportPdf({ facts, resume }) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
    const chunks = [];
    let settled = false;
    const finish = (callback, value) => {
      if (!settled) {
        settled = true;
        callback(value);
      }
    };

    document.on("data", (chunk) => chunks.push(chunk));
    document.once("error", (error) => finish(reject, error));
    document.once("end", () => finish(resolve, Buffer.concat(chunks)));

    try {
      document.registerFont("NotoSerifSC", FONT_PATH);
      document.font("NotoSerifSC");

      document.fontSize(20);
      writeText(document, facts?.name, { paragraphGap: 4 });
      document.fontSize(10);
      writeText(document, facts?.contact, { paragraphGap: 12 });

      const targetRole = presentText(resume?.targetRole);
      if (targetRole) {
        document.fontSize(12);
        writeText(document, `目标岗位：${targetRole}`, { paragraphGap: 8 });
      }

      const summary = presentText(resume?.summary);
      if (summary) {
        document.fontSize(12);
        writeText(document, "摘要", { paragraphGap: 3 });
        document.fontSize(10);
        writeText(document, summary, { paragraphGap: 10 });
      }

      for (const section of resume?.sections ?? []) {
        const heading = presentText(section?.heading);
        if (heading) {
          document.fontSize(14);
          writeText(document, heading, { paragraphGap: 6 });
        }
        for (const entry of section?.entries ?? []) writeEntry(document, entry ?? {}, heading === '技能');
      }

      document.end();
    } catch (error) {
      finish(reject, error);
      document.end();
    }
  });
}
