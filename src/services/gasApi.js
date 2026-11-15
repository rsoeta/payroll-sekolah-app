import { sanitizePayload } from '../utils/formatters';
import { executeSandboxRequest } from './sandboxDb';

/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (GAS) FETCH API HELPER
 * Target Backend Version: v2_AuthFix
 * ============================================================================
 * - In local Vite development (`import.meta.env.DEV`), routes requests through
 *   the built-in `/__gas_proxy__` middleware so browser CORS & multi-account
 *   cookie conflicts never block requests, and any GAS 403 deployment permission
 *   misconfiguration is reported with a clear Indonesian diagnostic message.
 * - In static production builds, uses `credentials: 'omit'` + `text/plain;charset=utf-8`
 *   with automatic GET `?payload=` fallback (`v2_AuthFix`).
 */

const SESSION_STORAGE_KEY = 'sipayroll_auth_session';
const CUSTOM_GAS_URL_KEY = 'sipayroll_custom_gas_url';

export function getConfiguredGasUrl() {
  const customUrl = localStorage.getItem(CUSTOM_GAS_URL_KEY);
  if (customUrl && customUrl.trim().startsWith('https://script.google.com/')) {
    return customUrl.trim();
  }
  const envUrl = import.meta.env.VITE_GAS_API_URL;
  if (envUrl && envUrl.trim().startsWith('https://script.google.com/')) {
    return envUrl.trim();
  }
  return '';
}

export function setConfiguredGasUrl(url) {
  const clean = String(url || '').trim();
  if (!clean) {
    localStorage.removeItem(CUSTOM_GAS_URL_KEY);
  } else {
    localStorage.setItem(CUSTOM_GAS_URL_KEY, clean);
  }
}

export function isLiveGasMode() {
  return Boolean(getConfiguredGasUrl());
}

export function getSavedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.token || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(sessionData) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Core RPC dispatcher to GAS `doPost(e)` / `doGet(e)`.
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method Logical HTTP verb verified by RBAC
 * @param {string} action Resource action (e.g. 'teachers.list', 'payrolls.updateStatus')
 * @param {object} payload Request parameters/body
 */
export async function gasRequest(method, action, payload = {}) {
  const session = getSavedSession();
  const token = session ? session.token : '';
  const sanitized = sanitizePayload(payload);
  const gasUrl = getConfiguredGasUrl();

  // If no live GAS Web App URL is configured, execute against the RBAC Sandbox Mirror
  if (!gasUrl) {
    const res = await executeSandboxRequest(method, action, token, sanitized);
    if (!res.ok) {
      const err = new Error(res.error || 'Terjadi kesalahan pada permintaan.');
      err.status = res.status || 400;
      throw err;
    }
    return res.data;
  }

  const rpcPayload = {
    method,
    action,
    token,
    payload: sanitized,
  };

  let result;

  if (import.meta.env.DEV) {
    // Route via local Vite server-to-server proxy to bypass browser CORS preflight/cookie 403s
    const proxyRes = await fetch('/__gas_proxy__', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasUrl, rpcPayload }),
    });
    result = await proxyRes.json();
  } else {
    // Direct browser fetch for static production hosting (credentials: 'omit' avoids Google cookie 403)
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(rpcPayload),
        redirect: 'follow',
      });
      result = await response.json();
    } catch {
      // Fallback to GET query payload supported by v2_AuthFix
      const fallbackUrl = `${gasUrl}?payload=${encodeURIComponent(JSON.stringify(rpcPayload))}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow',
      });
      result = await fallbackRes.json();
    }
  }

  if (!result || !result.ok) {
    if (result && result.status === 401) {
      clearSession();
    }
    const err = new Error(
      (result && result.error) || 'Akses ditolak atau gagal menghubungi Google Apps Script.'
    );
    err.status = (result && result.status) || 400;
    throw err;
  }

  return result.data;
}

export const api = {
  get: (action, payload = {}) => gasRequest('GET', action, payload),
  post: (action, payload = {}) => gasRequest('POST', action, payload),
  put: (action, payload = {}) => gasRequest('PUT', action, payload),
  delete: (action, payload = {}) => gasRequest('DELETE', action, payload),
};

export default api;
