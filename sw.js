// Permite abrir la app sin conexión (por ejemplo, en el gimnasio).
// Los archivos propios se piden primero a la red (así llegan las versiones nuevas) y,
// si no hay conexión o tarda demasiado, se sirven desde la caché.
const CACHE = 'fitness-v20';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/util.js',
  'js/state.js',
  'js/derived.js',
  'js/ui.js',
  'js/food.js',
  'js/training.js',
  'js/progress.js',
  'js/settings.js',
  'js/onboarding.js',
  'js/cardio.js',
  'js/report.js',
  'js/photos.js',
  'js/sync.js',
  'js/account.js',
  'js/admin.js',
  'js/clients.js',
  'js/ficha.js',
  'js/plantillas.js',
  'js/bodymap.js',
  'js/bodydata.js',
  'js/config.js',
  'js/barcode.js',
  'js/exercises.js',
  'js/nutrients.js',
  'js/off.js',
  'js/store.js',
  'js/templates.js',
  'fonts/archivo-var.woff',
  'fonts/atkinson-400.woff',
  'fonts/atkinson-700.woff',
  'fonts/atkinson-400i.woff',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Open Food Facts y demás: siempre a la red
  if (url.pathname.endsWith('/version.json')) return; // siempre fresco

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await withTimeout(fetch(req, { cache: 'no-cache' }), 3000);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
