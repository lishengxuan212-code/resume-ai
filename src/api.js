export function createResumeApi(dependencies = {}) {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  async function request(path, options) {
    try {
      return await fetchRequest(path, options);
    } catch {
      throw new Error('无法连接简历服务，请检查网络后重试。');
    }
  }
  async function responseError(response, fallback) {
    const body = await response.json().catch(() => null);
    return new Error(typeof body?.error?.message === 'string' && body.error.message.trim() ? body.error.message : fallback);
  }
  async function json(path, options) {
    const response = await request(path, options);
    if (!response.ok) throw await responseError(response, '简历服务暂时不可用，请稍后重试。');
    try { return await response.json(); } catch { throw new Error('简历服务返回了无法读取的内容，请重试。'); }
  }
  const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let api;
  api = {
    getApiConfig: () => json('/api/config'),
    getResumeTemplates: () => json('/api/templates'),
    extractResume(file) {
      const body = new FormData();
      body.append('resume', file);
      return json('/api/extract', { method: 'POST', body });
    },
    diagnoseResume: (facts, targetRole, jobDescription = '') => json('/api/diagnose', post({ facts, targetRole, jobDescription })),
    optimizeResume: (facts, targetRole, options = {}) => {
      const body = { facts, targetRole, jobDescription: options.jobDescription || '', answers: options.answers || [], skipQuestions: Boolean(options.skipQuestions) };
      if (options.diagnosis) body.diagnosis = options.diagnosis;
      return json('/api/optimize', post(body));
    },
    async requestResumePdf(facts, resume, templateId = 'classic', signal) {
      const response = await request('/api/export', { ...post({ facts, resume, templateId }), signal });
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
    async downloadResume(facts, resume, templateId = 'classic') {
      const blob = await api.requestResumePdf(facts, resume, templateId);
      api.saveResumePdf(blob);
    },
  };
  return api;
}

export const { getApiConfig, getResumeTemplates, extractResume, diagnoseResume, optimizeResume, requestResumePdf, saveResumePdf, downloadResume } = createResumeApi();
