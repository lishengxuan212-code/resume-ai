import { renderResumePdf } from './render/render-pdf.js';

/**
 * Render an already reviewed resume as a PDF entirely in memory.
 *
 * @param {{ facts: object, resume: object }} value
 * @returns {Promise<Buffer>}
 */
export function exportPdf({ facts, resume, templateId = 'recommended', presentation }) {
  return renderResumePdf({ facts, resume, templateId, presentation });
}
