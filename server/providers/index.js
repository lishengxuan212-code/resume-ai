import { AppError } from '../errors.js';
import { validateDiagnosis } from '../diagnosis-validation.js';
import { assessOptimizationQuality } from '../optimization-quality.js';
import { providerFailed, validateOptimizedResume } from '../resume-validation.js';
import { generateOpenAI } from './openai.js';
import { generateCompatibleChat } from './compatible-chat.js';
import { ProviderError, safeProviderError } from '../provider-error.js';
import { buildConservativeResume } from '../conservative-resume.js';

const PROVIDERS = new Set(['openai', 'deepseek', 'qwen']);
const MAX_ATTEMPTS = 3;
const INVALID_RESULT_RETRY_FEEDBACK = '上一版未通过程序校验，请重新完整生成。严格遵守 JSON 字段结构；每条 bullet 都必须包含简洁的 title、完整 text、有效 sourceIds 和有效 ruleIds，且 ruleIds 必须包含 F01；方法论编号只能存在于 ruleIds，不能写进任何用户可见文字；不得新增来源中不存在的公司、职位、日期、数字或事实。只返回完整 JSON。';
const INVALID_DIAGNOSIS_RETRY_FEEDBACK = '上一版诊断未通过结构校验，请重新完整生成。严格使用指定字段、已知 sourceIds 和本次适用 ruleIds；findings 和 questions 均不超过 12 项，每个 question 都必须有基于已有事实的 suggestedRewrite，不增加额外字段。';
export function createProvider(config, fetchImpl = globalThis.fetch) {
  const candidates = config?.providers ?? [config];
  if (!Array.isArray(candidates) || candidates.some(candidate => !PROVIDERS.has(candidate?.provider))) throw new AppError(503, 'provider_invalid', 'Unsupported AI provider');
  const configured = candidates.filter(candidate => candidate.configured && candidate.apiKey && candidate.model);
  if (!configured.length) throw new AppError(503, 'provider_unconfigured', '当前 AI 服务尚未配置。');
  const call = (settings, input, task) => (settings.provider === 'openai' ? generateOpenAI : generateCompatibleChat)(settings, input, fetchImpl, task);
  const settingsFor = candidate => ({ provider: candidate.provider, model: candidate.model, apiKey: candidate.apiKey, timeoutMs: candidate.timeoutMs });
  const validateResume = (result, input, settings, options = {}) => {
    try { return validateOptimizedResume(result, input.facts, settings.provider, settings.model, { ruleIds: input.ruleIds, diagnosis: input.diagnosis, answers: input.answers, ...options }); }
    catch { throw new ProviderError('invalid_result'); }
  };
  return {
    async diagnoseResume(input) {
      let lastError;
      let attempts = 0;
      let revisionFeedback = '';
      for (const candidate of configured) {
        const settings = settingsFor(candidate);
        try {
          while (attempts < MAX_ATTEMPTS) {
            const attempt = attempts;
            attempts += 1;
            try {
              const result = await call(settings, revisionFeedback ? { ...input, revisionFeedback } : input, 'diagnose');
              return validateDiagnosis(result, input.facts, settings.provider, settings.model, { ruleIds: input.ruleIds });
            } catch (error) {
              const safeError = error instanceof SyntaxError ? new ProviderError('invalid_result') : safeProviderError(error);
              if (safeError.reason !== 'invalid_result' || attempt === MAX_ATTEMPTS - 1) throw safeError;
              revisionFeedback = INVALID_DIAGNOSIS_RETRY_FEEDBACK;
            }
          }
        }
        catch (error) { lastError = safeProviderError(error); }
      }
      throw lastError ?? providerFailed();
    },
    async generateResume(input) {
      let lastError;
      let attempts = 0;
      for (const candidate of configured) {
        const settings = settingsFor(candidate);
        try {
          let revisionFeedback = '';
          while (attempts < MAX_ATTEMPTS) {
            const attempt = attempts;
            attempts += 1;
            let validated;
            try {
              const result = await call(settings, revisionFeedback ? { ...input, revisionFeedback } : input, 'optimize');
              validated = validateResume(result, input, settings);
            } catch (error) {
              const safeError = error instanceof SyntaxError ? new ProviderError('invalid_result') : safeProviderError(error);
              if (safeError.reason !== 'invalid_result' || attempt === MAX_ATTEMPTS - 1) throw safeError;
              revisionFeedback = INVALID_RESULT_RETRY_FEEDBACK;
              continue;
            }
            const quality = assessOptimizationQuality(validated, input.facts);
            // Similar wording is a review signal, never a reason to strand the
            // user or delete source-supported achievements. They can edit the
            // generated resume directly and still receive a PDF.
            return { ...validated, quality };
          }
        } catch (error) { lastError = safeProviderError(error); }
      }
      // A malformed model response must not block a user from receiving a resume.
      // Keep provider authentication/network failures visible, but turn repeated
      // structural failures into a complete, source-preserving current-content draft.
      if (lastError?.reason === 'invalid_result') {
        const settings = settingsFor(configured[0]);
        const fallback = validateResume(buildConservativeResume(input), input, settings, { userConfirmedEdits: true });
        const totalBullets = fallback.sections.reduce((total, section) => total + section.entries.reduce((count, entry) => count + entry.bullets.length, 0), 0);
        return { ...fallback, quality: { checked: true, substantiveChange: false, sourceSimilarity: 1, exactCopyCount: 0, totalBullets, reason: 'current_content_fallback' } };
      }
      throw lastError ?? providerFailed();
    },
  };
}
