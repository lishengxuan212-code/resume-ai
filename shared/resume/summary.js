const splitSentences = value => String(value ?? '').split(/(?<=[。！？；])/u);

/** Personal summary covers work strengths; education remains in the top information area. */
export function withoutEducationBackground(value, education = []) {
  const terms = education.flatMap(entry => [entry?.school, entry?.major, entry?.degree])
    .filter(term => typeof term === 'string' && term.trim().length >= 2)
    .map(term => term.trim());
  return splitSentences(value).filter(sentence => !terms.some(term => sentence.includes(term))
    && !/(?:毕业于|学历(?:背景)?|本科|硕士|博士|专业(?:为|是)|在校成绩)/u.test(sentence)).join('').trim();
}
