export function createResumeApi(dependencies = {}) {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  let csrfToken = '';
  async function request(path, options) {
    try {
      return await fetchRequest(path, { credentials: 'same-origin', ...options });
    } catch {
      throw new Error('暂时无法连接，请检查网络后重试。');
    }
  }
  async function responseError(response, fallback) {
    const body = await response.json().catch(() => null);
    const error = new Error(typeof body?.error?.message === 'string' && body.error.message.trim() ? body.error.message : fallback);
    error.code = body?.error?.code;
    error.status = response.status;
    if (response.status === 401) csrfToken = '';
    return error;
  }
  async function json(path, options) {
    const response = await request(path, options);
    if (!response.ok) throw await responseError(response, '当前操作暂时不可用，请稍后重试。');
    try { return await response.json(); } catch { throw new Error('当前操作返回了无法读取的内容，请重试。'); }
  }
  const csrfHeaders = () => csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
  const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...csrfHeaders() }, body: JSON.stringify(body) });
  let api;
  api = {
    async getAccessStatus() {
      const result = await json('/api/access');
      csrfToken = result.csrfToken || '';
      return result;
    },
    async redeemInvite(code) {
      const result = await json('/api/access/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      csrfToken = result.csrfToken || '';
      return result;
    },
    async logoutAccess() {
      const response = await request('/api/access/logout', { method: 'POST', headers: csrfHeaders() });
      if (!response.ok) throw await responseError(response, '暂时无法退出，请稍后重试。');
      csrfToken = '';
    },
    async acceptPrivacy() {
      const response = await request('/api/access/consent', { method: 'POST', headers: csrfHeaders() });
      if (!response.ok) throw await responseError(response, '暂时无法保存隐私选择，请稍后重试。');
    },
    getApiConfig: () => json('/api/config'),
    extractResume(file) {
      const body = new FormData();
      body.append('resume', file);
      const headers = csrfHeaders();
      return json('/api/extract', { method: 'POST', ...(Object.keys(headers).length ? { headers } : {}), body });
    },
    diagnoseResume: (facts, targetRole, jobDescription = '') => json('/api/diagnose', post({ facts, targetRole, jobDescription })),
    optimizeResume: (facts, targetRole, options = {}) => {
      const body = { facts, targetRole, jobDescription: options.jobDescription || '', answers: options.answers || [], skipQuestions: Boolean(options.skipQuestions) };
      if (options.diagnosis) body.diagnosis = options.diagnosis;
      return json('/api/optimize', post(body));
    },
    async requestResumePdf(facts, resume, templateId = 'recommended', presentation = {}, signal) {
      const body = { facts, resume, templateId, ...(presentation?.avatarDataUrl ? { presentation } : {}) };
      const response = await request('/api/export', { ...post(body), signal });
      if (!response.ok) throw await responseError(response, 'PDF 生成失败，请重试。');
      if (response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') {
        throw await responseError(response, '未收到 PDF 文件，请稍后重试。');
      }
      return response.blob();
    },
    saveResumePdf(blob) {
      const urls = dependencies.URL ?? globalThis.URL;
      const dom = dependencies.document ?? globalThis.document;
      const url = urls.createObjectURL(blob);
      let anchor;
      try {
        anchor = dom.createElement('a');
        anchor.href = url;
        anchor.download = '优化简历.pdf';
        dom.body.append(anchor);
        anchor.click();
      } finally {
        anchor?.remove();
        urls.revokeObjectURL(url);
      }
    },
    async downloadResume(facts, resume, templateId = 'recommended', presentation = {}) {
      const blob = await api.requestResumePdf(facts, resume, templateId, presentation);
      api.saveResumePdf(blob);
    },
  };
  return api;
}

export const { getAccessStatus, redeemInvite, logoutAccess, acceptPrivacy, getApiConfig, extractResume, diagnoseResume, optimizeResume, requestResumePdf, saveResumePdf, downloadResume } = createResumeApi();
