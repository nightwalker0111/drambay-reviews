import { Engine } from './engine.js';
import { Hall, WIN } from './hall.js';

const ROOMS = ['r7', 'r3', 'r6'];
/* the display hall's three spaces. Bathrooms choose floor, walls and feature wall; the other two are floors only */
const SPACES = {
  bath:   { name: 'Bathrooms', rooms: ROOMS },
  living: { name: 'Living room', rooms: ['l1'], floorOnly: true, first: 'DRB-6012-003' },
  out:    { name: 'Terrace and parking', rooms: ['t1', 'p1'], floorOnly: true, first: 'DRB-5050-001+DRB-5050-002' },
};
// dark + light pairs that are laid as a checker (500 x 500 pairs are only ever shown as the pair; the 600 x 600 matt pairs are for the terrace, not the driveway)
const PAIRS = [['DRB-5050-001', 'DRB-5050-002'], ['DRB-5050-009', 'DRB-5050-010'], ['DRB-5050-011', 'DRB-5050-012'], ['DRB-5050-013', 'DRB-5050-014'], ['DRB-5050-006', 'DRB-5050-007'],
  ['DRB-6060-018', 'DRB-6060-019'], ['DRB-6060-020', 'DRB-6060-021'], ['DRB-6060-020', 'DRB-6060-024'], ['DRB-6060-016', 'DRB-6060-017']];
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

let designs = [], MH = {}, TONE = {}, eng, cards = [], state = {}, fstate = {}, vspace = 'bath', hspace = 'bath', pickSpace = 'bath', open = null, pickSlot = null, sizeF = 'all', finF = 'all', dirty = false, raf = 0, token = 0;

const face = (n, w) => LOCAL ? `tiles/${n}.jpg`
  : `https://static.wixstatic.com/media/da1752_${MH[n]}~mv2.jpg/v1/fit/w_${w},h_${w},q_${w > 400 ? 88 : 80},enc_jpg/da1752_${MH[n]}~mv2.jpg`;
const full = (n) => face(n, 1536), thumb = (n) => face(n, 320);
const byCode = (c) => designs.find(d => d.code === c);
const sizeOf = (d) => d.size.join(' x ');
const finCat = (d) => (d.finish === 'polished' || d.finish === 'mirror') ? 'Glossy' : 'Matt';
const label = (d) => `${d.size[0]} x ${d.size[1]} mm, ${FIN[d.finish] || d.finishEn || ''}`.replace(/, $/, '');
const MH_ok = (d) => LOCAL || !!MH[d.faces[0]];
const fits = (d, slot) => !d.pair && d.faces && d.faces.length && MH_ok(d) && (d.app === 'A' || (slot === 'floor' && d.app === 'T'));
const decor = (d) => /decor|pattern/i.test(d.look || '') || /decor/i.test(d.name);
// which floors belong where: living room = 600 x 1200 and 800 x 1600 only (never 600 x 600 matt); terrace and parking = the outdoor and 600 x 600 matt ranges. Decor tiles are never a full floor.
const fitsIn = (sp, d, slot) => sp === 'bath' ? fits(d, slot)
  : !!(d.faces && d.faces.length && MH_ok(d) && !decor(d)) && (sp === 'living' ? d.app === 'A' && !d.pair && (sizeOf(d) === '600 x 1200' || sizeOf(d) === '800 x 1600') : (d.app === 'K' || d.app === 'T') && !d.half);
const floorOnly = () => !!SPACES[vspace].floorOnly;
const RM = {}, roomOf = (id) => RM[id] || (RM[id] = { id, room: eng.loadRoom(`rooms/${id}/`) });
function addPairs(){
  for (const [ca, cb] of PAIRS){
    const a = byCode(ca), b = byCode(cb); if (!a || !b || !MH_ok(a) || !MH_ok(b)) continue;
    const wa = a.name.split(' '), wb = b.name.split(' '), same = wa.length > 1 && wa.slice(0, -1).join(' ') === wb.slice(0, -1).join(' ');
    designs.push({ ...a, code: ca + '+' + cb, name: same ? `${a.name} + ${wb[wb.length - 1]}` : `${a.name} + ${b.name}`, faces: [a.faces[0], b.faces[0]], pair: [ca, cb], terrace: a.size[0] !== 500, url: null });
    if (a.size[0] === 500) a.half = b.half = true;
    TONE[ca + '+' + cb] = TONE[ca];
  }
}

function toast(t){ const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200); }

function save(){ store.set('drb-looks', JSON.stringify(state)); store.set('drb-floors', JSON.stringify(fstate)); }
function load(){
  let s = {}, f = {}; try { s = JSON.parse(store.get('drb-looks') || '{}'); f = JSON.parse(store.get('drb-floors') || '{}'); } catch (e) {}
  for (const [k] of SLOTS){ const c = Q.get(k) || s[k]; state[k] = byCode(c) && fits(byCode(c), k) ? c : DEFAULTS[k]; }
  for (const k in SPACES) if (SPACES[k].floorOnly){ const c = f[k]; fstate[k] = byCode(c) && fitsIn(k, byCode(c)) ? c : SPACES[k].first; }
}

function drawPicks(){
  for (const host of [$('picks'), $('vpicks')]){
    host.innerHTML = '';
    const fo = host.id === 'vpicks' && floorOnly();              // living room, terrace, parking: one choice, the floor
    for (const [k, name] of (fo ? SLOTS.slice(0, 1) : SLOTS)){
      const d = byCode(fo ? fstate[vspace] : state[k]); const b = document.createElement('button'); b.className = 'slot'; b.type = 'button';
      b.innerHTML = `<i class="sw"></i><span><small>${name}</small><b></b></span>`;
      b.querySelector('.sw').style.backgroundImage = `url("${thumb(d.faces[0])}")`; b.querySelector('b').textContent = d.name;
      b.setAttribute('aria-label', `${name}: ${d.name}. Change`);
      b.onclick = () => openPicker(k); host.appendChild(b);
    }
  }
}
function changed(){ save(); drawPicks(); if (open) { dirty = true; navs(); drawViewer(); } else renderGrid(); }

async function sets(sp = 'bath'){
  if (SPACES[sp].floorOnly){ const s = await eng.loadSet(byCode(fstate[sp]), full); return { floor: s, wall: s, feature: s }; }
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
    const c = { id, el, cv: el.querySelector('canvas'), room: roomOf(id).room };
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
  const room = await me.room; let S; try { S = await sets(vspace); } catch (e) { toast('That tile is not saved on this device yet.'); return; }
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
// the rooms the full-screen view moves through: the three bathrooms, or the rooms of the hall's space (a terrace-only pair stays on the terrace)
function vlist(){
  if (!floorOnly()) return cards; const d = byCode(fstate[vspace]);
  return SPACES[vspace].rooms.filter(id => !(d && d.terrace && id === 'p1')).map(roomOf);
}
function navs(){ const one = vlist().length < 2; $('prev').hidden = $('next').hidden = one; if (open) $('vcount').textContent = one ? '' : `${open.i + 1} / ${vlist().length}`; }
async function show(i){
  const L = vlist(), c = L[(i % L.length + L.length) % L.length], room = await c.room;
  open = { ...c, i: L.indexOf(c), live: liveOf(room), oy: 0, t: 0, name: room.j.name };
  $('vname').textContent = room.j.name; navs();
  $('vbg').style.backgroundImage = `url("rooms/${c.id}/thumb.jpg")`;
  await drawViewer(0);
}
async function openViewer(c, soft, sp = 'bath'){
  vspace = sp; $('viewer').classList.toggle('fo', floorOnly()); drawPicks();
  $('viewer').classList.toggle('fadein', !!soft);
  if (needAsk && !tilt.on && store.get('drb-tilt') === '1') askTilt();      // must run inside the tap itself
  $('frame').appendChild(eng.canvas); $('viewer').classList.remove('bare'); $('viewer').classList.add('on'); document.body.style.overflow = 'hidden';
  history.pushState({ v: 1 }, ''); setFrame(0, 1);
  await show(Math.max(0, vlist().findIndex(v => v.id === c.id))); loop();
  if (!store.get('drb-hint') && vlist().length > 1){ store.set('drb-hint', '1'); toast(`Swipe for the next ${floorOnly() ? 'room' : 'bathroom'}. Tap the picture to hide the buttons.`); }
}
function closeViewer(pop){
  if (!open) return; open = null; cancelAnimationFrame(raf); going = false; drag = null;
  $('viewer').classList.remove('on'); document.body.style.overflow = '';
  if (!pop && history.state && history.state.v){ skipPop = true; history.back(); }
  if (hallOn) hall.resume(); else renderGrid();
}
async function go(dir){
  if (!open || going || vlist().length < 2) return; going = true;
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
  const room = await open.room, S = await sets(vspace);
  const src = eng.render(room, S, { width: room.j.W, live: false, grain: .01 });
  const W = src.width, band = Math.round(Math.max(96, W * .06)), H = src.height + band;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#F5F2EC'; x.fillRect(0, 0, W, H); x.drawImage(src, 0, 0);
  const logo = document.querySelector('header.top img'); const lh = band * .5, lw = lh * logo.naturalWidth / logo.naturalHeight, pad = band * .28;
  x.drawImage(logo, pad, src.height + (band - lh) / 2, lw, lh);
  x.fillStyle = '#343A3B'; x.textBaseline = 'middle'; x.font = `500 ${Math.round(band * .24)}px "Hanken Grotesk", system-ui, sans-serif`;
  const line = floorOnly() ? `Floor: ${byCode(fstate[vspace]).name}` : SLOTS.map(([k, n]) => `${n}: ${byCode(state[k]).name}`).join('   ·   ');
  x.fillText(line, pad * 2 + lw, src.height + band * .4, W - pad * 3 - lw);
  x.fillStyle = '#6F7574'; x.font = `400 ${Math.round(band * .19)}px "Hanken Grotesk", system-ui, sans-serif`;
  x.fillText('Design visualisation  ·  drambay.com', pad * 2 + lw, src.height + band * .72, W - pad * 3 - lw);
  drawViewer();
  return new Promise(r => c.toBlob(r, 'image/jpeg', .92));
}
const words = () => { if (floorOnly()){ const d = byCode(fstate[vspace]); return `Floor: ${d.name} (${d.pair ? d.pair.join(' + ') : d.code})`; } return SLOTS.map(([k, n]) => { const d = byCode(state[k]); return `${n}: ${d.name} (${d.code})`; }).join('\n'); };
const what = () => floorOnly() && open ? open.name.toLowerCase() : 'bathroom';
async function share(){
  const b = $('share'); b.disabled = true;
  try {
    const blob = await picture(); const file = new File([blob], `drambay-${what().replace(/\s+/g, '-')}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: `Drambay ${what()}\n` + words() });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Picture saved. Attach it in WhatsApp.'); }
  } catch (e) { if (e.name !== 'AbortError') toast('Could not share the picture.'); }
  b.disabled = false;
}
function ask(){
  const t = `Hi Drambay, I liked this ${floorOnly() ? 'floor for a ' + what() : 'bathroom'} in Rooms Studio.\n${words()}\nPlease share details.`;
  window.open(`https://wa.me/${WA}?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
}

/* ---------- 360 display hall: a ring of display bays, each one design. Tap the floor circle to step into its bathroom ---------- */
// [the design on show (walls), floor, feature wall, bathroom]
const BAYS = [
  ['DRB-6012-003', 'DRB-6012-003', 'DRB-6012-003', 'r3'], ['DRB-6012-012', 'DRB-6012-003', 'DRB-6012-012', 'r7'],
  ['DRB-6012-026', 'DRB-6012-026', 'DRB-6012-026', 'r6'], ['DRB-6012-010', 'DRB-6012-015', 'DRB-6012-010', 'r3'],
  ['DRB-6012-025', 'DRB-6012-025', 'DRB-6012-025', 'r7'], ['DRB-6012-021', 'DRB-6012-026', 'DRB-6012-021', 'r6'],
  ['DRB-6012-015', 'DRB-6012-015', 'DRB-6012-015', 'r3'], ['DRB-6012-027', 'DRB-6012-025', 'DRB-6012-027', 'r7'],
  ['DRB-6012-037', 'DRB-6012-037', 'DRB-6012-037', 'r6'], ['DRB-6012-016', 'DRB-6012-026', 'DRB-6012-016', 'r3'],
  ['DRB-6012-053', 'DRB-6012-053', 'DRB-6012-053', 'r7'], ['DRB-6012-013', 'DRB-6012-025', 'DRB-6012-013', 'r6'],
];
// the other two spaces show floors only: [the floor on show, room]. Terrace and parking take turns; the 600 x 600 matt pairs sit on the terrace.
const FLOORS = {
  living: ['DRB-6012-003', 'DRB-6012-012', 'DRB-8016-018', 'DRB-8016-013', 'DRB-6012-026', 'DRB-6012-016', 'DRB-8016-005', 'DRB-6012-053', 'DRB-8016-012', 'DRB-6012-013', 'DRB-6012-037', 'DRB-8016-014'].map(c => [c, 'l1']),
  out: [['DRB-5050-001+DRB-5050-002', 't1'], ['DRB-5050-013+DRB-5050-014', 'p1'], ['DRB-6060-010', 't1'], ['DRB-5050-009+DRB-5050-010', 'p1'], ['DRB-6060-001', 't1'], ['DRB-6060-012', 'p1'],
        ['DRB-5050-011+DRB-5050-012', 't1'], ['DRB-5050-006+DRB-5050-007', 'p1'], ['DRB-6060-016+DRB-6060-017', 't1'], ['DRB-6060-003', 'p1'], ['DRB-6060-018+DRB-6060-019', 't1'], ['DRB-6060-005', 'p1']],
};
let hall = null, hallOn = false, skipPop = false;
function jointOf(t){            // same joint rule as the rooms: light tile dark joint, beige tile brown joint, dark tile light joint
  if (!t) return [94, 92, 92]; const [L, a, b] = t;
  if (L < 35 && b > 4) return [190, 182, 168]; if (L < 35) return [126, 128, 128];
  if (b > 6 && L >= 55) return [104, 74, 52]; if (b > 5 && a >= 2 && L < 55) return [190, 182, 168];
  return L >= 62 ? [60, 58, 58] : [94, 92, 92];
}
const bayOf = ([w, f, x, base]) => { const d = byCode(w); return { design: d, name: d.name, meta: `${FIN[d.finish] || d.finishEn}  ·  ${d.size[0]} x ${d.size[1]} mm`, joint: jointOf(TONE[d.code]), combo: { wall: w, floor: f, feature: x }, base, focusY: base === 'r7' ? .62 : .5 }; };
const floorBay = ([f, base]) => { const d = byCode(f); return { design: d, name: d.name, meta: `${FIN[d.finish] || d.finishEn}  ·  ${d.size[0]} x ${d.size[1]} mm`, joint: jointOf(TONE[d.code]), combo: { floor: f }, base, focusY: .5 }; };
// the twelve bays of a space (a design that cannot be shown is replaced by the next one that can, so the ring always has twelve)
function hallRows(sp){
  if (sp === 'bath') return BAYS.filter(r => r.slice(0, 3).every(c => byCode(c) && MH_ok(byCode(c)))).map(bayOf);
  const ok = FLOORS[sp].filter(r => byCode(r[0]) && fitsIn(sp, byCode(r[0]))), rows = [];
  for (let i = 0; ok.length && rows.length < 12; i++) rows.push(ok[i % ok.length]);
  return rows.map(floorBay);
}
let bays = [];
/* surprise me, in the hall: twelve other designs take the bays. Light and dark alternate; a dark design gets a calm light floor */
function hallSurprise(){
  if (!hall || hall.anim) return;
  const T = (d) => TONE[d.code], ch = (t) => Math.hypot(t[1], t[2]), mix = (a) => a.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(v => v[1]);
  const now = new Set(bays.map(b => b.design.code));
  if (hspace !== 'bath'){
    // floors only: twelve other floors of this space, light and dark taking turns. On the driveway, never a terrace-only pair.
    const pool = designs.filter(d => fitsIn(hspace, d) && T(d)), fresh = pool.filter(d => !now.has(d.code)), src = mix(fresh.length >= 12 ? fresh : pool);
    const rows = [], bases = SPACES[hspace].rooms, mid = hspace === 'out' ? 60 : 70;
    for (let i = 0; rows.length < 12 && src.length; i++){
      const base = bases[rows.length % bases.length], wantLight = rows.length % 2 === 0, can = (d) => !(d.terrace && base === 'p1');
      let k = src.findIndex(d => can(d) && (T(d)[0] >= mid) === wantLight); if (k < 0) k = src.findIndex(can); if (k < 0) break;
      rows.push([src.splice(k, 1)[0].code, base]);
    }
    if (rows.length < 12) return;
    bays = rows.map(floorBay); hall.spin(); setTimeout(() => { hall.setBays(bays); $('hcount').textContent = `${hall.active + 1} / ${bays.length}`; }, STILL ? 0 : 330);
    $('hshuffle').classList.toggle('spin'); return;
  }
  const pool = designs.filter(d => fits(d, 'wall') && T(d) && d.size[0] === 600 && d.size[1] === 1200 && !/decor/i.test(d.look || '') && !/decor/i.test(d.name));
  const fresh = pool.filter(d => !now.has(d.code)), src = fresh.length >= 12 ? fresh : pool;
  const light = mix(src.filter(d => T(d)[0] >= 70)), dark = mix(src.filter(d => T(d)[0] < 70)), calm = pool.filter(d => T(d)[0] >= 78 && ch(T(d)) <= 12);
  const rows = [], bases = ['r3', 'r7', 'r6'];
  for (let i = 0; rows.length < 12 && (light.length || dark.length); i++){
    const d = (i % 2 === 0 ? light.shift() || dark.shift() : dark.shift() || light.shift()), t = T(d);
    let floor = d.code;
    if (t[0] < 60){ const warm = calm.filter(c => (T(c)[2] > 5) === (t[2] > 4)); const c = (warm.length ? warm : calm); floor = c[Math.floor(Math.random() * c.length)].code; }
    rows.push([d.code, floor, d.code, bases[rows.length % 3]]);
  }
  if (rows.length < 12) return;
  bays = rows.map(bayOf); hall.spin(); setTimeout(() => { hall.setBays(bays); $('hcount').textContent = `${hall.active + 1} / ${bays.length}`; }, STILL ? 0 : 330);
  $('hshuffle').classList.toggle('spin');
}
function buildHall(){
  if (SPACES[Q.get('space')]) hspace = Q.get('space');
  bays = hallRows(hspace); drawSpaces();
  hall = new Hall($('hallcv'), {
    bays, still: STILL, faceUrl: (n) => face(n, 640), logo: 'logo-white.svg',
    paint: async (b, put, w) => {
      const room = await roomOf(b.base).room; let S;
      for (;;){ S = {}; for (const k of ['floor', 'wall', 'feature']) S[k] = b.combo[k] ? await eng.loadSet(byCode(b.combo[k]), full) : S.floor; if (!open) break; await wait(200); }
      const h = w * WIN[3] / WIN[2], cv = eng.render(room, S, { width: Math.min(room.j.W, Math.ceil(Math.max(w, h * room.j.W / room.j.H))), grain: .008 });
      put(cv, cv.width, cv.height);
    },
    onMove: (on) => $('hall').classList.toggle('going', on),
    onBay: (i) => { $('hcount').textContent = `${i + 1} / ${bays.length}`; },
    onEnter: (i) => {
      const b = bays[i];
      if (b.combo.wall){ Object.assign(state, b.combo); save(); openViewer(cards.find(c => c.id === b.base), true); }
      else { fstate[hspace] = b.combo.floor; save(); openViewer(roomOf(b.base), true, hspace); }
    },
  });
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('400 50px Newsreader'), document.fonts.load('500 27px "Hanken Grotesk"')]).then(() => hall.refresh()).catch(() => {});
}
/* the hall's spaces: Bathrooms, Living room, Terrace and parking. The name at the top left opens the list */
function drawSpaces(){
  $('hsname').textContent = SPACES[hspace].name; $('hstep').textContent = hspace === 'bath' ? 'Step into this bathroom' : 'Step into this room';
  const m = $('hmenu'); m.innerHTML = '';
  for (const k in SPACES){ const b = document.createElement('button'); b.type = 'button'; b.textContent = SPACES[k].name; b.setAttribute('role', 'menuitem'); if (k === hspace) b.setAttribute('aria-current', 'true'); b.onclick = () => { spaceMenu(false); setSpace(k); }; m.appendChild(b); }
}
function spaceMenu(on){ clearTimeout(spaceMenu.t); $('hmenu').hidden = !on; $('hspace').setAttribute('aria-expanded', on); }
function setSpace(k){
  if (!hall || hall.anim || k === hspace || !SPACES[k]) return;
  const rows = hallRows(k); if (rows.length < 12) { toast('These floors are not saved on this device yet. Connect once to load them.'); return; }
  hspace = k; bays = rows; drawSpaces(); hall.spin();
  setTimeout(() => { hall.setBays(bays); $('hcount').textContent = `${hall.active + 1} / ${bays.length}`; }, STILL ? 0 : 330);
}
function placeHallNav(){ if (hall) $('hall').style.setProperty('--ringy', Math.round(hall.ringY()) + 'px'); }
function openHall(){
  if (hallOn) return;
  try { if (!hall) buildHall(); } catch (e) { toast('This device cannot draw the display hall.'); return; }
  hallOn = true; $('hall').classList.add('on'); document.body.style.overflow = 'hidden'; history.pushState({ h: 1 }, '');
  $('hall').classList.remove('going'); hall.open(); placeHallNav();
  if (!store.get('drb-hallhint')){ store.set('drb-hallhint', '1'); toast('Drag to look around. Tap the circle on the floor to step inside.'); }
  if (!store.get('drb-spacehint')){ store.set('drb-spacehint', '1'); spaceMenu(true); spaceMenu.t = setTimeout(() => spaceMenu(false), 4200); }      // shown once: the list of spaces
}
function closeHall(pop){
  if (!hallOn) return; hallOn = false; spaceMenu(false); hall.close(); $('hall').classList.remove('on'); document.body.style.overflow = '';
  if (!pop && history.state && history.state.h){ skipPop = true; history.back(); }
  renderGrid();
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
  const pool = designs.filter(fitP);
  chips($('sizes'), [['all', 'All sizes'], ...[...new Set(pool.map(sizeOf))].map(s => [s, s])], sizeF, (v) => { sizeF = v; finF = 'all'; drawChips(); drawList(); });
  const fins = new Set(pool.filter(d => sizeF === 'all' || sizeOf(d) === sizeF).map(finCat));
  $('fins').hidden = fins.size < 2;
  chips($('fins'), [['all', 'Any finish'], ['Glossy', 'Glossy'], ['Matt', 'Matt']], finF, (v) => { finF = v; drawChips(); drawList(); });
}
const fitP = (d) => fitsIn(pickSpace, d, pickSlot) && !(d.terrace && open && open.id === 'p1');
function openPicker(slot){
  pickSpace = open ? vspace : 'bath'; pickSlot = slot; sizeF = 'all'; finF = 'all'; $('q').value = '';
  $('sheetTitle').textContent = { floor: 'Floor tile', wall: 'Wall tile', feature: 'Feature wall tile' }[slot];
  drawChips(); drawList(); $('sheet').classList.add('on'); $('list').scrollTop = 0;
}
function drawList(){
  const q = $('q').value.trim().toLowerCase(), L = $('list'); L.innerHTML = '';
  const fr = document.createDocumentFragment();
  const cur = SPACES[pickSpace].floorOnly ? fstate[pickSpace] : state[pickSlot];
  const rows = designs.filter(d => fitP(d) && (sizeF === 'all' || sizeOf(d) === sizeF) && (finF === 'all' || finCat(d) === finF) && (!q || d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)));
  rows.forEach(d => {
    const b = document.createElement('button'); b.className = 'tile' + (d.size[0] === d.size[1] ? ' sq' : ''); b.type = 'button';
    b.innerHTML = '<i></i><b></b><small></small>'; b.querySelector('b').textContent = d.name; b.querySelector('small').textContent = label(d);
    b.querySelector('i').style.backgroundImage = `url("${thumb(d.faces[0])}")`;
    if (cur === d.code) b.setAttribute('aria-current', 'true');
    b.onclick = () => choose(d.code); fr.appendChild(b);
  });
  if (!rows.length){ const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No tile matches. Try another size or finish.'; fr.appendChild(p); }
  L.appendChild(fr);
}
function choose(code){ if (SPACES[pickSpace].floorOnly) fstate[pickSpace] = code; else state[pickSlot] = code; $('sheet').classList.remove('on'); changed(); }

/* ---------- offline + install ---------- */
async function saveOffline(){
  const b = $('offline'); if (!('caches' in window)) { toast('This browser cannot save for offline.'); return; }
  b.disabled = true;
  const urls = new Set();
  designs.filter(d => fits(d, 'floor') || fitsIn('living', d) || fitsIn('out', d)).forEach(d => { urls.add(thumb(d.faces[0])); d.faces.slice(0, 4).forEach(f => MH[f] && urls.add(full(f))); });
  [...BAYS, ...FLOORS.living, ...FLOORS.out].forEach(r => { const d = byCode(r[0]); if (d) d.faces.slice(0, 6).forEach(f => MH[f] && urls.add(face(f, 640))); });      // the display hall's panels
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
  addPairs(); load(); drawPicks(); await buildGrid(); await renderGrid();
  if (store.get('drb-offline')){ $('offline').textContent = 'Saved for offline'; $('offline').classList.add('done'); }
  if (Q.get('open')) { const id = Q.get('open'), c = cards.find(c => c.id === id), sp = Object.keys(SPACES).find(k => SPACES[k].rooms.includes(id)); if (c) openViewer(c); else if (sp) openViewer(roomOf(id), false, sp); }
  else if (Q.has('walk')) openHall();
}
$('close').onclick = () => closeViewer();
addEventListener('popstate', () => { if (skipPop){ skipPop = false; return; } if (open) closeViewer(true); else closeHall(true); });
$('walk').onclick = openHall; $('hclose').onclick = () => closeHall(); $('hprev').onclick = () => hall.turn(-1); $('hnext').onclick = () => hall.turn(1); $('hstep').onclick = () => hall.enter(hall.active); $('hshuffle').onclick = hallSurprise;
$('hspace').onclick = () => spaceMenu($('hmenu').hidden); $('hallcv').addEventListener('pointerdown', () => spaceMenu(false));
$('prev').onclick = () => go(-1); $('next').onclick = () => go(1);
$('share').onclick = share; $('ask').onclick = ask; $('offline').onclick = saveOffline; $('shuffle').onclick = surprise;
$('swap').onclick = () => { [state.wall, state.feature] = [state.feature, state.wall]; changed(); };
$('sheetClose').onclick = () => $('sheet').classList.remove('on');
$('sheet').onclick = (e) => { if (e.target === $('sheet')) $('sheet').classList.remove('on'); };
$('q').oninput = drawList;
addEventListener('keydown', (e) => {
  if (e.key === 'Escape'){ if ($('sheet').classList.contains('on')) $('sheet').classList.remove('on'); else if (open) closeViewer(); else closeHall(); }
  else if (hallOn && !open){ if (e.key === 'ArrowRight') hall.turn(1); else if (e.key === 'ArrowLeft') hall.turn(-1); else if (e.key === 'Enter' && e.target === document.body) hall.enter(hall.active); }
  else if (open && !$('sheet').classList.contains('on')){ if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (hallOn){ hall.size(); placeHallNav(); } if (open) drawViewer(); else if (!hallOn) { layoutGrid(); renderGrid(); } }, 200); });
if ('serviceWorker' in navigator){
  const had = !!navigator.serviceWorker.controller; let once = false;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // a newer version has taken over: show it straight away, unless a room is open
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !once && !open && !$('sheet').classList.contains('on')){ once = true; location.reload(); } });
}
window.__looks = { ready: start() };
window.__looks.hall = () => hall;
// test hooks: one frame of a room as a JPEG data URL, and the tilt position
window.__looks.frame = async (id, t, w, live = true, p = null) => { const c = cards.find(c => c.id === id); return eng.render(await c.room, await sets(), { width: w, live, time: t, par: p }).toDataURL('image/jpeg', .9); };
window.__looks.space = (k) => setSpace(k);
window.__looks.par = (x, y) => { mouse.v = [x, y]; mouse.at = performance.now() + 1e9; };
