let csrfToken = '';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...options });
  } catch {
    throw new Error('暂时无法连接运营控制台。');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.message || '当前操作未完成，请稍后重试。');
    error.status = response.status;
    error.code = body?.error?.code;
    if (response.status === 401) csrfToken = '';
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

function jsonOptions(method, body, withCsrf = true) {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...(withCsrf && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    body: JSON.stringify(body),
  };
}

export async function getAdminStatus() {
  const result = await request('/api/admin/status');
  csrfToken = result.csrfToken || '';
  return result;
}

export async function setupAdmin(password) {
  const result = await request('/api/admin/setup', jsonOptions('POST', { password }, false));
  csrfToken = result.csrfToken || '';
  return result;
}

export async function loginAdmin(password) {
  const result = await request('/api/admin/login', jsonOptions('POST', { password }, false));
  csrfToken = result.csrfToken || '';
  return result;
}

export async function logoutAdmin() {
  await request('/api/admin/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
  csrfToken = '';
}

export const getOverview = (days = 7) => request(`/api/admin/overview?days=${encodeURIComponent(days)}`);
export const getInvites = () => request('/api/admin/invites');
export const createInvites = input => request('/api/admin/invites', jsonOptions('POST', input));
export const updateInvite = (id, input) => request(`/api/admin/invites/${encodeURIComponent(id)}`, jsonOptions('PATCH', input));
export const resetInviteToday = id => request(`/api/admin/invites/${encodeURIComponent(id)}/reset`, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
export const getCalls = filters => {
  const query = new URLSearchParams(Object.entries(filters || {}).filter(([, value]) => value !== '' && value !== undefined));
  return request(`/api/admin/calls?${query}`);
};
export const getSettings = () => request('/api/admin/settings');
export const updateSettings = input => request('/api/admin/settings', jsonOptions('PUT', input));
export const getAudit = () => request('/api/admin/audit');
