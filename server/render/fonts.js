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
  // React PDF otherwise treats a continuous Chinese phrase as one unbreakable
  // word. Keep Latin and numeric tokens intact while allowing a natural CJK
  // line break between adjacent Chinese characters.
  Font.registerHyphenationCallback(word => word
    .split(/(?<=\p{Script=Han})|(?=\p{Script=Han})/u)
    .filter(Boolean));
  registered = true;
}
