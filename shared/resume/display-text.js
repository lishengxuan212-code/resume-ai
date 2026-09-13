const HAN = '\\p{Script=Han}';

/** Removes extraction-only gaps while retaining ordinary English and numeric spacing. */
export function normalizeResumeText(value) {
  if (typeof value !== 'string') return '';
  let result = value.trim().replace(/[\t\r\n\f\v\u00a0]+/gu, ' ').replace(/ {2,}/g, ' ');
  result = result.replace(new RegExp(`(?<=${HAN}) (?=${HAN})`, 'gu'), '');
  result = result.replace(new RegExp(`(?<=${HAN}) (?=[A-Z]{2,8}(?:$|[^A-Za-z]))`, 'gu'), '');
  result = result.replace(new RegExp(`(?<=[A-Z]{2,8}) (?=${HAN})`, 'gu'), '');
  return result;
}
