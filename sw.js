/* ============================================================
   NetQuest · service worker (app shell offline)
   Si modificas archivos de la app (app.js, styles.css, index.html)
   sube CACHE a 'netquest-v2', 'netquest-v3'... para que los
   dispositivos con la app instalada descarguen los cambios.
   ============================================================ */
const CACHE = 'netquest-v2';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  // navegación (abrir la app): siempre el shell cacheado, con red como respaldo
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html')
        .then(hit => hit || fetch(req))
        .catch(() => fetch(req))
    );
    return;
  }

  // caché primero (respuesta inmediata) + revalidación en segundo plano,
  // así los cambios de código se aplican solos en la siguiente recarga
  e.respondWith(
    caches.match(req).then(hit => {
      const refresh = fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || refresh;
    })
  );
});
