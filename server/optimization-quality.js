function normalize(value) { return String(value ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ''); }
function bigrams(value) {
  const text = normalize(value);
  if (text.length < 2) return new Set(text ? [text] : []);
  return new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
}
export function diceSimilarity(left, right) {
  const a = bigrams(left); const b = bigrams(right);
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}
export function assessOptimizationQuality(resume, facts) {
  const bullets = resume.sections.flatMap(section => section.entries).flatMap(entry => entry.bullets);
  const sources = new Map(facts.sourceBlocks.map(block => [block.id, block.text]));
  const comparisons = bullets.map(bullet => {
    const cited = bullet.sourceIds.map(id => sources.get(id) ?? '').join('\n');
    const output = normalize(bullet.text); const source = normalize(cited);
    return { similarity: diceSimilarity(output, source), exactCopy: output.length >= 12 && (source.includes(output) || output.includes(source)) };
  });
  const sourceLength = normalize(facts.sourceBlocks.map(block => block.text).join('\n')).length;
  const exactCopyCount = comparisons.filter(item => item.exactCopy).length;
  const sourceSimilarity = comparisons.length ? comparisons.reduce((sum, item) => sum + item.similarity, 0) / comparisons.length : 1;
  const exactCopyRatio = comparisons.length ? exactCopyCount / comparisons.length : 1;
  // Very short fragments cannot be reliably rewritten without adding meaning.
  // Once the cited material reaches 30 normalized characters, verbatim output
  // is treated as a failed optimization and retried.
  const substantiveChange = sourceLength < 30 || (exactCopyRatio < 0.75 && sourceSimilarity < 0.9);
  return { checked: true, substantiveChange, sourceSimilarity: Number(sourceSimilarity.toFixed(3)), exactCopyCount, totalBullets: bullets.length, reason: substantiveChange ? 'rewritten' : 'too_similar_to_source' };
}
export const QUALITY_RETRY_FEEDBACK = '质量检查发现上一版与来源原文过于相似。保持事实、数字、职责边界和引用不变，重新完成信息取舍、句子拆分、行动化表达与去重；不要只是替换同义词。';
