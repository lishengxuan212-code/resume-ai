import { Font } from '@react-pdf/renderer';
import { fileURLToPath } from 'node:url';

const NOTO_SERIF_SC = fileURLToPath(new URL(
  '../../node_modules/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff',
  import.meta.url,
));
const NOTO_SERIF_SC_BOLD = fileURLToPath(new URL(
  '../../node_modules/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-700-normal.woff',
  import.meta.url,
));
const NOTO_SANS_SC = fileURLToPath(new URL(
  '../../node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff',
  import.meta.url,
));
const NOTO_SANS_SC_BOLD = fileURLToPath(new URL(
  '../../node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff',
  import.meta.url,
));

let registered = false;

export function registerResumeFonts() {
  if (registered) return;
  Font.register({ family: 'ResumeSongti', src: NOTO_SERIF_SC, fontWeight: 400 });
  Font.register({ family: 'ResumeSongti', src: NOTO_SERIF_SC_BOLD, fontWeight: 700 });
  Font.register({ family: 'ResumeReferenceSans', src: NOTO_SANS_SC, fontWeight: 400 });
  Font.register({ family: 'ResumeReferenceSans', src: NOTO_SANS_SC_BOLD, fontWeight: 700 });
  // React PDF writes a literal hyphen when it breaks one of the fragments
  // returned by a hyphenation callback. We pre-wrap Chinese display text
  // instead, so only genuine source hyphens can appear in the PDF.
  Font.registerHyphenationCallback(word => [word]);
  registered = true;
}
