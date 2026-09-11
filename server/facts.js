const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const NAME_PATTERN = /^[\p{Script=Han}]{2,6}$/u;

export function buildFacts(sourceBlocks) {
  const sourceText = sourceBlocks.map((block) => block.text).join("\n");
  const firstLine = sourceBlocks.flatMap((block) => block.text.split(/\r?\n/)).find((line) => line.trim())?.trim() ?? "";
  const contacts = [...new Set([
    ...(sourceText.match(EMAIL_PATTERN) ?? []),
    ...(sourceText.match(PHONE_PATTERN) ?? []),
  ])];

  return {
    name: NAME_PATTERN.test(firstLine) ? firstLine : "",
    contact: contacts.join(" "),
    education: [],
    experiences: [],
    skills: [],
    sourceBlocks,
    warnings: [],
  };
}
