const HAN = '\\p{Script=Han}';
const CJK_LINE_WIDTH = 48;

/** Removes extraction-only gaps while retaining ordinary English and numeric spacing. */
export function normalizeResumeText(value) {
  if (typeof value !== 'string') return '';
  let result = value.trim().replace(/[\t\r\n\f\v\u00a0]+/gu, ' ').replace(/ {2,}/g, ' ');
  result = result.replace(new RegExp(`(?<=${HAN}) (?=${HAN})`, 'gu'), '');
  result = result.replace(new RegExp(`(?<=${HAN}) (?=[A-Z]{2,8}(?:$|[^A-Za-z]))`, 'gu'), '');
  result = result.replace(new RegExp(`(?<=[A-Z]{2,8}) (?=${HAN})`, 'gu'), '');
  return result;
}

/**
 * React PDF adds a hyphen at every callback-defined word break. Chinese does
 * not need hyphenation, so create conservative, explicit line breaks before
 * rendering instead. ASCII words remain intact and source punctuation stays
 * exactly as written.
 */
export function wrapChinesePdfText(value, width = CJK_LINE_WIDTH) {
  const input = normalizeResumeText(value);
  if (!input) return '';
  let lineWidth = 0;
  let output = '';
  for (const character of Array.from(input)) {
    const characterWidth = /[\u0000-\u00ff]/u.test(character) ? 0.55 : 1;
    if (lineWidth && lineWidth + characterWidth > width && /[\p{Script=Han}\p{P}\p{S}]/u.test(character)) {
      output += '\n';
      lineWidth = 0;
    }
    output += character;
    lineWidth += characterWidth;
  }
  return output;
}
