/* Try Your Tiles (bathrooms, and the hall's kitchens, living room, terrace and driveway): works with no network once opened (shell + rooms), tile faces after "Save for offline". */
const SHELL = 'drb-shell-v16', FACES = 'drb-faces-v1', FONTS = 'drb-fonts-v1';
const ROOMS = ['r7', 'r3', 'r6', 'l1', 't1', 'p1', 'k1', 'k2'];
const FILES = ['./', 'index.html', 'app.js', 'engine.js', 'hall.js', 'assets.js', 'designs.json', 'mh.json', 'tones.json', 'manifest.webmanifest', 'd-logo.png', 'logo-white.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  ...ROOMS.flatMap(r => ['room.json', 'base.jpg', 'light.jpg', 'maps.png', 'obj.webp', 'thumb.jpg', 'depth.jpg'].map(f => `rooms/${r}/${f}`))];

// One file at a time, never a burst: the drambay.com host refuses requests when too many arrive together.
// The tool's own files must all arrive (three tries each); a picture that fails is picked up later, the first time it is shown.
const pause = (ms) => new Promise(r => setTimeout(r, ms));
async function keep(c, f){
  const far = /^https:/.test(f);
  for (let i = 0; i < 3; i++){
    try { const r = await fetch(new Request(f, far ? {} : { cache: 'reload' })); if (r.ok){ await c.put(f, r); return; } } catch (e) {}
    await pause(1500 * (i + 1));
  }
  if (!far) throw new Error('could not save ' + f);
}
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then(async c => { for (const f of FILES) await keep(c, f); }).then(() => self.skipWaiting())); });
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
  } else if (url.origin === location.origin){
    // The tool's own page, scripts and lists: fresh from the network first, so a visitor who comes back after a release sees the new version at once.
    // The saved copy answers only when the network does not (offline, or no answer within 4 seconds). Pictures: the saved copy first, refreshed quietly.
    const code = req.mode === 'navigate' || /(\/|\.(js|json|html|webmanifest))$/.test(url.pathname);
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
      const net = fetch(req, code ? { cache: 'no-cache' } : {}).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
      if (!hit) return net;
      if (!code) { net.catch(() => {}); return hit; }
      return Promise.race([net.catch(() => hit), new Promise(r => setTimeout(() => r(hit), 4000))]);
    }));
  }
});
