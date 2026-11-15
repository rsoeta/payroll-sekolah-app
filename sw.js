/**
 * ============================================================================
 * SIPAYROLL PROGRESSIVE WEB APP (PWA) SERVICE WORKER
 * Version: v1_PWA_ServiceWorker
 * ============================================================================
 * DevSecOps Security Policy:
 * - NEVER caches POST/PUT/DELETE requests, `/__gas_proxy__`, or `script.google.com`
 *   endpoints to prevent caching sensitive payroll data or session tokens.
 * - Pre-caches application shell & brand icons for instant startup and offline
 *   resilience (Sandbox 6-Sheet mode continues working 100% offline).
 */

const CACHE_NAME = 'sipayroll-pwa-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/logo.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith('sipayroll-pwa-') && name !== CACHE_NAME)
            .map((oldName) => caches.delete(oldName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1. Only handle GET requests (Never intercept POST/PUT/DELETE RPC mutations)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. DevSecOps Bypass: Never cache Google Apps Script API or proxy requests
  if (
    url.pathname.startsWith('/__gas_proxy__') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com')
  ) {
    return;
  }

  // 3. Vite Dev Server / HMR Bypass (keep hot-reload clean while keeping SW active)
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.search.includes('v=') ||
    url.search.includes('t=')
  ) {
    return;
  }

  // 4. Navigation requests (HTML): Network-First with Offline App-Shell Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          return cachedIndex || caches.match('/');
        })
    );
    return;
  }

  // 5. Static Assets & Google Fonts ('Outfit'): Stale-While-Revalidate
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont =
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isSameOrigin || isGoogleFont) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              (networkResponse.type === 'basic' || networkResponse.type === 'cors')
            ) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});
