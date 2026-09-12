import { METHODOLOGY_VERSION, methodologyRuleMap } from './methodology/index.js';
import { ProviderError } from './provider-error.js';
import { MAX_DIAGNOSIS_QUESTIONS } from './source-limits.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim());
const isList = (value, max, required = false) => Array.isArray(value) && value.length <= max && (!required || value.length);

export function validateDiagnosis(value, facts, provider, model, options = {}) {
  const fail = () => { throw new ProviderError('invalid_result'); };
  if (!isObject(value) || value.methodologyVersion !== METHODOLOGY_VERSION || !isList(value.findings, MAX_DIAGNOSIS_QUESTIONS) || !isList(value.questions, MAX_DIAGNOSIS_QUESTIONS) || typeof value.canOptimizeDirectly !== 'boolean') fail();
  const sourceIds = new Set(facts.sourceBlocks.map(block => block.id));
  const knownRules = methodologyRuleMap();
  const internalRuleCode = new RegExp(`(^|[^A-Za-z0-9])(?:${[...knownRules.keys()].join('|')})(?=$|[^A-Za-z0-9])`, 'i');
  const visibleText = (value, max, required = false) => isText(value, max, required) && !internalRuleCode.test(value);
  const allowedRules = new Set(options.ruleIds ?? knownRules.keys());
  const ids = new Set();
  const validSources = values => isList(values, 30) && values.every(id => typeof id === 'string' && sourceIds.has(id));
  const validRules = values => isList(values, 16, true) && values.every(id => typeof id === 'string' && knownRules.has(id) && allowedRules.has(id));
  const findings = value.findings.map(item => {
    if (!isObject(item) || !visibleText(item.dimension, 40, true) || !visibleText(item.issue, 400, true) || !validSources(item.evidenceSourceIds) || !visibleText(item.suggestedAction, 400, true) || !validRules(item.ruleIds)) fail();
    return { dimension: item.dimension, issue: item.issue, evidenceSourceIds: [...item.evidenceSourceIds], suggestedAction: item.suggestedAction, ruleIds: [...item.ruleIds] };
  });
  const questions = value.questions.map(item => {
    if (!isObject(item) || !isText(item.id, 40, true) || ids.has(item.id) || !visibleText(item.question, 300, true) || !visibleText(item.reason, 300, true) || !visibleText(item.suggestedRewrite, 500, true) || !validSources(item.sourceIds) || !validRules(item.ruleIds)) fail();
    ids.add(item.id);
    return { id: item.id, question: item.question, reason: item.reason, suggestedRewrite: item.suggestedRewrite, sourceIds: [...item.sourceIds], ruleIds: [...item.ruleIds] };
  });
  return { methodologyVersion: METHODOLOGY_VERSION, findings, questions, canOptimizeDirectly: true, provider, model };
}
