import notify from './notify';

/**
 * Global deferred install prompt store so events fired before React mounts are never lost.
 */
let deferredInstallPrompt = null;
const listeners = new Set();

function notifyListeners() {
  const state = getPwaInstallState();
  listeners.forEach((cb) => cb(state));
}

export function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function isIosDevice() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

export function getPwaInstallState() {
  return {
    canPromptInstall: Boolean(deferredInstallPrompt),
    isStandalone: isStandaloneMode(),
    isIos: isIosDevice(),
  };
}

export function subscribePwaInstallState(callback) {
  listeners.add(callback);
  callback(getPwaInstallState());
  return () => {
    listeners.delete(callback);
  };
}

export async function triggerPwaInstallPrompt() {
  if (!deferredInstallPrompt) {
    return { outcome: 'unavailable' };
  }
  deferredInstallPrompt.prompt();
  const choiceResult = await deferredInstallPrompt.userChoice;
  if (choiceResult.outcome === 'accepted') {
    notify.success('SIPAYROLL berhasil di-install ke perangkat Anda!');
    deferredInstallPrompt = null;
    notifyListeners();
  }
  return choiceResult;
}

export function initPwaServiceWorker() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent mini-infobar from appearing automatically on mobile so our custom button works
    e.preventDefault();
    deferredInstallPrompt = e;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notifyListeners();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                notify.info('Pembaruan aplikasi PWA tersedia dan siap digunakan.');
              }
            });
          });
        })
        .catch((err) => {
          console.warn('Registrasi Service Worker gagal:', err);
        });
    });
  }
}
