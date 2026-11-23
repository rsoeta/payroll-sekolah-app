const THEME_STORAGE_KEY = 'sipayroll:theme';
const RAIL_STORAGE_KEY = 'sipayroll:rail';

export const DAY_START_HOUR = 6; // 06:00 - 17:59 -> Mode Terang
export const NIGHT_START_HOUR = 18; // 18:00 - 05:59 -> Mode Gelap

const themeListeners = new Set();
const railListeners = new Set();

export function getTimeBasedTheme(date = new Date()) {
  const hour = date.getHours();
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? 'light' : 'dark';
}

export function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') {
    return pref;
  }
  if (pref === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return getTimeBasedTheme();
  }
  return getTimeBasedTheme();
}

export function getThemePreference() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return 'auto';
    const parsed = raw.startsWith('"') ? JSON.parse(raw) : raw;
    if (parsed === 'auto' || parsed === 'light' || parsed === 'dark' || parsed === 'system') {
      return parsed;
    }
  } catch {
    // Fallback to time-based auto theme
  }
  return 'auto';
}

function syncResolvedThemeToDom(resolved) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', resolved === 'dark' ? '#050a18' : '#e9eef8');
  }
}

export function applyTheme(pref) {
  const nextPref = pref === 'light' || pref === 'dark' || pref === 'system' ? pref : 'auto';
  const resolved = resolveTheme(nextPref);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextPref));
  } catch {
    // Ignore storage quota errors
  }

  syncResolvedThemeToDom(resolved);
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

function refreshAutoThemeIfNeeded() {
  if (getThemePreference() !== 'auto' || typeof document === 'undefined') return;
  const resolved = getTimeBasedTheme();
  if (document.documentElement.dataset.theme !== resolved) {
    syncResolvedThemeToDom(resolved);
    themeListeners.forEach((fn) => fn('auto', resolved));
  }
}

if (typeof window !== 'undefined') {
  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = () => {
      if (getThemePreference() === 'system') {
        const resolved = resolveTheme('system');
        syncResolvedThemeToDom(resolved);
        themeListeners.forEach((fn) => fn('system', resolved));
      }
    };
    if (media.addEventListener) {
      media.addEventListener('change', onSystemThemeChange);
    }
  }

  const initialResolved = resolveTheme(getThemePreference());
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme !== initialResolved) {
    syncResolvedThemeToDom(initialResolved);
  }

  window.setInterval(refreshAutoThemeIfNeeded, 60000);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshAutoThemeIfNeeded();
      }
    });
  }
}
