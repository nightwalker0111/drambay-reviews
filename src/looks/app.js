import { Engine } from './engine.js';

const ROOMS = ['r7', 'r3', 'r6'];
const WA = '919501034545';
const Q = new URLSearchParams(location.search);
const LOCAL = Q.has('local');
const $ = (id) => document.getElementById(id);
const SLOTS = [['floor', 'Floor'], ['wall', 'Walls'], ['feature', 'Feature wall']];
const DEFAULTS = { floor: 'DRB-6012-053', wall: 'DRB-6012-003', feature: 'DRB-6012-012' };
const FIN = { polished: 'Glossy', mirror: 'High Gloss', natural: 'Matt', textured: 'Textured' };

let designs = [], MH = {}, eng, rooms = [], cards = [], state = {}, open = null, pickSlot = null, sizeF = 'all', dirty = false, raf = 0, token = 0;

const face = (n, w) => LOCAL ? `tiles/${n}.jpg`
  : `https://static.wixstatic.com/media/da1752_${MH[n]}~mv2.jpg/v1/fit/w_${w},h_${w},q_${w > 400 ? 88 : 80},enc_jpg/da1752_${MH[n]}~mv2.jpg`;
const full = (n) => face(n, 1536), thumb = (n) => face(n, 320);
const byCode = (c) => designs.find(d => d.code === c);
const label = (d) => `${d.size[0]} x ${d.size[1]} mm, ${FIN[d.finish] || d.finishEn || ''}`.replace(/, $/, '');
const fits = (d, slot) => d.faces && d.faces.length && MH_ok(d) && (d.app === 'A' || (slot === 'floor' && d.app === 'T'));
const MH_ok = (d) => LOCAL || !!MH[d.faces[0]];

function toast(t){ const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }

function save(){ try { localStorage.setItem('drb-looks', JSON.stringify(state)); } catch (e) {} }
function load(){
  let s = {}; try { s = JSON.parse(localStorage.getItem('drb-looks') || '{}'); } catch (e) {}
  for (const [k] of SLOTS){ const c = Q.get(k) || s[k]; state[k] = byCode(c) && fits(byCode(c), k) ? c : DEFAULTS[k]; }
}

function drawPicks(){
  for (const host of [$('picks'), $('vpicks')]){
    host.innerHTML = '';
    for (const [k, name] of SLOTS){
      const d = byCode(state[k]); const b = document.createElement('button'); b.className = 'slot'; b.type = 'button';
      b.innerHTML = `<i class="sw"></i><span><small>${name}</small><b></b></span>`;
      b.querySelector('.sw').style.backgroundImage = `url("${thumb(d.faces[0])}")`; b.querySelector('b').textContent = d.name;
      b.setAttribute('aria-label', `${name}: ${d.name}. Change`);
      b.onclick = () => openPicker(k); host.appendChild(b);
    }
  }
}

async function sets(){
  const [floor, wall, feature] = await Promise.all(['floor', 'wall', 'feature'].map(k => eng.loadSet(byCode(state[k]), full)));
  return { floor, wall, feature };
}

async function renderGrid(){
  const my = ++token; dirty = false;
  let S; try { S = await sets(); } catch (e) { toast('That tile is not saved on this device yet. Connect once to load it.'); return; }
  for (const c of cards){
    if (my !== token || open) { dirty = true; return; }
    const room = await c.room; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.min(room.j.W, Math.round(c.cv.clientWidth * dpr) || 640), h = Math.round(w * room.j.H / room.j.W);
    const out = eng.render(room, S, { width: w, grain: .008 });
    if (c.cv.width !== w || c.cv.height !== h){ c.cv.width = w; c.cv.height = h; }
    c.cv.getContext('2d').drawImage(out, 0, 0, w, h); c.el.classList.add('ready');
    await new Promise(r => requestAnimationFrame(r));
  }
}

function buildGrid(){
  const g = $('grid');
  cards = ROOMS.map((id, i) => {
    const el = document.createElement('button'); el.className = 'card'; el.type = 'button';
    el.innerHTML = `<span class="ph"><canvas width="16" height="9"></canvas><img alt="" src="rooms/${id}/thumb.jpg"></span><span class="nm"></span>`;
    g.appendChild(el);
    const c = { id, el, cv: el.querySelector('canvas'), room: eng.loadRoom(`rooms/${id}/`) };
    c.room.then(r => { c.cv.width = r.j.W / 4; c.cv.height = r.j.H / 4; el.querySelector('.nm').textContent = r.j.name; el.setAttribute('aria-label', `${r.j.name}. Enlarge`); });
    el.onclick = () => openViewer(c);
    return c;
  });
}

/* ---------- enlarged view ---------- */
async function drawViewer(t){
  if (!open) return;
  const room = await open.room; let S; try { S = await sets(); } catch (e) { toast('That tile is not saved on this device yet.'); return; }
  if (!open) return;
  const st = $('stage'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const fit = Math.min((st.clientWidth - 20) / room.j.W, (st.clientHeight - 20) / room.j.H);
  const w = Math.min(room.j.W, Math.max(320, Math.round(room.j.W * fit * dpr)));
  const cv = eng.render(room, S, { width: w, live: open.live, time: t || 0 });
  cv.style.width = Math.round(room.j.W * fit) + 'px'; cv.style.height = Math.round(room.j.H * fit) + 'px';
}
function loop(){
  cancelAnimationFrame(raf);
  if (!open || !open.live) return;
  const t0 = performance.now(); let last = 0;
  const step = (now) => { if (!open) return; if (now - last > 40){ last = now; drawViewer((now - t0) / 1000); } raf = requestAnimationFrame(step); };
  raf = requestAnimationFrame(step);
}
async function openViewer(c){
  const room = await c.room; const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  open = { ...c, live: !still && room.j.live && Object.keys(room.j.live).length > 0 };
  $('stage').appendChild(eng.canvas); $('viewer').classList.add('on'); document.body.style.overflow = 'hidden';
  await drawViewer(0); loop(); history.pushState({ v: 1 }, '');
}
function closeViewer(pop){
  if (!open) return; open = null; cancelAnimationFrame(raf);
  $('viewer').classList.remove('on'); document.body.style.overflow = '';
  if (!pop && history.state && history.state.v) history.back();
  renderGrid();
}

async function picture(){
  const room = await open.room, S = await sets();
  const src = eng.render(room, S, { width: room.j.W, live: false, grain: .01 });
  const W = src.width, band = Math.round(Math.max(96, W * .06)), H = src.height + band;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#F5F2EC'; x.fillRect(0, 0, W, H); x.drawImage(src, 0, 0);
  const logo = document.querySelector('header.top img'); const lh = band * .5, lw = lh * logo.naturalWidth / logo.naturalHeight, pad = band * .28;
  x.drawImage(logo, pad, src.height + (band - lh) / 2, lw, lh);
  x.fillStyle = '#343A3B'; x.textBaseline = 'middle'; x.font = `500 ${Math.round(band * .24)}px "Hanken Grotesk", system-ui, sans-serif`;
  const line = SLOTS.map(([k, n]) => `${n}: ${byCode(state[k]).name}`).join('   ·   ');
  x.fillText(line, pad * 2 + lw, src.height + band * .4, W - pad * 3 - lw);
  x.fillStyle = '#6F7574'; x.font = `400 ${Math.round(band * .19)}px "Hanken Grotesk", system-ui, sans-serif`;
  x.fillText('Design visualisation  ·  drambay.com', pad * 2 + lw, src.height + band * .72, W - pad * 3 - lw);
  drawViewer(0); loop();
  return new Promise(r => c.toBlob(r, 'image/jpeg', .92));
}
const words = () => SLOTS.map(([k, n]) => { const d = byCode(state[k]); return `${n}: ${d.name} (${d.code})`; }).join('\n');
async function share(){
  const b = $('share'); b.disabled = true;
  try {
    const blob = await picture(); const file = new File([blob], 'drambay-bathroom-look.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: 'Drambay bathroom look\n' + words() });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Picture saved. Attach it in WhatsApp.'); }
  } catch (e) { if (e.name !== 'AbortError') toast('Could not share the picture.'); }
  b.disabled = false;
}
function ask(){
  const room = cards.find(c => open && c.id === open.id);
  const t = `Hi Drambay, I liked this bathroom look in Rooms Studio.\n${words()}\nPlease share details.`;
  window.open(`https://wa.me/${WA}?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
}

/* ---------- tile picker ---------- */
function openPicker(slot){
  pickSlot = slot; sizeF = 'all'; $('q').value = '';
  $('sheetTitle').textContent = { floor: 'Floor tile', wall: 'Wall tile', feature: 'Feature wall tile' }[slot];
  const sizes = [...new Set(designs.filter(d => fits(d, slot)).map(d => d.size.join(' x ')))];
  $('sizes').innerHTML = ''; ['all', ...sizes].forEach(s => { const b = document.createElement('button'); b.textContent = s === 'all' ? 'All sizes' : s; b.setAttribute('aria-pressed', s === sizeF); b.onclick = () => { sizeF = s; [...$('sizes').children].forEach(x => x.setAttribute('aria-pressed', x === b)); drawList(); }; $('sizes').appendChild(b); });
  drawList(); $('sheet').classList.add('on');
}
function drawList(){
  const q = $('q').value.trim().toLowerCase(), L = $('list'); L.innerHTML = '';
  const fr = document.createDocumentFragment();
  designs.filter(d => fits(d, pickSlot) && (sizeF === 'all' || d.size.join(' x ') === sizeF) && (!q || d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)))
    .forEach(d => {
      const b = document.createElement('button'); b.className = 'tile' + (d.size[0] === d.size[1] ? ' sq' : ''); b.type = 'button';
      b.innerHTML = '<i></i><b></b><small></small>'; b.querySelector('b').textContent = d.name; b.querySelector('small').textContent = label(d);
      b.querySelector('i').style.backgroundImage = `url("${thumb(d.faces[0])}")`;
      if (state[pickSlot] === d.code) b.setAttribute('aria-current', 'true');
      b.onclick = () => choose(d.code); fr.appendChild(b);
    });
  L.appendChild(fr);
}
function choose(code){
  state[pickSlot] = code; save(); drawPicks(); $('sheet').classList.remove('on');
  if (open) { dirty = true; drawViewer(0); } else renderGrid();
}

/* ---------- offline + install ---------- */
async function saveOffline(){
  const b = $('offline'); if (!('caches' in window)) { toast('This browser cannot save for offline.'); return; }
  b.disabled = true;
  const urls = new Set();
  designs.filter(d => fits(d, 'floor')).forEach(d => { urls.add(thumb(d.faces[0])); d.faces.slice(0, 4).forEach(f => MH[f] && urls.add(full(f))); });
  const list = [...urls], cache = await caches.open('drb-faces-v1'); let done = 0, bad = 0;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const work = async () => { while (list.length){ const u = list.pop(); try { if (!(await cache.match(u))){ const r = await fetch(u, { mode: 'cors' }); if (r.ok) await cache.put(u, r); else bad++; } } catch (e) { bad++; } done++; b.textContent = `Saving ${Math.round(done / urls.size * 100)}%`; } };
  await Promise.all([work(), work(), work(), work()]);
  b.disabled = false;
  if (bad){ b.textContent = 'Save for offline'; toast(`${bad} pictures could not be saved. Try again on Wi-Fi.`); }
  else { b.textContent = 'Saved for offline'; b.classList.add('done'); try { localStorage.setItem('drb-offline', '1'); } catch (e) {} }
}
let deferred = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('install').hidden = false; });
$('install').onclick = async () => {
  if (deferred){ deferred.prompt(); await deferred.userChoice; deferred = null; $('install').hidden = true; }
  else toast('Tap Share, then Add to Home Screen.');
};
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (ios && !navigator.standalone) $('install').hidden = false;

/* ---------- start ---------- */
async function start(){
  [designs, MH] = await Promise.all([fetch('designs.json').then(r => r.json()), fetch('mh.json').then(r => r.json())]);
  try { eng = new Engine(); } catch (e) { $('grid').innerHTML = '<p class="note">This device cannot draw the live rooms. Please open it in a current browser.</p>'; return; }
  load(); drawPicks(); buildGrid(); await renderGrid();
  if (localStorage.getItem('drb-offline')){ $('offline').textContent = 'Saved for offline'; $('offline').classList.add('done'); }
  if (Q.get('open')) { const c = cards.find(c => c.id === Q.get('open')); if (c) openViewer(c); }
}
$('close').onclick = () => closeViewer(); addEventListener('popstate', () => closeViewer(true));
$('share').onclick = share; $('ask').onclick = ask; $('offline').onclick = saveOffline;
$('swap').onclick = () => { [state.wall, state.feature] = [state.feature, state.wall]; save(); drawPicks(); dirty = true; drawViewer(0); };
$('sheetClose').onclick = () => $('sheet').classList.remove('on');
$('sheet').onclick = (e) => { if (e.target === $('sheet')) $('sheet').classList.remove('on'); };
$('q').oninput = drawList;
addEventListener('keydown', (e) => { if (e.key === 'Escape'){ if ($('sheet').classList.contains('on')) $('sheet').classList.remove('on'); else closeViewer(); } });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => open ? drawViewer(0) : renderGrid(), 200); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__looks = { ready: start() };
// test hook: one frame of a room at a given time, as a JPEG data URL
window.__looks.frame = async (id, t, w, live = true) => { const c = cards.find(c => c.id === id); return eng.render(await c.room, await sets(), { width: w, live, time: t }).toDataURL('image/jpeg', .9); };
