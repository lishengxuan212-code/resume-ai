import { AppError } from './errors.js';

const MESSAGES = {
  unknown: 'AI 服务暂时无法生成简历，请稍后重试。',
  network_denied: '本地 AI 服务的外网连接被运行环境拒绝，请使用允许联网的方式重新启动后端服务。',
  network: '后端无法连接 AI 服务，请检查后端网络或代理后重试。',
  timeout: 'AI 生成等待超时，已保留你的材料，请稍后重试。',
  authentication: 'AI 服务密钥验证失败，请检查服务端配置后重试。',
  balance: 'AI 服务账户余额不足，请充值或切换已配置的服务商。',
  permission: '当前 AI 账户没有调用权限，请检查账户权限和服务区域。',
  model: '配置的 AI 模型或接口不可用，请检查服务端模型配置。',
  request: 'AI 服务不接受当前请求参数，请检查模型与接口配置。',
  rate_limit: 'AI 服务请求过于频繁或额度受限，请稍后重试。',
  unavailable: 'AI 服务商暂时不可用，请稍后重试。',
  invalid_result: 'AI 暂时未能生成可用简历，系统已连续自动重试 2 次，材料已保留，请稍后再试。',
  insufficient_optimization: 'AI 返回内容与原始材料过于相似，系统已连续自动重试 2 次，仍未形成实质优化。你的材料已保留，请重试或补充更具体的经历。',
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
