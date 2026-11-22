const CUSTOM_GOOGLE_CLIENT_ID_KEY = 'sipayroll_custom_google_client_id_v1';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let gisLoadPromise = null;

export function getLocalGoogleClientId() {
  if (typeof window === 'undefined') return '';
  try {
    return String(localStorage.getItem(CUSTOM_GOOGLE_CLIENT_ID_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setLocalGoogleClientId(clientId) {
  if (typeof window === 'undefined') return '';
  const clean = String(clientId || '').trim();
  try {
    if (!clean) {
      localStorage.removeItem(CUSTOM_GOOGLE_CLIENT_ID_KEY);
    } else {
      localStorage.setItem(CUSTOM_GOOGLE_CLIENT_ID_KEY, clean);
    }
  } catch {
    // Ignore storage errors
  }
  return clean;
}

export function isValidGoogleClientId(clientId) {
  const clean = String(clientId || '').trim();
  return clean.length > 20 && clean.endsWith('.apps.googleusercontent.com') && !clean.includes(' ');
}

export function resolveGoogleClientId(schoolProfile) {
  const fromProfile = String(schoolProfile?.google_client_id || '').trim();
  if (fromProfile) return fromProfile;

  const fromEnv = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  if (fromEnv && !fromEnv.startsWith('GANTI_DENGAN_')) return fromEnv;

  return getLocalGoogleClientId();
}

function isGisReady() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.google &&
      window.google.accounts &&
      window.google.accounts.id &&
      window.google.accounts.oauth2
  );
}

export function loadGoogleIdentityScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Identity Services hanya berjalan di browser.'));
  }

  if (isGisReady()) {
    return Promise.resolve(window.google);
  }

  if (gisLoadPromise) {
    return gisLoadPromise;
  }

  gisLoadPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finishOk = () => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      resolve(window.google);
    };
    const finishErr = (msg) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      gisLoadPromise = null;
      reject(new Error(msg));
    };

    const existingScript = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onerror = () =>
        finishErr('Gagal memuat Google Sign-In. Periksa koneksi internet Anda atau matikan pemblokir skrip.');
      document.head.appendChild(script);
    } else {
      existingScript.addEventListener(
        'error',
        () =>
          finishErr('Gagal memuat Google Sign-In. Periksa koneksi internet Anda atau matikan pemblokir skrip.'),
        { once: true }
      );
    }

    const pollTimer = setInterval(() => {
      if (isGisReady()) {
        finishOk();
      }
    }, 80);

    const timeoutTimer = setTimeout(() => {
      if (isGisReady()) {
        finishOk();
      } else {
        finishErr('Layanan Google OAuth gagal dimuat tepat waktu. Muat ulang halaman dan coba lagi.');
      }
    }, 12000);
  });

  return gisLoadPromise;
}

export async function requestGoogleAccessToken(clientId, loginHint = '') {
  const cleanClientId = String(clientId || '').trim();
  if (!cleanClientId) {
    throw new Error('Google OAuth Client ID belum dikonfigurasi.');
  }

  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    let settled = false;
    const config = {
      client_id: cleanClientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (tokenResponse) => {
        if (settled) return;
        settled = true;
        if (tokenResponse && tokenResponse.error) {
          reject(
            new Error(
              tokenResponse.error_description ||
                tokenResponse.error ||
                'Otorisasi Akun Google ditolak atau dibatalkan.'
            )
          );
          return;
        }
        if (tokenResponse && tokenResponse.access_token) {
          resolve(tokenResponse.access_token);
        } else {
          reject(new Error('Token akses Google tidak diterima. Silakan coba lagi.'));
        }
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        if (err && err.type === 'popup_closed') {
          reject(new Error('Popup login Google ditutup sebelum selesai.'));
          return;
        }
        if (err && err.type === 'popup_failed_to_open') {
          reject(new Error('Popup login Google diblokir browser. Izinkan popup lalu coba lagi.'));
          return;
        }
        reject(new Error((err && err.message) || 'Gagal membuka jendela login Google OAuth.'));
      },
    };

    const cleanHint = String(loginHint || '').trim();
    if (cleanHint) {
      config.hint = cleanHint;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient(config);
    tokenClient.requestAccessToken({
      prompt: 'select_account',
      ...(cleanHint ? { hint: cleanHint } : {}),
    });
  });
}

export function disableGoogleAutoSelect() {
  try {
    if (typeof window !== 'undefined' && window.google?.accounts?.id?.disableAutoSelect) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch {
    // Ignore errors when GIS script has not finished loading
  }
}
