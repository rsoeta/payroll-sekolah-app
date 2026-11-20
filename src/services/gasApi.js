import { sanitizePayload } from '../utils/formatters';
import { executeSandboxRequest } from './sandboxDb';

/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (GAS) FETCH API HELPER
 * Target Backend Version: v17_RealtimeSyncAndBatchOptim
 * ============================================================================
 * - In local Vite development (`import.meta.env.DEV`), routes requests through
 *   the built-in `/__gas_proxy__` middleware so browser CORS & multi-account
 *   cookie conflicts never block requests.
 * - In static production builds, uses `credentials: 'omit'` + `text/plain;charset=utf-8`
 *   with automatic GET `?payload=` fallback.
 * - Includes in-flight GET deduplication, concurrency throttling (max 3 live),
 *   gentle retry on 423 Resource Locked / GAS simultaneous execution limits,
 *   and endpoint capability cache for backward compatibility with older GAS versions.
 */

const SESSION_STORAGE_KEY = 'sipayroll_auth_session';
const CUSTOM_GAS_URL_KEY = 'sipayroll_custom_gas_url';
const MAX_CONCURRENT_LIVE = 3;

const inFlightGetMap = new Map();
const unsupportedActions = new Set();
const liveQueue = [];
let activeLiveRequests = 0;

export function isActionUnsupported(action) {
  return unsupportedActions.has(action);
}

export function markActionUnsupported(action) {
  if (action) unsupportedActions.add(action);
}

export function clearUnsupportedActions() {
  unsupportedActions.clear();
}

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
  clearUnsupportedActions();
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pumpLiveQueue() {
  while (activeLiveRequests < MAX_CONCURRENT_LIVE && liveQueue.length > 0) {
    const item = liveQueue.shift();
    activeLiveRequests++;
    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        activeLiveRequests = Math.max(0, activeLiveRequests - 1);
        pumpLiveQueue();
      });
  }
}

function enqueueLiveTask(task) {
  return new Promise((resolve, reject) => {
    liveQueue.push({ task, resolve, reject });
    pumpLiveQueue();
  });
}

function isRetryableGasResponse(result) {
  if (!result || result.ok) return false;
  if (Number(result.status) === 423) return true;
  const msg = String(result.error || '');
  return /Terlalu banyak penjalanan skrip simultan|Too many simultaneous|Service invoked too many times|Resource Locked/i.test(
    msg
  );
}

async function performRawGasFetch(gasUrl, rpcPayload) {
  if (import.meta.env.DEV) {
    const proxyRes = await fetch('/__gas_proxy__', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasUrl, rpcPayload }),
    });
    return proxyRes.json();
  }

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
    return response.json();
  } catch {
    const fallbackUrl = `${gasUrl}?payload=${encodeURIComponent(JSON.stringify(rpcPayload))}`;
    const fallbackRes = await fetch(fallbackUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
    });
    return fallbackRes.json();
  }
}

async function executeLiveRpcWithRetry(gasUrl, method, rpcPayload) {
  const retryDelays = [450, 1100];
  let lastError = null;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      const result = await enqueueLiveTask(() => performRawGasFetch(gasUrl, rpcPayload));
      if (isRetryableGasResponse(result) && attempt < retryDelays.length) {
        await sleep(retryDelays[attempt] + Math.round(Math.random() * 300));
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      if (method === 'GET' && attempt < retryDelays.length) {
        await sleep(retryDelays[attempt] + Math.round(Math.random() * 300));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Gagal menghubungi server Google Apps Script.');
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

  const runRpc = async () => {
    const result = await executeLiveRpcWithRetry(gasUrl, method, rpcPayload);
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
  };

  if (method === 'GET') {
    const dedupeKey = `${gasUrl}|${token}|${action}|${JSON.stringify(sanitized)}`;
    const existingPromise = inFlightGetMap.get(dedupeKey);
    if (existingPromise) {
      return existingPromise;
    }
    const nextPromise = runRpc().finally(() => {
      inFlightGetMap.delete(dedupeKey);
    });
    inFlightGetMap.set(dedupeKey, nextPromise);
    return nextPromise;
  }

  return runRpc();
}

export const api = {
  get: (action, payload = {}) => gasRequest('GET', action, payload),
  post: (action, payload = {}) => gasRequest('POST', action, payload),
  put: (action, payload = {}) => gasRequest('PUT', action, payload),
  delete: (action, payload = {}) => gasRequest('DELETE', action, payload),
};

export default api;
