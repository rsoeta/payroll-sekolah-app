const THEME_STORAGE_KEY = 'sipayroll:theme';
const RAIL_STORAGE_KEY = 'sipayroll:rail';

const themeListeners = new Set();
const railListeners = new Set();

export function resolveTheme(pref) {
  if (pref === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return pref === 'light' ? 'light' : 'dark';
}

export function getThemePreference() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return 'dark';
    const parsed = raw.startsWith('"') ? JSON.parse(raw) : raw;
    if (parsed === 'light' || parsed === 'dark' || parsed === 'system') {
      return parsed;
    }
  } catch {
    // Fallback to dark theme
  }
  return 'dark';
}

export function applyTheme(pref) {
  const nextPref = pref === 'light' || pref === 'system' ? pref : 'dark';
  const resolved = resolveTheme(nextPref);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextPref));
  } catch {
    // Ignore storage quota errors
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', resolved === 'dark' ? '#050a18' : '#e9eef8');
    }
  }

  themeListeners.forEach((fn) => fn(nextPref, resolved));
  return resolved;
}

export function subscribeTheme(listener) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

export function getRailPreference() {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function applyRail(collapsed) {
  const next = Boolean(collapsed);
  try {
    localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0');
  } catch {
    // Ignore storage errors
  }

  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('is-rail', next && window.innerWidth > 760);
  }

  railListeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeRail(listener) {
  railListeners.add(listener);
  return () => railListeners.delete(listener);
}

if (typeof window !== 'undefined' && window.matchMedia) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemThemeChange = () => {
    if (getThemePreference() === 'system') {
      applyTheme('system');
    }
  };
  if (media.addEventListener) {
    media.addEventListener('change', onSystemThemeChange);
  }
}
