// REST client for auth + team persistence. Stores the JWT in localStorage.
const BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
const TOKEN_KEY = 'pbs_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const authApi = {
  register: (username, password) =>
    request('/api/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me', { auth: true }),
};

export const teamsApi = {
  list: () => request('/api/teams', { auth: true }),
  create: (name, slots) => request('/api/teams', { method: 'POST', body: { name, slots }, auth: true }),
  update: (id, name, slots) =>
    request(`/api/teams/${id}`, { method: 'PUT', body: { name, slots }, auth: true }),
  remove: (id) => request(`/api/teams/${id}`, { method: 'DELETE', auth: true }),
};
