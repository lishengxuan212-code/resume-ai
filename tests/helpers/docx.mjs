import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const JSZip = createRequire(require.resolve('mammoth'))('jszip');

// Real DOCX container and XML, generated in memory only.
export async function docxWithParagraphs(paragraphs) {
  const zip = await JSZip.loadAsync(await readFile(new URL('../fixtures/resume.docx', import.meta.url)));
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(text => `<w:p><w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
