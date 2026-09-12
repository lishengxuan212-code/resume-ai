import { Font } from '@react-pdf/renderer';
import { fileURLToPath } from 'node:url';

const NOTO_SERIF_SC = fileURLToPath(new URL(
  '../../node_modules/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff',
  import.meta.url,
));

let registered = false;

export function registerResumeFonts() {
  if (registered) return;
  Font.register({ family: 'ResumeNotoSerifSC', src: NOTO_SERIF_SC });
  Font.registerHyphenationCallback(word => [word]);
  registered = true;
}
