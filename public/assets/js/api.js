/**
 * API Client — Comunicação segura com o backend.
 *
 * - Access token mantido APENAS em memória (nunca localStorage)
 * - Refresh token via cookie httpOnly (gerenciado pelo servidor)
 * - Auto-renovação transparente em 401
 */
const FjsApi = (() => {
  const BASE = (() => {
    const customBase = window.__FJS_API_BASE__ || '';
    if (customBase) return String(customBase).replace(/\/+$/, '');

    const host = window.location.hostname;
    const port = window.location.port;
    const localApiPort = String(window.__FJS_API_PORT__ || '3001');
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (isLocalHost && port && port !== localApiPort) {
      return `${window.location.protocol}//${host}:${localApiPort}/api`;
    }

    return '/api';
  })();
  let _accessToken = null;
  let _refreshPromise = null;

  function setToken(token) { _accessToken = token; }
  function getToken() { return _accessToken; }
  function clearToken() { _accessToken = null; }

  async function request(endpoint, opts = {}) {
    const headers = { ...(opts.headers || {}) };

    if (!(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (_accessToken) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
    }

    const config = { ...opts, headers, credentials: 'include' };
    let res = await fetch(`${BASE}${endpoint}`, config);

    if (res.status === 401 && _accessToken) {
      if (!_refreshPromise) {
        _refreshPromise = fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include'
        })
          .then(r => r.ok ? r.json() : Promise.reject(r))
          .then(json => {
            if (json.data?.accessToken) {
              _accessToken = json.data.accessToken;
            }
          })
          .catch(() => {
            _accessToken = null;
          })
          .finally(() => { _refreshPromise = null; });
      }

      await _refreshPromise;

      if (_accessToken) {
        headers['Authorization'] = `Bearer ${_accessToken}`;
        res = await fetch(`${BASE}${endpoint}`, { ...config, headers });
      }
    }

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(json.message || `Erro ${res.status}`);
      err.status = res.status;
      err.details = json.details;
      throw err;
    }

    return json;
  }

  return {
    getBase: () => BASE,
    buildUrl: (endpoint = '') => `${BASE}${endpoint}`,
    setToken,
    getToken,
    clearToken,

    auth: {
      login: (email, password) =>
        request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        }),
      logout: () => request('/auth/logout', { method: 'POST' }),
      refresh: () => request('/auth/refresh', { method: 'POST' }),
      me: () => request('/auth/me')
    },

    posts: {
      getAll: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return request(`/posts${qs ? '?' + qs : ''}`);
      },
      getById: (id) => request(`/posts/id/${id}`),
      create: (formData) =>
        request('/posts', { method: 'POST', body: formData }),
      update: (id, formData) =>
        request(`/posts/${id}`, { method: 'PUT', body: formData }),
      patch: (id, data) =>
        request(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id) =>
        request(`/posts/${id}`, { method: 'DELETE' }),
      reorder: (id, order) =>
        request(`/posts/${id}/order`, { method: 'PATCH', body: JSON.stringify({ order }) })
    },

    pages: {
      getAll: () => request('/pages'),
      get: (key) => request(`/pages/${key}`),
      update: (key, data) =>
        request(`/pages/${key}`, { method: 'PUT', body: JSON.stringify(data) })
    },

    serviceImages: {
      getAll: () => request('/service-images'),
      add: (formData) =>
        request('/service-images', { method: 'POST', body: formData }),
      update: (formData) =>
        request('/service-images', { method: 'PUT', body: formData }),
      remove: (payload) =>
        request('/service-images', { method: 'DELETE', body: JSON.stringify(payload) })
    }
  };
})();
