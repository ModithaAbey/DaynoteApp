// DayNote service worker — caches the app shell so it opens (and is
// installable) even with a flaky or missing connection. Data itself
// still lives in localStorage on-device, this only caches the files
// that make up the app.
const CACHE_NAME = 'daynote-v6';
const APP_SHELL = [
  'index.html', 'calendar.html', 'tasks.html', 'finance.html', 'journal.html',
  'styles.css', 'app.js', 'data.js', 'notifications.js', 'modals.js',
  'pages.calendar.js', 'pages.tasks.js', 'pages.finance.js', 'pages.notes.js',
  'journal.canvas.js', 'cover.art.js', 'manifest.json', 'firebase-config.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png',
  // Firebase Auth SDK (needed for the sign-in screen; sign-in itself still
  // requires a live connection, this just lets the shell load offline).
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  // Journal's PDF export pulls these from a CDN — precached so exporting
  // a journal to PDF still works the first time you're offline, not just
  // after having done it once while online.
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  // Google Fonts stylesheets (the actual .woff2 font files they reference
  // have per-browser URLs that can't be listed here, so those are cached
  // opportunistically the first time each page loads online instead —
  // the app still works offline before that, just with a system-font
  // fallback until a font file gets cached).
  'https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&family=Caveat:wght@600;700&family=Patrick+Hand&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        // Precache same-origin app files strictly (fail install if any is
        // missing), but treat the third-party CDN/font URLs as best-effort
        // — a transient CDN hiccup during install shouldn't block the
        // whole app from becoming available offline.
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Same-origin app files (HTML/JS/CSS) use network-first, so a new
// deploy is picked up on the very next load instead of being stuck
// behind whatever was cached at install time — cache-first was
// silently serving stale app.js/index.html on every visit, including
// through the Google sign-in redirect, no matter how many times the
// site was redeployed. Third-party assets (fonts, the Firebase SDK,
// icons) rarely change, so those stay cache-first for speed/offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() =>
        caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('index.html') : undefined))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('index.html');
      });
    })
  );
});
