import { Engine } from './engine.js';

const ROOMS = ['r7', 'r3', 'r6'];
const WA = '919501034545';
const Q = new URLSearchParams(location.search);
const LOCAL = Q.has('local');
const $ = (id) => document.getElementById(id);
const SLOTS = [['floor', 'Floor'], ['wall', 'Walls'], ['feature', 'Feature wall']];
const DEFAULTS = { floor: 'DRB-6012-053', wall: 'DRB-6012-003', feature: 'DRB-6012-012' };
const FIN = { polished: 'Glossy', mirror: 'High Gloss', natural: 'Matt', textured: 'Textured' };
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;
const QLOCK = Q.has('q');                      // test switch: never lower the moving picture's sharpness
const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

let designs = [], MH = {}, TONE = {}, eng, cards = [], state = {}, open = null, pickSlot = null, sizeF = 'all', finF = 'all', dirty = false, raf = 0, token = 0;

const face = (n, w) => LOCAL ? `tiles/${n}.jpg`
  : `https://static.wixstatic.com/media/da1752_${MH[n]}~mv2.jpg/v1/fit/w_${w},h_${w},q_${w > 400 ? 88 : 80},enc_jpg/da1752_${MH[n]}~mv2.jpg`;
const full = (n) => face(n, 1536), thumb = (n) => face(n, 320);
const byCode = (c) => designs.find(d => d.code === c);
const sizeOf = (d) => d.size.join(' x ');
const finCat = (d) => (d.finish === 'polished' || d.finish === 'mirror') ? 'Glossy' : 'Matt';
const label = (d) => `${d.size[0]} x ${d.size[1]} mm, ${FIN[d.finish] || d.finishEn || ''}`.replace(/, $/, '');
const MH_ok = (d) => LOCAL || !!MH[d.faces[0]];
const fits = (d, slot) => d.faces && d.faces.length && MH_ok(d) && (d.app === 'A' || (slot === 'floor' && d.app === 'T'));

function toast(t){ const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200); }

function save(){ store.set('drb-looks', JSON.stringify(state)); }
function load(){
  let s = {}; try { s = JSON.parse(store.get('drb-looks') || '{}'); } catch (e) {}
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
function changed(){ save(); drawPicks(); if (open) { dirty = true; drawViewer(); } else renderGrid(); }

async function sets(){
  const [floor, wall, feature] = await Promise.all(['floor', 'wall', 'feature'].map(k => eng.loadSet(byCode(state[k]), full)));
  return { floor, wall, feature };
}

/* ---------- all bathrooms ---------- */
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
// cards go into plain columns, each new card under the shortest one (no CSS columns: Safari splits cards across them)
let colsN = 0;
function layoutGrid(force){
  const g = $('grid'), w = g.clientWidth, n = w >= 1500 ? 3 : (w >= 620 ? 2 : 1);
  if (n === colsN && !force) return; colsN = n;
  const cols = Array.from({ length: n }, () => { const d = document.createElement('div'); d.className = 'col'; return d; }), hs = cols.map(() => 0);
  for (const c of cards){ let k = 0; hs.forEach((v, i) => { if (v < hs[k] - 1e-6) k = i; }); cols[k].appendChild(c.el); hs[k] += (c.ar || .7) + .08; }
  g.replaceChildren(...cols);
}
async function buildGrid(){
  cards = ROOMS.map((id) => {
    const el = document.createElement('button'); el.className = 'card'; el.type = 'button';
    el.innerHTML = `<span class="ph"><canvas width="16" height="9"></canvas><img alt="" src="rooms/${id}/thumb.jpg"></span><span class="nm"></span>`;
    const c = { id, el, cv: el.querySelector('canvas'), room: eng.loadRoom(`rooms/${id}/`) };
    c.room.then(r => { c.ar = r.j.H / r.j.W; c.cv.width = r.j.W / 4; c.cv.height = r.j.H / 4; el.querySelector('.nm').textContent = r.j.name; el.setAttribute('aria-label', `${r.j.name}. Open full screen`); });
    el.onclick = () => openViewer(c);
    return c;
  });
  await Promise.all(cards.map(c => c.room)); layoutGrid(true);
}

/* ---------- full-screen view ---------- */
const par = { x: 0, y: 0 }, tilt = { on: false, base: null, v: [0, 0], at: 0 }, mouse = { v: [0, 0], at: 0 }, fx = { dx: 0, op: 1 };
let q = 1, busy = false, drag = null, going = false;
const liveOf = (room) => !STILL && !!room.j.live && Object.keys(room.j.live).length > 0;

function placeFrame(){ const f = $('frame'); f.style.transform = `translate(calc(-50% + ${fx.dx}px), calc(-50% + ${open ? open.oy : 0}px))`; f.style.opacity = fx.op; }
function setFrame(dx, op){ fx.dx = dx; fx.op = op; placeFrame(); }
// fill the screen, but never crop away more than about a fifth of the room
function fitOf(room){
  const st = $('stage'), a = st.clientWidth / room.j.W, b = st.clientHeight / room.j.H;
  return Math.min(Math.max(a, b), Math.min(a, b) / .78);
}
async function drawViewer(t, sharp){
  if (!open) return; const me = open;
  const room = await me.room; let S; try { S = await sets(); } catch (e) { toast('That tile is not saved on this device yet.'); return; }
  if (open !== me) return;
  const fit = fitOf(room), dpr = Math.min(2, window.devicePixelRatio || 1) * (sharp || STILL ? 1 : q);
  const w = Math.min(room.j.W, Math.max(320, Math.round(room.j.W * fit * dpr)));
  const cv = eng.render(room, S, { width: w, live: me.live, time: t === undefined ? me.t : t, par: STILL ? null : [par.x, par.y] });
  if (t !== undefined) me.t = t;
  const cw = Math.round(room.j.W * fit), ch = Math.round(room.j.H * fit);
  if (cv.style.width !== cw + 'px' || cv.style.height !== ch + 'px'){ cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; }
  me.oy = -Math.max(0, ch - $('stage').clientHeight) * .3;       // taller than the screen: keep more floor than ceiling
  placeFrame();
}
function loop(){
  cancelAnimationFrame(raf); if (!open || STILL) return;
  const t0 = performance.now(); let last = t0, acc = 0, n = 0;
  const step = (now) => {
    if (!open) return; raf = requestAnimationFrame(step);
    if (busy || now - last < 33) return;
    const dt = now - last; last = now; const t = (now - t0) / 1000;
    acc += dt; if (++n === 24){ if (!QLOCK && acc / n > 62 && q > .5) q = Math.max(.5, q - .17); acc = 0; n = 0; }   // slow device: draw the moving picture a little smaller
    let tx = Math.sin(t * .33) * .42, ty = Math.sin(t * .21 + 1.3) * .3;                                             // nobody touching: a slow drift
    if (tilt.on && now - tilt.at < 1500){ tx = tx * .2 + tilt.v[0]; ty = ty * .2 + tilt.v[1]; }
    else if (now - mouse.at < 2500){ tx = mouse.v[0]; ty = mouse.v[1]; }
    if (drag && drag.go) tx -= drag.dx / window.innerWidth * 1.6;
    par.x += (clamp(tx) - par.x) * .1; par.y += (clamp(ty) - par.y) * .1;
    busy = true; drawViewer(t).finally(() => { busy = false; });
  };
  raf = requestAnimationFrame(step);
}
async function show(i){
  const c = cards[(i % cards.length + cards.length) % cards.length], room = await c.room;
  open = { ...c, i: cards.indexOf(c), live: liveOf(room), oy: 0, t: 0 };
  $('vname').textContent = room.j.name; $('vcount').textContent = `${open.i + 1} / ${cards.length}`;
  $('vbg').style.backgroundImage = `url("rooms/${c.id}/thumb.jpg")`;
  await drawViewer(0);
}
async function openViewer(c){
  if (needAsk && !tilt.on && store.get('drb-tilt') === '1') askTilt();      // must run inside the tap itself
  $('frame').appendChild(eng.canvas); $('viewer').classList.remove('bare'); $('viewer').classList.add('on'); document.body.style.overflow = 'hidden';
  history.pushState({ v: 1 }, ''); setFrame(0, 1);
  await show(cards.indexOf(c)); loop();
  if (!store.get('drb-hint')){ store.set('drb-hint', '1'); toast('Swipe for the next bathroom. Tap the picture to hide the buttons.'); }
}
function closeViewer(pop){
  if (!open) return; open = null; cancelAnimationFrame(raf); going = false; drag = null;
  $('viewer').classList.remove('on'); document.body.style.overflow = '';
  if (!pop && history.state && history.state.v) history.back();
  renderGrid();
}
async function go(dir){
  if (!open || going || cards.length < 2) return; going = true;
  const f = $('frame'), vw = $('stage').clientWidth;
  f.classList.add('anim'); setFrame(-dir * vw * .5, 0); await wait(200);
  f.classList.remove('anim'); if (!open) { going = false; return; }
  await show(open.i + dir); if (!open) { going = false; return; }
  setFrame(dir * 80, 0); f.getBoundingClientRect(); f.classList.add('anim'); setFrame(0, 1); await wait(240);
  f.classList.remove('anim'); going = false;
}
// swipe = next / previous bathroom, short tap = hide or show the buttons
{
  const st = $('stage'), f = $('frame');
  st.addEventListener('pointerdown', (e) => { if (going || !open) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, t: performance.now(), go: false }; try { st.setPointerCapture(e.pointerId); } catch (er) {} });
  st.addEventListener('pointermove', (e) => {
    if (!drag){ if (e.pointerType === 'mouse'){ mouse.v = [(.5 - e.clientX / window.innerWidth) * 1.6, (.5 - e.clientY / window.innerHeight) * 1.2]; mouse.at = performance.now(); } return; }
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.go && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) drag.go = true;
    if (drag.go){ drag.dx = dx; setFrame(dx, 1 - Math.min(.45, Math.abs(dx) / window.innerWidth)); }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; const dt = performance.now() - d.t;
    if (d.go){
      if (e.type === 'pointerup' && (Math.abs(d.dx) > 70 || (Math.abs(d.dx) > 28 && dt < 260))) go(d.dx < 0 ? 1 : -1);
      else { f.classList.add('anim'); setFrame(0, 1); setTimeout(() => f.classList.remove('anim'), 240); }
    } else if (e.type === 'pointerup' && dt < 450 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) $('viewer').classList.toggle('bare');
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
}
// tilting the device (iPhone and iPad ask once before sharing motion)
const needAsk = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
function onTilt(e){
  if (e.gamma == null || e.beta == null) return;
  const so = screen.orientation; const a = so && typeof so.angle === 'number' ? so.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
  let x = e.gamma, y = e.beta;
  if (a === 90){ x = e.beta; y = -e.gamma; } else if (a === 270 || a === -90){ x = -e.beta; y = e.gamma; } else if (a === 180){ x = -e.gamma; y = -e.beta; }
  if (!tilt.base) tilt.base = [x, y];
  tilt.base[0] += (x - tilt.base[0]) * .003; tilt.base[1] += (y - tilt.base[1]) * .003;     // however it is held becomes the new centre, slowly
  tilt.v = [clamp((tilt.base[0] - x) / 12), clamp((tilt.base[1] - y) / 12)]; tilt.at = performance.now();
}
function tiltSet(on){
  tilt.on = on; tilt.base = null; $('tilt').setAttribute('aria-pressed', on);
  if (on) window.addEventListener('deviceorientation', onTilt); else window.removeEventListener('deviceorientation', onTilt);
}
function askTilt(){
  return DeviceOrientationEvent.requestPermission().then(r => {
    if (r === 'granted'){ tiltSet(true); store.set('drb-tilt', '1'); }
    else { store.set('drb-tilt', '0'); toast('Motion is switched off for this app. The picture still moves gently by itself.'); }
  }).catch(() => {});
}
$('tilt').onclick = () => { if (tilt.on){ tiltSet(false); store.set('drb-tilt', '0'); } else if (needAsk) askTilt(); else tiltSet(true); };
if (!STILL){ if (needAsk) $('tilt').hidden = false; else if ('DeviceOrientationEvent' in window) tiltSet(true); }

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
  drawViewer();
  return new Promise(r => c.toBlob(r, 'image/jpeg', .92));
}
const words = () => SLOTS.map(([k, n]) => { const d = byCode(state[k]); return `${n}: ${d.name} (${d.code})`; }).join('\n');
async function share(){
  const b = $('share'); b.disabled = true;
  try {
    const blob = await picture(); const file = new File([blob], 'drambay-bathroom.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: 'Drambay bathroom\n' + words() });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Picture saved. Attach it in WhatsApp.'); }
  } catch (e) { if (e.name !== 'AbortError') toast('Could not share the picture.'); }
  b.disabled = false;
}
function ask(){
  const t = `Hi Drambay, I liked this bathroom in Rooms Studio.\n${words()}\nPlease share details.`;
  window.open(`https://wa.me/${WA}?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
}

/* ---------- surprise me: a new combination that follows a simple colour rule ---------- */
function surprise(){
  const T = (d) => TONE[d.code], ch = (t) => Math.hypot(t[1], t[2]), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const A = designs.filter(d => fits(d, 'wall') && T(d)); if (A.length < 3) return;
  const walls = A.filter(d => T(d)[0] >= 72 && ch(T(d)) <= 12 && d.code !== state.wall);                  // walls: light and calm
  const wall = pick(walls.length ? walls : A), Lw = T(wall)[0];
  const same = A.filter(d => d.code !== wall.code && sizeOf(d) === sizeOf(wall));
  const feats = same.filter(d => (T(d)[0] <= 50 || ch(T(d)) >= 13 || Lw - T(d)[0] >= 22) && d.code !== state.feature);   // feature wall: dark or strong
  const feature = pick(feats.length ? feats : (same.length ? same : A));
  const F = designs.filter(d => fits(d, 'floor') && T(d) && d.code !== wall.code && d.code !== feature.code);
  const floors = F.filter(d => T(d)[0] >= 30 && T(d)[0] <= 86 && ch(T(d)) <= 16 && Lw - T(d)[0] >= 6 && d.code !== state.floor);       // floor: a step darker than the walls
  const floor = pick(floors.length ? floors : F);
  state.floor = floor.code; state.wall = wall.code; state.feature = feature.code;
  const b = $('shuffle'); b.classList.toggle('spin'); changed();
}

/* ---------- tile picker ---------- */
function chips(host, items, cur, on){
  host.innerHTML = '';
  for (const [v, text] of items){ const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-pressed', v === cur); b.onclick = () => on(v); host.appendChild(b); }
}
function drawChips(){
  const pool = designs.filter(d => fits(d, pickSlot));
  chips($('sizes'), [['all', 'All sizes'], ...[...new Set(pool.map(sizeOf))].map(s => [s, s])], sizeF, (v) => { sizeF = v; finF = 'all'; drawChips(); drawList(); });
  const fins = new Set(pool.filter(d => sizeF === 'all' || sizeOf(d) === sizeF).map(finCat));
  $('fins').hidden = fins.size < 2;
  chips($('fins'), [['all', 'Any finish'], ['Glossy', 'Glossy'], ['Matt', 'Matt']], finF, (v) => { finF = v; drawChips(); drawList(); });
}
function openPicker(slot){
  pickSlot = slot; sizeF = 'all'; finF = 'all'; $('q').value = '';
  $('sheetTitle').textContent = { floor: 'Floor tile', wall: 'Wall tile', feature: 'Feature wall tile' }[slot];
  drawChips(); drawList(); $('sheet').classList.add('on'); $('list').scrollTop = 0;
}
function drawList(){
  const q = $('q').value.trim().toLowerCase(), L = $('list'); L.innerHTML = '';
  const fr = document.createDocumentFragment();
  const rows = designs.filter(d => fits(d, pickSlot) && (sizeF === 'all' || sizeOf(d) === sizeF) && (finF === 'all' || finCat(d) === finF) && (!q || d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)));
  rows.forEach(d => {
    const b = document.createElement('button'); b.className = 'tile' + (d.size[0] === d.size[1] ? ' sq' : ''); b.type = 'button';
    b.innerHTML = '<i></i><b></b><small></small>'; b.querySelector('b').textContent = d.name; b.querySelector('small').textContent = label(d);
    b.querySelector('i').style.backgroundImage = `url("${thumb(d.faces[0])}")`;
    if (state[pickSlot] === d.code) b.setAttribute('aria-current', 'true');
    b.onclick = () => choose(d.code); fr.appendChild(b);
  });
  if (!rows.length){ const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No tile matches. Try another size or finish.'; fr.appendChild(p); }
  L.appendChild(fr);
}
function choose(code){ state[pickSlot] = code; $('sheet').classList.remove('on'); changed(); }

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
  else { b.textContent = 'Saved for offline'; b.classList.add('done'); store.set('drb-offline', '1'); }
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
  [designs, MH, TONE] = await Promise.all([fetch('designs.json').then(r => r.json()), fetch('mh.json').then(r => r.json()), fetch('tones.json').then(r => r.json()).catch(() => ({}))]);
  try { eng = new Engine(); } catch (e) { $('grid').innerHTML = '<p class="note">This device cannot draw the live rooms. Please open it in a current browser.</p>'; return; }
  load(); drawPicks(); await buildGrid(); await renderGrid();
  if (store.get('drb-offline')){ $('offline').textContent = 'Saved for offline'; $('offline').classList.add('done'); }
  if (Q.get('open')) { const c = cards.find(c => c.id === Q.get('open')); if (c) openViewer(c); }
}
$('close').onclick = () => closeViewer(); addEventListener('popstate', () => closeViewer(true));
$('prev').onclick = () => go(-1); $('next').onclick = () => go(1);
$('share').onclick = share; $('ask').onclick = ask; $('offline').onclick = saveOffline; $('shuffle').onclick = surprise;
$('swap').onclick = () => { [state.wall, state.feature] = [state.feature, state.wall]; changed(); };
$('sheetClose').onclick = () => $('sheet').classList.remove('on');
$('sheet').onclick = (e) => { if (e.target === $('sheet')) $('sheet').classList.remove('on'); };
$('q').oninput = drawList;
addEventListener('keydown', (e) => {
  if (e.key === 'Escape'){ if ($('sheet').classList.contains('on')) $('sheet').classList.remove('on'); else closeViewer(); }
  else if (open && !$('sheet').classList.contains('on')){ if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (open) drawViewer(); else { layoutGrid(); renderGrid(); } }, 200); });
if ('serviceWorker' in navigator){
  const had = !!navigator.serviceWorker.controller; let once = false;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // a newer version has taken over: show it straight away, unless a room is open
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !once && !open && !$('sheet').classList.contains('on')){ once = true; location.reload(); } });
}
window.__looks = { ready: start() };
// test hooks: one frame of a room as a JPEG data URL, and the tilt position
window.__looks.frame = async (id, t, w, live = true, p = null) => { const c = cards.find(c => c.id === id); return eng.render(await c.room, await sets(), { width: w, live, time: t, par: p }).toDataURL('image/jpeg', .9); };
window.__looks.par = (x, y) => { mouse.v = [x, y]; mouse.at = performance.now() + 1e9; };
