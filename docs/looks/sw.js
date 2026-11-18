/* Try Your Tiles (bathrooms, and the hall's living room, terrace and driveway): works with no network once opened (shell + rooms), tile faces after "Save for offline". */
const SHELL = 'drb-shell-v8', FACES = 'drb-faces-v1', FONTS = 'drb-fonts-v1';
const ROOMS = ['r7', 'r3', 'r6', 'l1', 't1', 'p1'];
const FILES = ['./', 'index.html', 'app.js', 'engine.js', 'hall.js', 'designs.json', 'mh.json', 'tones.json', 'manifest.webmanifest', 'd-logo.png', 'logo-white.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  ...ROOMS.flatMap(r => ['room.json', 'base.jpg', 'light.jpg', 'maps.png', 'obj.webp', 'thumb.jpg', 'depth.jpg'].map(f => `rooms/${r}/${f}`))];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('drb-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (name, req, res) => { if (res && (res.ok || res.type === 'opaque')){ const copy = res.clone(); caches.open(name).then(c => c.put(req, copy)); } return res; };
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'static.wixstatic.com'){          // tile faces: keep the first copy for good
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(FACES, req, res))));
  } else if (url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(FONTS, req, res)).catch(() => new Response('', { status: 504 }))));
  } else if (url.origin === location.origin){            // app shell: answer from the saved copy, refresh it quietly
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
