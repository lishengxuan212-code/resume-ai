import { AppError } from './errors.js';

const MESSAGES = {
  unknown: '暂时无法完成优化，请稍后重试。',
  network_denied: '当前网络环境无法完成优化，请检查网络后重试。',
  network: '当前网络无法完成优化，请检查网络或代理后重试。',
  timeout: '优化等待超时，材料已保留，请稍后重试。',
  authentication: '当前配置无法完成优化，请稍后重试。',
  balance: '当前配置暂时无法完成优化，请稍后重试。',
  permission: '当前配置暂时无法完成优化，请稍后重试。',
  model: '当前配置暂时无法完成优化，请稍后重试。',
  request: '当前配置暂时无法完成优化，请稍后重试。',
  rate_limit: '当前请求较多，请稍后重试。',
  unavailable: '当前操作暂时不可用，请稍后重试。',
  invalid_result: '暂时未能完成优化，系统已连续自动重试 2 次，材料已保留，请稍后再试。',
  insufficient_optimization: '本次未形成足够优化，材料已保留，请重试或补充更具体的经历。',
};

export class ProviderError extends AppError {
  constructor(reason = 'unknown') {
    const safeReason = Object.hasOwn(MESSAGES, reason) ? reason : 'unknown';
    super(502, 'provider_failed', MESSAGES[safeReason]);
    this.reason = safeReason;
  }
}

export function safeProviderError(error) {
  // Rebuild even our own errors: never forward arbitrary upstream messages,
  // request bodies, credentials or response text into the API or logs.
  if (error instanceof ProviderError) return new ProviderError(error.reason);
  const code = error?.cause?.code ?? error?.code;
  if (['EACCES', 'EPERM'].includes(code)) return new ProviderError('network_denied');
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)) return new ProviderError('network');
  if (['AbortError', 'TimeoutError'].includes(error?.name)) return new ProviderError('timeout');
  return new ProviderError();
}

export function providerHttpError(status) {
  const reason = new Map([
    [400, 'request'], [401, 'authentication'], [402, 'balance'],
    [403, 'permission'], [404, 'model'], [408, 'timeout'], [429, 'rate_limit'],
  ]).get(status) ?? (status >= 500 ? 'unavailable' : 'unknown');
  return new ProviderError(reason);
}
