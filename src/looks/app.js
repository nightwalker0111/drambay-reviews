import { Engine, SLAB_CLEAN } from './engine.js';
import { Hall, WIN } from './hall.js';
import { asset, DATA } from './assets.js';      // where each picture lives: next to the page on the test link, Wix Media on drambay.com

const ROOMS = ['r7', 'r3', 'r6'];
/* the display hall's four spaces. Bathrooms choose floor, walls and feature wall; the kitchen chooses the island's slab and the floor; the other two are floors only */
const SPACES = {
  bath:   { name: 'Bathrooms', rooms: ROOMS },
  kitchen: { name: 'Kitchen', rooms: ['k1', 'k2'], kit: true, first: 'DRB-8024-001' },
  living: { name: 'Living room', rooms: ['l1'], floorOnly: true, first: 'DRB-6012-003' },
  out:    { name: 'Terrace and parking', rooms: ['t1', 'p1'], floorOnly: true, first: 'DRB-5050-001+DRB-5050-002' },
};
// dark + light pairs that are laid as a checker (500 x 500 pairs are only ever shown as the pair; the 600 x 600 matt pairs are for the terrace, not the driveway)
const PAIRS = [['DRB-5050-001', 'DRB-5050-002'], ['DRB-5050-009', 'DRB-5050-010'], ['DRB-5050-011', 'DRB-5050-012'], ['DRB-5050-013', 'DRB-5050-014'], ['DRB-5050-006', 'DRB-5050-007'],
  ['DRB-6060-018', 'DRB-6060-019'], ['DRB-6060-020', 'DRB-6060-021'], ['DRB-6060-020', 'DRB-6060-024'], ['DRB-6060-016', 'DRB-6060-017'],
  ['DRB-5050-015', 'DRB-5050-016'], ['DRB-5050-020', 'DRB-5050-021'], ['DRB-5050-025', 'DRB-5050-026']];      // the last three: the Jalandhar godown's 4028, Acacia 03 and Acacia 89
const WA = '919501034545';
const Q = new URLSearchParams(location.search);
const LOCAL = Q.has('local');
const ONE = Q.get('tile');                    // one-design link: only this tile, in every room it suits. No other designs, no picker, no contact button.
let oneList = null;
// dealer link (?dealer=slug): only the designs that dealer stocks, in the display hall, with the picker and Surprise me. The address itself is what gets counted.
const DEALER = (Q.get('dealer') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
let hallHome = false;                         // the display hall is the first and last screen (one-design link, dealer link)
const KEY = DEALER ? '-' + DEALER : '';
const PICK = Q.get('pick');                  // a link from a design's own page: the full tool opens in a room with that tile already laid
for (const e of document.querySelectorAll('img[data-asset]')) e.src = asset(e.dataset.asset);
const $ = (id) => document.getElementById(id);
const SLOTS = [['floor', 'Floor'], ['wall', 'Walls'], ['feature', 'Highlighter wall']];
const KSLOTS = [['slab', 'Slab'], ['floor', 'Floor']];
const DEFAULTS = { floor: 'DRB-6012-053', wall: 'DRB-6012-003', feature: 'DRB-6012-012' };
const FIN = { polished: 'Glossy', mirror: 'High Gloss', natural: 'Matt', textured: 'Textured' };
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;
const QLOCK = Q.has('q');                      // test switch: never lower the moving picture's sharpness
const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

let designs = [], MH = {}, TONE = {}, eng, cards = [], state = {}, fstate = {}, kstate = {}, vspace = 'bath', hspace = 'bath', pickSpace = 'bath', open = null, pickSlot = null, sizeF = 'all', finF = 'all', pairF = 'all', dirty = false, raf = 0, token = 0;

const face = (n, w) => (LOCAL || /^local/.test(MH[n] || '')) ? `tiles/${n}.jpg`      // a face that is not on Wix Media yet (mh.json says "local") sits beside the page, in tiles/
  : `https://static.wixstatic.com/media/da1752_${MH[n]}~mv2.jpg/v1/fit/w_${w},h_${w},q_${w > 400 ? 88 : 80},enc_jpg/da1752_${MH[n]}~mv2.jpg`;
const full = (n) => face(n, 1536), thumb = (n) => face(n, 320);
const byCode = (c) => designs.find(d => d.code === c);
const sizeOf = (d) => d.size.join(' x ');
const finCat = (d) => (d.finish === 'polished' || d.finish === 'mirror') ? 'Glossy' : 'Matt';
const label = (d) => `${d.size[0]} x ${d.size[1]} mm, ${FIN[d.finish] || d.finishEn || ''}`.replace(/, $/, '');
const MH_ok = (d) => LOCAL || !!MH[d.faces[0]];
const fits = (d, slot) => !d.pair && d.faces && d.faces.length && MH_ok(d) && (d.app === 'A' || (slot === 'floor' && d.app === 'T')) && !(slot !== 'feature' && decor(d));      // a decor tile is only ever the highlighter wall: never a full floor, never all the walls
const decor = (d) => /decor|pattern/i.test(d.look || '') || /decor/i.test(d.name);
// which floors belong where: living room = 600 x 1200 and 800 x 1600 only (never 600 x 600 matt); terrace and parking = the outdoor and 600 x 600 matt ranges. Decor tiles are never a full floor.
// The kitchen: its slab is one of the 800 x 2400 slabs; its floor follows the living room's rule (the product list has no kitchen-floor mark of its own).
const isSlab = (d) => d.app === 'X' && sizeOf(d) === '800 x 2400' && !!(d.faces && d.faces.length && MH_ok(d));
const fitsIn = (sp, d, slot) => sp === 'bath' ? fits(d, slot)
  : sp === 'kitchen' && slot !== 'floor' ? isSlab(d)
  : !!(d.faces && d.faces.length && MH_ok(d) && !decor(d)) && (sp === 'out' ? (d.app === 'K' || d.app === 'T') && !d.half : d.app === 'A' && !d.pair && (sizeOf(d) === '600 x 1200' || sizeOf(d) === '800 x 1600'));
// the floor laid under a slab when nobody has chosen one: a clear step in tone from the slab (a light floor under a dark slab, a grey one under a white slab)
function floorFor(sl){
  const L = (TONE[sl.code] || [50])[0], pool = designs.filter(d => fitsIn('kitchen', d, 'floor') && TONE[d.code]); if (!pool.length) return null;
  for (const c of ['DRB-6012-003', 'DRB-6012-053', 'DRB-6012-012']){ const d = pool.find(x => x.code === c); if (d && Math.abs(TONE[c][0] - L) >= 28) return d; }
  return pool.slice().sort((a, b) => Math.abs(TONE[b.code][0] - L) - Math.abs(TONE[a.code][0] - L))[0];
}
// the plain tile that goes with a decor tile: its own series first (Alice Aqua Decor -> Alice Aqua), else the calmest light tile of the same size
function plainFor(d){
  const ok = (x) => x.site !== false && !decor(x) && fits(x, 'wall') && fits(x, 'floor') && sizeOf(x) === sizeOf(d);
  const own = designs.find(x => ok(x) && x.name.toLowerCase() === d.name.replace(/\s*decor$/i, '').toLowerCase()); if (own) return own;
  const t = TONE[d.code] || [70, 0, 0], sc = (x) => { const q = TONE[x.code]; return Math.hypot(q[1], q[2]) + Math.abs(q[0] - 82) * .3 + ((q[2] > 5) === (t[2] > 5) ? 0 : 8); };
  return designs.filter(x => ok(x) && TONE[x.code]).sort((a, b) => sc(a) - sc(b))[0] || null;
}
const floorOnly = () => !!SPACES[vspace].floorOnly, kit = () => !!SPACES[vspace].kit;
// the tool's lists: read from assets.js when they are packed in there (drambay.com), else fetched as files
const getJSON = (p) => DATA[p] ? Promise.resolve(DATA[p]) : fetch(p).then(r => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });
const RM = {}, roomOf = (id) => RM[id] || (RM[id] = { id, room: eng.loadRoom(`rooms/${id}/`, asset, getJSON) });
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

function save(){ if (oneList) return; store.set('drb-looks' + KEY, JSON.stringify(state)); store.set('drb-floors' + KEY, JSON.stringify(fstate)); store.set('drb-kitchen' + KEY, JSON.stringify(kstate)); }
const firstFit = (k, def) => byCode(def) && fits(byCode(def), k) ? def : (designs.find(d => fits(d, k)) || {}).code;
const firstIn = (sp, def) => byCode(def) && fitsIn(sp, byCode(def)) ? def : (designs.find(d => fitsIn(sp, d)) || {}).code;
// a space is offered only when there is a tile to lay in it
const spaceOK = (k) => SPACES[k].kit ? !!(kstate.slab && kstate.floor) : SPACES[k].floorOnly ? !!fstate[k] : !!(state.floor && state.wall);
function load(){
  let s = {}, f = {}; try { s = JSON.parse(store.get('drb-looks' + KEY) || '{}'); f = JSON.parse(store.get('drb-floors' + KEY) || '{}'); } catch (e) {}
  for (const [k] of SLOTS){ const c = Q.get(k) || s[k]; state[k] = byCode(c) && fits(byCode(c), k) ? c : firstFit(k, DEFAULTS[k]); }
  for (const k in SPACES) if (SPACES[k].floorOnly){ const c = f[k]; fstate[k] = byCode(c) && fitsIn(k, byCode(c)) ? c : firstIn(k, SPACES[k].first); }
  let ks = {}; try { ks = JSON.parse(store.get('drb-kitchen' + KEY) || '{}'); } catch (e) {}
  const sl = byCode(Q.get('slab') || ks.slab), kf = byCode(ks.floor);
  kstate.slab = sl && isSlab(sl) ? sl.code : firstIn('kitchen', SPACES.kitchen.first);
  kstate.floor = kf && fitsIn('kitchen', kf, 'floor') ? kf.code : ((kstate.slab && floorFor(byCode(kstate.slab))) || {}).code;
}

function drawPicks(){
  for (const host of [$('picks'), $('vpicks')]){
    host.innerHTML = '';
    if (oneList && host.id === 'vpicks'){ const d = oneD(), b = document.createElement('button'); b.className = 'slot'; b.type = 'button';
      b.innerHTML = `<i class="sw"></i><span><small></small><b></b></span>`; b.querySelector('.sw').style.backgroundImage = `url("${thumb(d.faces[0])}")`;
      b.querySelector('small').textContent = `${FIN[d.finish] || d.finishEn}  ·  ${d.size[0]} x ${d.size[1]} mm` + (decor(d) ? '  ·  highlighter wall' : ''); b.querySelector('b').textContent = d.name;
      b.setAttribute('aria-label', `${d.name}. See the tile close up`); b.onclick = () => zoomLook(); host.appendChild(b); continue; }
    const fo = host.id === 'vpicks' && floorOnly(), kt = host.id === 'vpicks' && kit();              // living room, terrace, parking: one choice, the floor. Kitchen: the slab and the floor
    for (const [k, name] of (kt ? KSLOTS : fo ? SLOTS.slice(0, 1) : SLOTS)){
      const d = byCode(kt ? kstate[k] : fo ? fstate[vspace] : state[k]); if (!d) continue; const b = document.createElement('button'); b.className = 'slot'; b.type = 'button';
      b.innerHTML = `<i class="sw"></i><span><small>${name}</small><b></b></span>`;
      b.querySelector('.sw').style.backgroundImage = `url("${thumb(d.faces[0])}")`; b.querySelector('b').textContent = d.name;
      b.setAttribute('aria-label', `${name}: ${d.name}. Change`);
      b.onclick = () => openPicker(k); host.appendChild(b);
    }
  }
  drawPair();
}
function changed(){ save(); drawPicks(); if (open) { dirty = true; navs(); drawViewer(); } else renderGrid(); }

async function sets(sp = 'bath'){
  if (SPACES[sp].floorOnly){ const s = await eng.loadSet(byCode(fstate[sp]), full); return { floor: s, wall: s, feature: s }; }
  if (SPACES[sp].kit){ const [floor, slab] = await Promise.all([eng.loadSet(byCode(kstate.floor), full), eng.loadSet(byCode(kstate.slab), full)]); return { floor, wall: slab, feature: slab }; }      // the island's top, end and edge are the slab
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
    el.innerHTML = `<span class="ph"><canvas width="16" height="9"></canvas><img alt="" src="${asset(`rooms/${id}/thumb.jpg`)}"></span><span class="nm"></span>`;
    const c = { id, el, cv: el.querySelector('canvas'), room: roomOf(id).room };
    c.room.then(r => { c.ar = r.j.H / r.j.W; c.cv.width = r.j.W / 4; c.cv.height = r.j.H / 4; el.querySelector('.nm').textContent = r.j.name; el.setAttribute('aria-label', `${r.j.name}. Open full screen`); });
    el.onclick = () => openViewer(c);
    return c;
  });
  await Promise.all(cards.map(c => c.room)); layoutGrid(true);
}

/* ---------- full-screen view ---------- */
// look: where the viewer is turned (yaw right +, pitch up +, radians); sy / sp = what is on screen, easing towards it
const look = { y: 0, p: 0, sy: 0, sp: 0, oy: 0, op: 0, last: null, on: false }, fx = { dx: 0, op: 1 };
let q = 1, busy = false, drag = null, going = false;
const liveOf = (room) => !STILL && !!room.j.live && Object.keys(room.j.live).length > 0;

function placeFrame(){ const f = $('frame'); f.style.transform = `translate(calc(-50% + ${fx.dx + (open ? open.ox || 0 : 0)}px), calc(-50% + ${open ? open.oy : 0}px))`; f.style.opacity = fx.op; }
// where a room's subject sits (across, down; 0 to 1): the part that stays on screen when the screen crops the picture. The upright kitchens need it: a sideways screen shows under half their height.
const FOCUS = { k1: [.75, .68], k2: [.5, .6] };
function setFrame(dx, op){ fx.dx = dx; fx.op = op; placeFrame(); }
// every screen, held either way: the room always covers the whole screen (Bhavya 19-11: "full screen pictures that cover whole of my screen").
// What the screen crops away is reached by looking round (drag, or move the phone).
function fitOf(room){
  const st = $('stage'), a = st.clientWidth / room.j.W, b = st.clientHeight / room.j.H;
  return Math.max(a, b);
}
/* ---------- looking round: turning the camera where it stands ----------
   A camera that only turns (does not move) sees the same scene, so the photo is redrawn exactly by one projective map:
   H = K Rt K^-1 (K = the room's own lens, Rt = the turn). It is applied to the drawn picture as a CSS matrix3d, so turning costs no redraw.
   The turn stops where the screen would show past the photo's edge. */
const rotOf = (y, p) => { const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  return [[cy, -sy * sp, sy * cp], [0, cp, -sp], [-sy, cy * sp, cy * cp]]; };          // the turned camera's axes, in the photo camera's frame
const mul3 = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const tr3 = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
function homog(K, y, p, inv){
  const k = [[K.f, 0, K.cx], [0, K.f, K.cy], [0, 0, 1]], ki = [[1 / K.f, 0, -K.cx / K.f], [0, 1 / K.f, -K.cy / K.f], [0, 0, 1]], R = rotOf(y, p);
  return mul3(mul3(k, inv ? R : tr3(R)), ki);                                         // photo pixel -> turned view pixel (inv: the way back)
}
// how far the picture must zoom in (about the screen's centre) so that, turned by (y, p), it still covers the screen. Above ZMAX = too far.
const ZMAX = 1.3;
function lookZoom(y, p){
  const K = open && open.K; if (!K) return 1;
  const Hi = homog(K, y, p, true), st = $('stage'), sw = st.clientWidth, sh = st.clientHeight;
  const x0 = sw / 2 - K.cw / 2 + (open.ox || 0), y0 = sh / 2 - K.ch / 2 + (open.oy || 0), c = [sw / 2 - x0, sh / 2 - y0];
  const inside = (z) => { for (const [u, v] of [[0, 0], [sw, 0], [0, sh], [sw, sh]]){
    const a = c[0] + (u - x0 - c[0]) / z, b = c[1] + (v - y0 - c[1]) / z, w = Hi[2][0] * a + Hi[2][1] * b + Hi[2][2]; if (w <= 0) return false;
    const X = (Hi[0][0] * a + Hi[0][1] * b + Hi[0][2]) / w, Y = (Hi[1][0] * a + Hi[1][1] * b + Hi[1][2]) / w;
    if (X < -1 || Y < -1 || X > K.cw + 1 || Y > K.ch + 1) return false; } return true; };
  if (inside(1)) return 1; if (!inside(ZMAX)) return ZMAX + 1;
  let lo = 1, hi = ZMAX; for (let i = 0; i < 12; i++){ const m = (lo + hi) / 2; if (inside(m)) hi = m; else lo = m; } return hi;
}
const lookOK = (y, p) => lookZoom(y, p) <= ZMAX;
const bis = (f) => { if (f(1)) return 1; let lo = 0, hi = 1; for (let i = 0; i < 14; i++){ const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return lo; };
function lookTo(y, p){                                       // turn towards (y, p) as far as the photo allows, sliding along its edge
  if (!lookOK(look.oy, look.op)){ look.oy = look.op = 0; }
  const ty = bis((t) => lookOK(look.oy + (y - look.oy) * t, look.op)), ny = look.oy + (y - look.oy) * ty;
  const tp = bis((t) => lookOK(ny, look.op + (p - look.op) * t)), np = look.op + (p - look.op) * tp;
  look.y = look.oy = ny; look.p = look.op = np;
}
function lookReset(){ look.y = look.p = look.sy = look.sp = look.oy = look.op = 0; lookApply(); }
function lookApply(){
  const cv = eng && eng.canvas; if (!cv) return; const K = open && open.K;
  if (!K || (Math.abs(look.sy) < 1e-5 && Math.abs(look.sp) < 1e-5)){ if (cv.style.transform) cv.style.transform = ''; return; }
  const z = Math.min(ZMAX, lookZoom(look.sy, look.sp)), st = $('stage');
  const c = [st.clientWidth / 2 - (st.clientWidth / 2 - K.cw / 2 + (open.ox || 0)), st.clientHeight / 2 - (st.clientHeight / 2 - K.ch / 2 + (open.oy || 0))];
  const H = mul3([[z, 0, c[0] * (1 - z)], [0, z, c[1] * (1 - z)], [0, 0, 1]], homog(K, look.sy, look.sp)), n = H[2][2];      // turn, then zoom in about the screen's centre just enough
  const m = [H[0][0], H[1][0], 0, H[2][0], H[0][1], H[1][1], 0, H[2][1], 0, 0, 1, 0, H[0][2], H[1][2], 0, H[2][2]].map((v) => v / n);
  cv.style.transformOrigin = '0 0'; cv.style.transform = `matrix3d(${m.map((v) => +v.toPrecision(9)).join(',')})`;
}
async function drawViewer(t, sharp){
  if (!open) return; const me = open;
  const room = await me.room; let S; try { S = await sets(vspace); } catch (e) { toast('That tile is not saved on this device yet.'); return; }
  if (open !== me) return;
  const fit = fitOf(room), dpr = Math.min(2, window.devicePixelRatio || 1) * (sharp || STILL ? 1 : q);
  const w = Math.min(room.j.W, Math.max(320, Math.round(room.j.W * fit * dpr)));
  const cv = eng.render(room, S, { width: w, live: me.live, time: t === undefined ? me.t : t, par: null });
  if (t !== undefined) me.t = t;
  const cw = Math.round(room.j.W * fit), ch = Math.round(room.j.H * fit);
  if (cv.style.width !== cw + 'px' || cv.style.height !== ch + 'px'){ cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; }
  const fo = FOCUS[me.id] || [.5, .8];
  me.oy = Math.max(0, ch - $('stage').clientHeight) * (.5 - fo[1]);       // taller than the screen: keep more floor than ceiling
  me.ox = Math.max(0, cw - $('stage').clientWidth) * (.5 - fo[0]);
  const K = { f: room.j.f * fit, cx: room.j.cx * fit, cy: room.j.cy * fit, cw, ch }, moved = !me.K || me.K.cw !== cw || me.K.ch !== ch; me.K = K;
  placeFrame(); if (moved && !lookOK(look.oy, look.op)) lookReset(); lookApply();
}
function loop(){
  cancelAnimationFrame(raf); if (!open) return;
  const t0 = performance.now(); let last = t0, acc = 0, n = 0;
  const step = (now) => {
    if (!open) return; raf = requestAnimationFrame(step);
    const e = STILL ? 1 : .22, dy = look.y - look.sy, dp = look.p - look.sp;
    if (Math.abs(dy) > 1e-5 || Math.abs(dp) > 1e-5){ look.sy += dy * e; look.sp += dp * e; lookApply(); }
    if (!open.live || busy || now - last < 33) return;
    const dt = now - last; last = now; const t = (now - t0) / 1000;
    acc += dt; if (++n === 24){ if (!QLOCK && acc / n > 62 && q > .5) q = Math.max(.5, q - .17); acc = 0; n = 0; }   // slow device: draw the moving picture a little smaller
    busy = true; drawViewer(t).finally(() => { busy = false; });
  };
  raf = requestAnimationFrame(step);
}
// the rooms the full-screen view moves through: the three bathrooms, or the rooms of the hall's space (a terrace-only pair stays on the terrace)
function vlist(){
  if (oneList) return oneList;
  if (kit()) return SPACES[vspace].rooms.map(roomOf);
  if (!floorOnly()) return cards; const d = byCode(fstate[vspace]);
  return SPACES[vspace].rooms.filter(id => !(d && d.terrace && id === 'p1')).map(roomOf);
}
function navs(){ const one = vlist().length < 2; $('prev').hidden = $('next').hidden = one; if (open) $('vcount').textContent = one ? '' : `${open.i + 1} / ${vlist().length}`; }
async function show(i){
  const L = vlist(), c = L[(i % L.length + L.length) % L.length], room = await c.room;
  if (oneList && c.sp !== vspace){ vspace = c.sp; $('viewer').classList.toggle('fo', floorOnly() || kit()); drawPicks(); }
  open = { ...c, i: L.indexOf(c), live: liveOf(room), oy: 0, ox: 0, t: 0, name: room.j.name }; look.y = look.p = look.sy = look.sp = look.oy = look.op = 0;
  $('vname').textContent = room.j.name; navs(); drawPair();
  $('vbg').style.backgroundImage = `url("${asset(`rooms/${c.id}/thumb.jpg`)}")`;
  await drawViewer(0);
}
async function openViewer(c, soft, sp = 'bath'){
  vspace = sp; $('viewer').classList.toggle('fo', floorOnly() || kit()); drawPicks();
  $('viewer').classList.toggle('fadein', !!soft);
  $('frame').appendChild(eng.canvas); $('viewer').classList.remove('bare'); $('viewer').classList.add('on'); document.body.style.overflow = 'hidden';
  history.pushState({ v: 1 }, ''); setFrame(0, 1);
  await show(Math.max(0, vlist().findIndex(v => v.id === c.id))); loop();
  if (!store.get('drb-hint2')){ store.set('drb-hint2', '1'); toast(`Drag the picture to look round. The arrows show the next ${kit() ? 'kitchen' : floorOnly() ? 'room' : 'bathroom'}.`); }
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
// drag = look round (the picture follows the finger), short tap = hide or show the buttons. The arrows and the keyboard change the room.
{
  const st = $('stage');
  st.addEventListener('pointerdown', (e) => { if (going || !open) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), go: false }; try { st.setPointerCapture(e.pointerId); } catch (er) {} });
  st.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || !open || !open.K) return;
    if (!drag.go && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.go = true;
    if (!drag.go) return;
    const f = open.K.f; lookTo(look.y - (e.clientX - drag.lx) / f, look.p + (e.clientY - drag.ly) / f); drag.lx = e.clientX; drag.ly = e.clientY;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; const dt = performance.now() - d.t;
    if (e.type === 'pointerup') motionAsk();                 // iPhone and iPad share motion only after a tap
    if (!d.go && e.type === 'pointerup' && dt < 450) $('viewer').classList.toggle('bare');
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
}
// moving the phone turns the view the same way (a window into the room). The phone's facing direction is worked out from all three angles,
// so it is the same held upright, flat or sideways.
const needAsk = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
function onMotion(e){
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  const r = Math.PI / 180, ca = Math.cos(e.alpha * r), sa = Math.sin(e.alpha * r), cb = Math.cos(e.beta * r), sb = Math.sin(e.beta * r), cg = Math.cos(e.gamma * r), sg = Math.sin(e.gamma * r);
  const vx = -ca * sg - sa * sb * cg, vy = -sa * sg + ca * sb * cg, vz = -cb * cg;      // the direction the back of the phone faces (east, north, up)
  if (Math.abs(vz) > .93){ look.last = null; return; }                                  // lying flat: no sure left or right
  const yaw = Math.atan2(vx, vy), pit = Math.asin(Math.max(-1, Math.min(1, vz)));
  if (look.last && open && open.K && !drag && !zm){
    let dy = yaw - look.last[0]; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    const dp = pit - look.last[1];
    if (Math.abs(dy) < .25 && Math.abs(dp) < .25) lookTo(look.y + dy, look.p + dp);
  }
  look.last = [yaw, pit];
}
function motionOn(){ if (look.on) return; look.on = true; look.last = null; window.addEventListener('deviceorientation', onMotion); }
function motionAsk(){
  if (STILL || look.on || !needAsk || store.get('drb-motion') === '0') return;
  DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted'){ store.set('drb-motion', '1'); motionOn(); } else store.set('drb-motion', '0'); }).catch(() => {});
}
if (!STILL && !needAsk && 'DeviceOrientationEvent' in window) motionOn();

async function picture(){
  const room = await open.room, S = await sets(vspace);
  const src = eng.render(room, S, { width: room.j.W, live: false, grain: .01 });
  const W = src.width, band = Math.round(Math.max(96, W * .06)), H = src.height + band;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#F5F2EC'; x.fillRect(0, 0, W, H); x.drawImage(src, 0, 0);
  const logo = document.querySelector('header.top img'); const lh = band * .5, lw = lh * logo.naturalWidth / logo.naturalHeight, pad = band * .28;
  x.drawImage(logo, pad, src.height + (band - lh) / 2, lw, lh);
  x.fillStyle = '#343A3B'; x.textBaseline = 'middle'; x.font = `500 ${Math.round(band * .24)}px "Hanken Grotesk", system-ui, sans-serif`;
  const line = oneList ? oneD().name : kit() ? KSLOTS.map(([k, n]) => `${n}: ${byCode(kstate[k]).name}`).join('   ·   ') : floorOnly() ? `Floor: ${byCode(fstate[vspace]).name}` : SLOTS.map(([k, n]) => `${n}: ${byCode(state[k]).name}`).join('   ·   ');
  x.fillText(line, pad * 2 + lw, src.height + band * .4, W - pad * 3 - lw);
  x.fillStyle = '#6F7574'; x.font = `400 ${Math.round(band * .19)}px "Hanken Grotesk", system-ui, sans-serif`;
  x.fillText('Design visualisation  ·  drambay.com', pad * 2 + lw, src.height + band * .72, W - pad * 3 - lw);
  drawViewer();
  return new Promise(r => c.toBlob(r, 'image/jpeg', .92));
}
const words = () => { if (oneList){ const d = oneD(); return `${d.name} (${d.pair ? d.pair.join(' + ') : d.code})`; } if (kit()) return KSLOTS.map(([k, n]) => { const d = byCode(kstate[k]); return `${n}: ${d.name} (${d.code})`; }).join('\n'); if (floorOnly()){ const d = byCode(fstate[vspace]); return `Floor: ${d.name} (${d.pair ? d.pair.join(' + ') : d.code})`; } return SLOTS.map(([k, n]) => { const d = byCode(state[k]); return `${n}: ${d.name} (${d.code})`; }).join('\n'); };
const what = () => kit() ? 'kitchen' : floorOnly() && open ? open.name.toLowerCase() : 'bathroom';
let oneDesign = null; const oneD = () => oneDesign;
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
  const t = `Hi Drambay, I liked this ${kit() ? 'kitchen' : floorOnly() ? 'floor for a ' + what() : 'bathroom'} in Rooms Studio.\n${words()}\nPlease share details.`;
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
  out: [['DRB-5050-001+DRB-5050-002', 't1'], ['DRB-5050-013+DRB-5050-014', 'p1'], ['DRB-6060-038', 't1'], ['DRB-5050-009+DRB-5050-010', 'p1'], ['DRB-6060-001', 't1'], ['DRB-6060-023', 'p1'],
        ['DRB-5050-011+DRB-5050-012', 't1'], ['DRB-5050-006+DRB-5050-007', 'p1'], ['DRB-6060-016+DRB-6060-017', 't1'], ['DRB-6060-003', 'p1'], ['DRB-6060-018+DRB-6060-019', 't1'], ['DRB-6060-005', 'p1']],
};
// the kitchen's bays: [the slab on show, the floor under it, kitchen]. Each of the 11 slabs once, the first one again in the other kitchen.
const KBAYS = [['DRB-8024-001', 'DRB-6012-003', 'k1'], ['DRB-8024-005', 'DRB-6012-053', 'k2'], ['DRB-8024-004', 'DRB-6012-016', 'k1'], ['DRB-8024-003', 'DRB-6012-060', 'k2'],
  ['DRB-8024-006', 'DRB-6012-042', 'k1'], ['DRB-8024-009', 'DRB-6012-012', 'k2'], ['DRB-8024-007', 'DRB-6012-026', 'k1'], ['DRB-8024-002', 'DRB-6012-025', 'k2'],
  ['DRB-8024-010', 'DRB-6012-005', 'k1'], ['DRB-8024-008', 'DRB-6012-007', 'k2'], ['DRB-8024-011', 'DRB-6012-021', 'k1'], ['DRB-8024-001', 'DRB-6012-015', 'k2']];
let hall = null, hallOn = false, skipPop = false;
function jointOf(t){            // same joint rule as the rooms: light tile dark joint, beige tile brown joint, dark tile light joint
  if (!t) return [94, 92, 92]; const [L, a, b] = t;
  if (L < 35 && b > 4) return [190, 182, 168]; if (L < 35) return [126, 128, 128];
  if (b > 6 && L >= 55) return [104, 74, 52]; if (b > 5 && a >= 2 && L < 55) return [190, 182, 168];
  return L >= 62 ? [60, 58, 58] : [94, 92, 92];
}
const bayOf = ([w, f, x, base]) => { const d = byCode(w); return { design: d, name: d.name, meta: `${FIN[d.finish] || d.finishEn}  ·  ${d.size[0]} x ${d.size[1]} mm`, joint: jointOf(TONE[d.code]), combo: { wall: w, floor: f, feature: x }, base, focusY: base === 'r7' ? .62 : .5 }; };
const floorBay = ([f, base]) => { const d = byCode(f); return { design: d, name: d.name, meta: `${FIN[d.finish] || d.finishEn}  ·  ${d.size[0]} x ${d.size[1]} mm`, joint: jointOf(TONE[d.code]), combo: { floor: f }, base, focusY: .5 }; };
const kitBay = ([sl, f, base]) => { const d = byCode(sl); return { design: d, name: d.name, meta: `${FIN[d.finish] || d.finishEn}  ·  ${d.size[0]} x ${d.size[1]} mm`, joint: jointOf(TONE[d.code]), combo: { floor: f, wall: sl, feature: sl }, base, sp: 'kitchen', focusY: base === 'k1' ? .8 : .72 }; };
// the twelve bays of a space (a design that cannot be shown is replaced by the next one that can, so the ring always has twelve)
function hallRows(sp){
  if (DEALER) return autoRows(sp);
  if (sp === 'bath') return BAYS.filter(r => r.slice(0, 3).every(c => byCode(c) && MH_ok(byCode(c)))).map(bayOf);
  const kt = !!SPACES[sp].kit, ok = (kt ? KBAYS.filter(r => byCode(r[0]) && isSlab(byCode(r[0])) && byCode(r[1]) && fitsIn(sp, byCode(r[1]), 'floor')) : FLOORS[sp].filter(r => byCode(r[0]) && fitsIn(sp, byCode(r[0])))), rows = [];
  for (let i = 0; ok.length && rows.length < 12; i++) rows.push(ok[i % ok.length]);
  return rows.map(kt ? kitBay : floorBay);
}
let bays = [];
// a bay that shows a decor tile: the decor on the highlighter wall, its plain tile on the floor and the other walls; the label and the panel are the decor
function decorBay(d, base){
  const p = plainFor(d); if (!p) return null;
  return Object.assign(bayOf([p.code, p.code, d.code, base]), { design: d, name: d.name, meta: `${FIN[d.finish] || d.finishEn}  ·  ${d.size[0]} x ${d.size[1]} mm`, joint: jointOf(TONE[d.code]) });
}
// a dealer's display: his own designs take the twelve bays in turn (the list goes round again when he has fewer than twelve)
function autoRows(sp, mixed){
  const T = (d) => TONE[d.code] || [70, 0, 0], sh = (a) => mixed ? a.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(v => v[1]) : a;
  if (sp === 'bath'){
    const pool = sh(designs.filter(d => fits(d, 'wall') && fits(d, 'floor'))), calm = pool.filter(d => T(d)[0] >= 78), bases = ['r3', 'r7', 'r6']; if (!pool.length) return [];
    return Array.from({ length: 12 }, (_, i) => { const d = pool[i % pool.length]; return bayOf([d.code, T(d)[0] < 60 && calm.length ? calm[i % calm.length].code : d.code, d.code, bases[i % 3]]); });
  }
  const pool = sh(designs.filter(d => fitsIn(sp, d))), bases = SPACES[sp].rooms; if (!pool.length) return [];
  if (SPACES[sp].kit) return Array.from({ length: 12 }, (_, i) => { const d = pool[i % pool.length], f = floorFor(d); return f ? kitBay([d.code, f.code, bases[i % bases.length]]) : null; }).filter(Boolean);      // his slabs, each on a floor of his own
  return Array.from({ length: 12 }, (_, i) => { const d = pool[i % pool.length]; return floorBay([d.code, d.terrace ? 't1' : bases[i % bases.length]]); });
}
const hcount = (i) => { const n = oneList ? oneList.length : bays.length; $('hcount').textContent = oneList && n < 2 ? '' : `${i % n + 1} / ${n}`; };
/* surprise me, in the hall: twelve other designs take the bays. Light and dark alternate; a dark design gets a calm light floor */
function hallSurprise(){
  if (!hall || hall.anim) return;
  if (DEALER){ bays = autoRows(hspace, true); hall.spin(); setTimeout(() => { hall.setBays(bays); hcount(hall.active); }, STILL ? 0 : 330); $('hshuffle').classList.toggle('spin'); return; }
  const T = (d) => TONE[d.code], ch = (t) => Math.hypot(t[1], t[2]), mix = (a) => a.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(v => v[1]);
  const now = new Set(bays.map(b => b.design.code));
  if (SPACES[hspace].kit){
    // the kitchen: the slabs in a new order, each over another floor that stands a clear step away from it in tone
    const slabs = mix(designs.filter(d => fitsIn(hspace, d))), floors = designs.filter(d => fitsIn(hspace, d, 'floor') && T(d)), L = (d) => (T(d) || [60])[0]; if (!slabs.length || !floors.length) return;
    if (slabs.length > 1 && slabs[0].code === bays[hall.active % bays.length].design.code) slabs.push(slabs.shift());
    bays = Array.from({ length: 12 }, (_, i) => { const sl = slabs[i % slabs.length], far = floors.filter(d => Math.abs(L(d) - L(sl)) >= 30), src = far.length ? far : floors; return kitBay([sl.code, src[Math.floor(Math.random() * src.length)].code, SPACES[hspace].rooms[i % 2]]); });
    hall.spin(); setTimeout(() => { hall.setBays(bays); hcount(hall.active); }, STILL ? 0 : 330); $('hshuffle').classList.toggle('spin'); return;
  }
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
    bays = rows.map(floorBay); hall.spin(); setTimeout(() => { hall.setBays(bays); hcount(hall.active); }, STILL ? 0 : 330);
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
  bays = rows.map(bayOf);
  { const dec = designs.filter(d => decor(d) && fits(d, 'feature') && !now.has(d.code)), at = 2 + Math.floor(Math.random() * 9), b = dec.length && decorBay(dec[Math.floor(Math.random() * dec.length)], bays[at].base); if (b) bays[at] = b; }      // one bay in twelve shows a decor tile as a highlighter wall
  hall.spin(); setTimeout(() => { hall.setBays(bays); hcount(hall.active); }, STILL ? 0 : 330);
  $('hshuffle').classList.toggle('spin');
}
function buildHall(){
  if (!oneList){ if (SPACES[Q.get('space')]) hspace = Q.get('space'); if (!spaceOK(hspace)) hspace = Object.keys(SPACES).find(spaceOK) || hspace; bays = hallRows(hspace); drawSpaces(); }
  hall = new Hall($('hallcv'), {
    bays, still: STILL, faceUrl: (n) => face(n, 640), slabCrop: (code) => SLAB_CLEAN[code], logo: asset('logo-white.svg'), onZoom: (i) => { const d = bays[i] && bays[i].design; if (d) openZoom([{ d, label: 'Tile' }]); },
    paint: async (b, put, w) => {
      const room = await roomOf(b.base).room; let S;
      for (;;){ S = {}; for (const k of ['floor', 'wall', 'feature']) S[k] = b.combo[k] ? await eng.loadSet(byCode(b.combo[k]), full) : S.floor; if (!open) break; await wait(200); }
      const h = w * WIN[3] / WIN[2], cv = eng.render(room, S, { width: Math.min(room.j.W, Math.ceil(Math.max(w, h * room.j.W / room.j.H))), grain: .008 });
      put(cv, cv.width, cv.height);
    },
    onMove: (on) => $('hall').classList.toggle('going', on),
    onBay: (i) => hcount(i),
    onEnter: (i) => {
      const b = bays[i];
      if (oneList){ openViewer(oneList[i % oneList.length], true, b.sp); return; }      // one-design link: every bay is this tile in one of its rooms
      if (b.sp === 'kitchen'){ kstate.slab = b.combo.wall; kstate.floor = b.combo.floor; save(); openViewer(roomOf(b.base), true, 'kitchen'); return; }
      if (b.combo.wall){ Object.assign(state, b.combo); save(); openViewer(cards.find(c => c.id === b.base), true); }
      else { fstate[hspace] = b.combo.floor; save(); openViewer(roomOf(b.base), true, hspace); }
    },
  });
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('400 50px Newsreader'), document.fonts.load('500 27px "Hanken Grotesk"')]).then(() => hall.refresh()).catch(() => {});
}
/* the hall's spaces: Bathrooms, Living room, Terrace and parking. The name at the top left opens the list */
function drawSpaces(){
  $('hsname').textContent = SPACES[hspace].name; $('hstep').textContent = hspace === 'bath' ? 'Step into this bathroom' : SPACES[hspace].kit ? 'Step into this kitchen' : 'Step into this room';
  const m = $('hmenu'); m.innerHTML = '';
  for (const k in SPACES){ if (!spaceOK(k)) continue; const b = document.createElement('button'); b.type = 'button'; b.textContent = SPACES[k].name; b.setAttribute('role', 'menuitem'); if (k === hspace) b.setAttribute('aria-current', 'true'); b.onclick = () => { spaceMenu(false); setSpace(k); }; m.appendChild(b); }
}
function spaceMenu(on){ clearTimeout(spaceMenu.t); $('hmenu').hidden = !on; $('hspace').setAttribute('aria-expanded', on); }
function setSpace(k){
  if (!hall || hall.anim || k === hspace || !SPACES[k]) return;
  const rows = hallRows(k); if (rows.length < 12) { toast('These floors are not saved on this device yet. Connect once to load them.'); return; }
  hspace = k; bays = rows; drawSpaces(); hall.spin();
  setTimeout(() => { hall.setBays(bays); hcount(hall.active); }, STILL ? 0 : 330);
}
function placeHallNav(){ if (hall) $('hall').style.setProperty('--ringy', Math.round(hall.ringY()) + 'px'); }
// the hall as the tool's front door (?walk=1 and ?pick=CODE): it is the first and last screen, with no choose-your-tiles page in between.
// Its X leaves the tool: back to the page the visitor came from, else to the site's home, else (no site around it) to the choose-your-tiles page.
function hallFront(){ hallHome = true; $('hall').classList.add('home', 'exit'); }
function leave(){
  let ref = ''; try { const r = new URL(document.referrer); if (r.origin === location.origin && r.pathname !== location.pathname) ref = r.href; } catch (e) {}
  if (ref){ if (history.length > 1) history.back(); else location.href = ref; return; }
  const a = document.querySelector('header.top a[href]'); location.href = a ? a.href : location.pathname;
}
function openHall(){
  if (hallOn) return;
  try { if (!hall) buildHall(); } catch (e) { toast('This device cannot draw the display hall.'); return; }
  hallOn = true; $('hall').classList.add('on'); document.body.style.overflow = 'hidden'; if (!hallHome) history.pushState({ h: 1 }, '');
  $('hall').classList.remove('going'); hall.open(); placeHallNav();
  if (!store.get('drb-hallhint')){ store.set('drb-hallhint', '1'); toast('Drag to look around. Tap the circle on the floor to step inside.'); }
  if (!oneList && !store.get('drb-spacehint')){ store.set('drb-spacehint', '1'); spaceMenu(true); spaceMenu.t = setTimeout(() => spaceMenu(false), 4200); }      // shown once: the list of spaces
}
function closeHall(pop){
  if (!hallOn || hallHome) return; hallOn = false; spaceMenu(false); hall.close(); $('hall').classList.remove('on'); document.body.style.overflow = '';
  if (!pop && history.state && history.state.h){ skipPop = true; history.back(); }
  renderGrid();
}

/* ---------- tile close-up: the whole tile floats over the picture; pinch, scroll or double tap to see the graining ---------- */
let zm = null;
const hiRes = (n) => face(n, 2800);
// from a mockup: the tiles of this look. From the hall: the design of the bay in front.
function zoomLook(){
  if (!open) return;
  if (oneList) return openZoom([{ d: oneD(), label: 'Tile' }]);
  if (kit()) return openZoom(KSLOTS.map(([k, label]) => ({ d: byCode(kstate[k]), label })));
  if (floorOnly()) return openZoom([{ d: byCode(fstate[vspace]), label: 'Floor' }]);
  const seen = [], items = [];
  for (const [k, name] of SLOTS){ const d = byCode(state[k]); const at = seen.indexOf(d.code); if (at < 0){ seen.push(d.code); items.push({ d, label: name }); } }
  openZoom(items);
}
function openZoom(items){
  items = items.filter(it => it.d && it.d.faces && it.d.faces.length); if (!items.length) return;
  zm = { items, i: 0, f: 0, s: 1, x: 0, y: 0, tok: 0, w: 0, h: 0, turn: false, ptr: new Map(), lastTap: 0 };
  cancelAnimationFrame(raf);                                  // the moving picture rests while the tile is in front of it
  $('zoom').classList.add('on'); history.pushState({ z: 1 }, ''); zoomTabs(); zoomShow();
  if (!store.get('drb-zoomhint')){ store.set('drb-zoomhint', '1'); toast(matchMedia('(pointer: coarse)').matches ? 'Pinch or double tap to see the graining.' : 'Scroll or double click to see the graining.'); }
}
function closeZoom(pop){
  if (!zm) return; zm = null; $('zoom').classList.remove('on', 'zin'); $('zimg').removeAttribute('src');
  if (!pop && history.state && history.state.z){ skipPop = true; history.back(); }
  if (open) loop();
}
function zoomTabs(){
  const host = $('ztabs'); host.innerHTML = ''; const many = zm.items.length > 1;
  zm.items.forEach((it, i) => {
    const faces = it.d.faces.slice(0, many ? 2 : 6); if (!many && faces.length < 2) return;
    if (many){ const t = document.createElement('span'); t.textContent = it.label; host.appendChild(t); }
    faces.forEach((n, f) => { const b = document.createElement('button'); b.type = 'button'; b.style.backgroundImage = `url("${thumb(n)}")`; b.setAttribute('aria-label', `${it.d.name}, tile ${f + 1}`); b.setAttribute('aria-pressed', i === zm.i && f === zm.f); b.onclick = () => { zm.i = i; zm.f = f; zoomTabs(); zoomShow(); }; host.appendChild(b); });
  });
}
function zoomShow(){
  const z = zm, d = z.items[z.i].d, n = d.faces[z.f], me = ++z.tok, img = $('zimg');
  const one = d.pair ? byCode(d.pair[z.f]) || d : d;
  $('zname').textContent = one.name; $('zmeta').textContent = `${FIN[d.finish] || d.finishEn}  ·  ${d.size[0]} x ${d.size[1]} mm`;
  z.s = 1; z.x = 0; z.y = 0; z.n = n; z.res = 0; z.ratio = Math.max(...d.size) / Math.min(...d.size); z.nat = null; img.removeAttribute('src'); zoomPlace();
  // sharper in steps: the picture already on this device first, then the full one, then the largest when zoomed in
  const step = (url, res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { if (!zm || z.tok !== me || res <= z.res) return; z.res = res; z.nat = [im.naturalWidth, im.naturalHeight]; img.src = url; zoomPlace(); }; im.src = url; };
  step(face(n, 640), 1); step(full(n), 2); z.more = () => { z.more = null; step(hiRes(n), 3); };
}
// the tile sits whole in the middle with air around it; long tiles lie the way the screen is longer
function zoomPlace(){
  const z = zm; if (!z) return; const st = $('zstage'), W = st.clientWidth, H = st.clientHeight, img = $('zimg');
  const tall = z.nat ? z.nat[1] > z.nat[0] * 1.05 : false, wide = z.nat ? z.nat[0] > z.nat[1] * 1.05 : false;
  const wantTall = H > W * 1.1; z.turn = (tall && !wantTall) || (wide && wantTall);
  let r = z.nat ? z.nat[0] / z.nat[1] : (wantTall ? 1 / z.ratio : z.ratio); if (z.turn) r = 1 / r;
  const mw = W * (W < 600 ? .86 : .7), mh = H - (W < 600 ? 250 : 230), bw = Math.min(mw, mh * r), bh = bw / r;
  z.w = bw; z.h = bh;
  const s = z.s, tw = bw * s, th = bh * s, lx = Math.max(0, (tw - W) / 2 + (s > 1 ? W * .3 : 0)), ly = Math.max(0, (th - H) / 2 + (s > 1 ? H * .3 : 0));
  z.x = Math.max(-lx, Math.min(lx, z.x)); z.y = Math.max(-ly, Math.min(ly, z.y));
  const t = $('ztile'); t.style.width = tw + 'px'; t.style.height = th + 'px'; t.style.transform = `translate(${-tw / 2 + z.x}px, ${-th / 2 + z.y - (s > 1 ? 0 : 8)}px)`;
  if (z.turn){ img.style.width = th + 'px'; img.style.height = tw + 'px'; img.style.transform = 'translate(-50%, -50%) rotate(90deg)'; }
  else { img.style.width = tw + 'px'; img.style.height = th + 'px'; img.style.transform = 'translate(-50%, -50%)'; }
  $('zoom').classList.toggle('zin', s > 1.02);
  if (s > 1.5 && z.more) z.more();
}
function zoomTo(s2, px, py){                   // keep the point under the finger where it is
  const z = zm, st = $('zstage'), cx = px - st.clientWidth / 2, cy = py - st.clientHeight / 2; const top = z.nat ? Math.max(2.5, Math.min(8, 1.6 * Math.max(...z.nat) / Math.max(z.w, z.h))) : 2.5; s2 = Math.max(1, Math.min(top, s2));      // never far past what the picture really holds
  const k = s2 / z.s; z.x = cx - (cx - z.x) * k; z.y = cy - (cy - z.y) * k; z.s = s2; if (s2 === 1){ z.x = 0; z.y = 0; } zoomPlace();
}
{
  const st = $('zstage'), onTile = (e) => { const r = $('ztile').getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  st.addEventListener('pointerdown', (e) => {
    if (!zm) return; const z = zm; z.ptr.set(e.pointerId, [e.clientX, e.clientY]); try { st.setPointerCapture(e.pointerId); } catch (er) {}
    if (z.ptr.size === 1) z.g = { x: e.clientX, y: e.clientY, t: performance.now(), far: 0, on: onTile(e) };
    else if (z.ptr.size === 2){ const [a, b] = [...z.ptr.values()]; z.pin = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: z.s }; z.g = null; }
  });
  st.addEventListener('pointermove', (e) => {
    const z = zm; if (!z || !z.ptr.has(e.pointerId)) return; const was = z.ptr.get(e.pointerId); z.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (z.ptr.size >= 2 && z.pin){ const [a, b] = [...z.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, r = st.getBoundingClientRect(); zoomTo(z.pin.s * d / z.pin.d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); return; }
    if (z.g){ z.g.far = Math.max(z.g.far, Math.hypot(e.clientX - z.g.x, e.clientY - z.g.y)); if (z.s > 1){ z.x += e.clientX - was[0]; z.y += e.clientY - was[1]; zoomPlace(); } }
  });
  const end = (e) => {
    const z = zm; if (!z || !z.ptr.has(e.pointerId)) return; z.ptr.delete(e.pointerId); if (z.ptr.size < 2) z.pin = null;
    const g = z.g; if (z.ptr.size) { z.g = null; return; } z.g = null;
    if (!g || e.type !== 'pointerup' || g.far > 10 || performance.now() - g.t > 500) return;
    const now = performance.now(), r = st.getBoundingClientRect();
    if (!g.on && z.s <= 1.02){ closeZoom(); return; }                                         // a tap on the air around the tile closes it
    if (now - z.lastTap < 400){ z.lastTap = 0; zoomTo(z.s > 1.02 ? 1 : 3, e.clientX - r.left, e.clientY - r.top); } else z.lastTap = now;
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('wheel', (e) => { if (!zm) return; e.preventDefault(); const r = st.getBoundingClientRect(); zoomTo(zm.s * Math.exp(-e.deltaY * .0022), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  $('zclose').onclick = () => closeZoom(); addEventListener('resize', () => zm && zoomPlace());
  addEventListener('keydown', (e) => { if (!zm) return; e.stopImmediatePropagation(); if (e.key === 'Escape') closeZoom(); }, true);
}

/* ---------- surprise me inside a mockup: another look for the room on screen ---------- */
function viewSurprise(){
  if (!open) return; $('vshuffle').classList.toggle('spin');
  if (kit()) return kitSurprise();
  if (!floorOnly()) return surprise();
  const cur = byCode(fstate[vspace]), T = (d) => TONE[d.code];
  let pool = designs.filter(d => fitsIn(vspace, d) && T(d) && d.code !== cur.code && !(d.terrace && open.id === 'p1')); if (!pool.length) return;
  const flip = pool.filter(d => (T(d)[0] >= 60) !== (T(cur)[0] >= 60)); if (flip.length >= 3) pool = flip;      // light after dark, dark after light: a clear change each time
  fstate[vspace] = pool[Math.floor(Math.random() * pool.length)].code; changed();
}

// the kitchen on screen: another slab (dark after light, light after dark) and another floor, a clear step away from the slab in tone
function kitSurprise(){
  const L = (d) => (TONE[d.code] || [60])[0], pick = (a) => a[Math.floor(Math.random() * a.length)];
  const cur = byCode(kstate.slab), slabs = designs.filter(d => fitsIn(vspace, d) && d.code !== cur.code); if (!slabs.length) return;
  const flip = slabs.filter(d => (L(d) >= 50) !== (L(cur) >= 50)), slab = pick(flip.length ? flip : slabs);
  const floors = designs.filter(d => fitsIn(vspace, d, 'floor') && TONE[d.code] && d.code !== kstate.floor), far = floors.filter(d => Math.abs(L(d) - L(slab)) >= 30);
  kstate.slab = slab.code; if (floors.length) kstate.floor = pick(far.length ? far : floors).code; changed();
}
/* ---------- surprise me: a new combination that follows a simple colour rule ---------- */
function surprise(){
  const T = (d) => TONE[d.code], ch = (t) => Math.hypot(t[1], t[2]), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const A = designs.filter(d => fits(d, 'wall') && T(d)); if (A.length < 3) return;
  const walls = A.filter(d => T(d)[0] >= 72 && ch(T(d)) <= 12 && d.code !== state.wall);                  // walls: light and calm
  const wall = pick(walls.length ? walls : A), Lw = T(wall)[0];
  const same = designs.filter(d => fits(d, 'feature') && T(d) && d.code !== wall.code && sizeOf(d) === sizeOf(wall));      // decor tiles join here, and only here
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
  $('fins').hidden = fins.size < 2 || pickSlot === 'slab';      // the product list states no surface finish for most slabs: no Glossy / Matt sorting there
  chips($('fins'), [['all', 'Any finish'], ['Glossy', 'Glossy'], ['Matt', 'Matt']], finF, (v) => { finF = v; drawChips(); drawList(); });
  const pr = pickSpace === 'out' && pool.some((d) => d.pair);                       // terrace and parking: the crisscross pairs on their own
  $('pairf').hidden = !pr; if (pr) chips($('pairf'), [['all', 'All floors'], ['pair', 'Crisscross pairs'], ['one', 'Single tiles']], pairF, (v) => { pairF = v; drawList(); drawChips(); });
}
const fitP = (d) => fitsIn(pickSpace, d, pickSlot) && !(d.terrace && open && open.id === 'p1');
function openPicker(slot){
  pickSpace = open ? vspace : 'bath'; pickSlot = slot; sizeF = 'all'; finF = 'all'; pairF = 'all'; $('q').value = '';
  $('sheetTitle').textContent = { floor: 'Floor tile', wall: 'Wall tile', feature: 'Highlighter wall tile', slab: 'Kitchen slab' }[slot];
  drawChips(); drawList(); $('sheet').classList.add('on'); $('list').scrollTop = 0;
}
function drawList(){
  const q = $('q').value.trim().toLowerCase(), L = $('list'); L.innerHTML = '';
  const fr = document.createDocumentFragment();
  const cur = SPACES[pickSpace].kit ? kstate[pickSlot] : SPACES[pickSpace].floorOnly ? fstate[pickSpace] : state[pickSlot];
  const rows = designs.filter(d => fitP(d) && (pairF === 'all' || pickSpace !== 'out' || (pairF === 'pair') === !!d.pair) && (sizeF === 'all' || sizeOf(d) === sizeF) && (finF === 'all' || finCat(d) === finF) && (!q || d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)));
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
// the crisscross choices for the floor on show: each of its tiles on its own (a 500 x 500 tile never alone) and every pair it belongs to
function pairOpts(){
  if (!open || vspace !== 'out' || oneList) return [];
  const d = byCode(fstate.out); if (!d) return []; const base = d.pair || [d.code];
  const ok = (x) => x && fitsIn('out', x) && !(x.terrace && open.id === 'p1');
  const L = [...base.map(byCode), ...designs.filter((x) => x.pair && x.pair.some((c) => base.includes(c)))].filter(ok);
  return L.filter((x, i) => L.findIndex((y) => y.code === x.code) === i);
}
function drawPair(){                                         // a second card beside the floor: how it is laid (on its own, or the crisscross pair)
  const old = $('vpair'); if (old) old.remove();
  const L = pairOpts(), d = byCode(fstate.out); if (L.length < 2 || !d) return;
  const nx = L[(L.findIndex((x) => x.code === d.code) + 1) % L.length];
  const b = document.createElement('button'); b.className = 'slot pairc'; b.type = 'button'; b.id = 'vpair';
  b.innerHTML = '<i class="sw"></i><span><small>Tap for</small><b></b></span>';
  b.querySelector('.sw').style.backgroundImage = nx.faces.slice(0, 2).map((f) => `url("${thumb(f)}")`).join(',');
  b.querySelector('b').textContent = nx.pair ? (d.pair ? 'Other pair' : 'Crisscross') : 'Single tile';
  b.setAttribute('aria-label', nx.pair ? `Lay as a crisscross pair: ${nx.name}` : `Lay ${nx.name} on its own`); b.onclick = nextPair;
  $('vpicks').appendChild(b);
}
function nextPair(){
  const L = pairOpts(), d = byCode(fstate.out); if (L.length < 2) return;
  const nx = L[(L.findIndex((x) => x.code === d.code) + 1) % L.length]; fstate.out = nx.code; changed(); toast(nx.pair ? `Crisscross: ${nx.name}` : `${nx.name} on its own`);
}
function choose(code){ if (SPACES[pickSpace].kit) kstate[pickSlot] = code; else if (SPACES[pickSpace].floorOnly) fstate[pickSpace] = code; else state[pickSlot] = code; $('sheet').classList.remove('on'); changed(); }

/* ---------- offline + install ---------- */
async function saveOffline(){
  const b = $('offline'); if (!('caches' in window)) { toast('This browser cannot save for offline.'); return; }
  b.disabled = true;
  const urls = new Set();
  designs.filter(d => fits(d, 'floor') || fitsIn('living', d) || fitsIn('out', d) || isSlab(d)).forEach(d => { urls.add(thumb(d.faces[0])); d.faces.slice(0, 4).forEach(f => MH[f] && urls.add(full(f))); });
  [...BAYS, ...FLOORS.living, ...FLOORS.out, ...KBAYS].forEach(r => { const d = byCode(r[0]); if (d) d.faces.slice(0, 6).forEach(f => MH[f] && urls.add(face(f, 640))); });      // the display hall's panels
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
/* ---------- one-design link (?tile=CODE): a dealer or a customer scans one tile and sees only that tile, in every room it suits ---------- */
async function startOne(){
  const want = ONE.trim().toUpperCase().replace(/\s+/g, '+');
  let d = designs.find(x => x.code.toUpperCase() === want);
  if (d && d.half) d = designs.find(x => x.pair && x.pair.includes(d.code) && x.size[0] === 500) || d;      // a 500 x 500 dark or light tile is always shown as its pair
  const L = [];
  if (d && decor(d) && fits(d, 'feature')){      // a decor tile: highlighter wall only, with its plain tile on the rest
    const p = plainFor(d); if (p){ state.floor = state.wall = p.code; state.feature = d.code; for (const c of cards) L.push({ ...c, sp: 'bath' }); }
  }
  if (d && !decor(d)){
    if (!d.pair && fits(d, 'floor') && fits(d, 'wall')){ for (const [k] of SLOTS) state[k] = d.code; for (const c of cards) L.push({ ...c, sp: 'bath' }); }     // a bathroom only when the tile suits floor and walls: nothing else is shown beside it
    if (fitsIn('living', d)){ fstate.living = d.code; L.push({ ...roomOf('l1'), sp: 'living' }); }
    if (fitsIn('out', d)){ fstate.out = d.code; for (const id of SPACES.out.rooms) if (!(d.terrace && id === 'p1')) L.push({ ...roomOf(id), sp: 'out' }); }
    if (isSlab(d)){ const f = floorFor(d); if (f){ kstate.slab = d.code; kstate.floor = f.code; for (const id of SPACES.kitchen.rooms) L.push({ ...roomOf(id), sp: 'kitchen' }); } }      // a slab: on the island of both kitchens, over a floor that sets it off
  }
  if (!L.length){ document.querySelector('.wrap').innerHTML = '<header class="top"><img src="' + asset('d-logo.png') + '" alt="Drambay" width="36" height="34"></header><p class="note">This tile is not in the display yet.</p>'; return; }
  oneList = L; oneDesign = d; hallHome = true; document.title = `${d.name} · Drambay`; $('viewer').classList.add('one'); $('hall').classList.add('one', 'home');
  // the display comes first: the tile's face under the Drambay banner, one bay for each room it suits, then step into a room
  bays = Array.from({ length: 12 }, (_, i) => { const c = L[i % L.length], b = c.sp === 'kitchen' ? kitBay([d.code, kstate.floor, c.id]) : c.sp !== 'bath' ? floorBay([d.code, c.id]) : decor(d) ? decorBay(d, c.id) : bayOf([d.code, d.code, d.code, c.id]); b.sp = c.sp; return b; });
  $('hsname').textContent = d.name; $('hstep').textContent = 'Step into this room'; $('hspace').removeAttribute('aria-haspopup');
  if (Q.get('open')){ const c = L.find(v => v.id === Q.get('open')); if (c){ await openViewer(c, false, c.sp); return; } }
  openHall(); hcount(0);
}
// ?pick=CODE: lay that tile and say which room to open. The same order as the one-design link: a bathroom when it suits floor and walls
// (a decor tile on the highlighter wall with its plain tile), else the living room floor, else the terrace. A slab opens the kitchen. Null when the tool has no room for it.
function pickRoom(code){
  const want = code.trim().toUpperCase().replace(/\s+/g, '+');
  let d = designs.find(x => x.code.toUpperCase() === want);
  if (d && d.half) d = designs.find(x => x.pair && x.pair.includes(d.code) && x.size[0] === 500) || d;
  if (!d) return null;
  if (decor(d)){ const p = fits(d, 'feature') && plainFor(d); if (!p) return null; state.floor = state.wall = p.code; state.feature = d.code; return { c: cards[0], sp: 'bath' }; }
  if (!d.pair && fits(d, 'floor') && fits(d, 'wall')){ for (const [k] of SLOTS) state[k] = d.code; return { c: cards[0], sp: 'bath' }; }
  if (fitsIn('living', d)){ fstate.living = d.code; return { c: roomOf('l1'), sp: 'living' }; }
  if (fitsIn('out', d)){ fstate.out = d.code; return { c: roomOf(d.terrace ? 't1' : SPACES.out.rooms[0]), sp: 'out' }; }
  if (isSlab(d)){ const f = floorFor(d); if (!f) return null; kstate.slab = d.code; kstate.floor = f.code; return { c: roomOf('k1'), sp: 'kitchen' }; }
  return null;
}
async function start(){
  [designs, MH, TONE] = await Promise.all([getJSON('designs.json'), getJSON('mh.json'), getJSON('tones.json').catch(() => ({}))]);
  try { eng = new Engine(); } catch (e) { $('grid').innerHTML = '<p class="note">This device cannot draw the live rooms. Please open it in a current browser.</p>'; return; }
  designs = designs.filter(d => d.site !== false || (d.dealers || []).length);      // taken off the site and stocked by no dealer: shown nowhere, not even by a direct link
  if (DEALER && !ONE) designs = designs.filter(d => (d.dealers || []).includes(DEALER));      // a dealer's link: his designs only
  else if (!ONE) designs = designs.filter(d => d.site !== false);      // designs that are not on drambay.com (dealer-only, or taken off the site) are never offered here; a one-design link can still open one
  addPairs(); load(); drawPicks(); await buildGrid();
  if (ONE){ await startOne(); return; }
  if (DEALER){      // the display hall is this link's home: no Drambay catalogue behind it
    if (!Object.keys(SPACES).some(spaceOK)){ document.querySelector('.wrap').innerHTML = '<header class="top"><img src="' + asset('d-logo.png') + '" alt="Drambay" width="36" height="34"></header><p class="note">This display is not set up yet.</p>'; return; }
    const v = PICK && pickRoom(PICK); if (v){ save(); drawPicks(); }
    hallHome = true; $('hall').classList.add('home'); openHall(); if (v) openViewer(v.c, true, v.sp); return;
  }
  const pv = PICK && pickRoom(PICK); if (pv){ save(); drawPicks(); }
  if (pv || PICK || Q.has('walk')){      // from a button on the site: straight into the display hall (a design's own button: straight into a room, the hall behind it)
    if (pv) hspace = pv.sp;
    hallFront(); openHall();
    if (pv) openViewer(pv.c, true, pv.sp); else if (PICK) toast('This tile is not in the display yet.');
    return;
  }
  await renderGrid();
  if (store.get('drb-offline')){ $('offline').textContent = 'Saved for offline'; $('offline').classList.add('done'); }
  if (Q.get('open')) { const id = Q.get('open'), c = cards.find(c => c.id === id), sp = Object.keys(SPACES).find(k => SPACES[k].rooms.includes(id)); if (c) openViewer(c); else if (sp) openViewer(roomOf(id), false, sp); }
  else if (Q.has('walk')) openHall();
}
$('close').onclick = () => closeViewer();
addEventListener('popstate', () => { if (skipPop){ skipPop = false; return; } if (zm){ closeZoom(true); return; } if (open) closeViewer(true); else closeHall(true); });
$('walk').onclick = openHall; $('hclose').onclick = () => hallHome ? leave() : closeHall(); $('hprev').onclick = () => hall.turn(-1); $('hnext').onclick = () => hall.turn(1); $('hstep').onclick = () => hall.enter(hall.active); $('hshuffle').onclick = hallSurprise;
$('hspace').onclick = () => { if (!oneList) spaceMenu($('hmenu').hidden); }; $('hallcv').addEventListener('pointerdown', () => spaceMenu(false));
$('prev').onclick = () => go(-1); $('next').onclick = () => go(1);
$('share').onclick = share; $('vshuffle').onclick = viewSurprise; $('zoomb').onclick = () => zoomLook(); $('offline').onclick = saveOffline; $('shuffle').onclick = surprise;
$('swap').onclick = () => { if (decor(byCode(state.feature))){ toast('A decor tile stays on the highlighter wall.'); return; } [state.wall, state.feature] = [state.feature, state.wall]; changed(); };
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
// test hooks: one frame of a room as a JPEG data URL, and the look direction
window.__looks.frame = async (id, t, w, live = true, p = null) => { const c = cards.find(c => c.id === id); return eng.render(await c.room, await sets(), { width: w, live, time: t, par: p }).toDataURL('image/jpeg', .9); };
window.__looks.space = (k) => setSpace(k);
window.__looks.can = (code) => { const keep = [{ ...state }, { ...fstate }, { ...kstate }], v = !!pickRoom(code); Object.assign(state, keep[0]); Object.assign(fstate, keep[1]); Object.assign(kstate, keep[2]); return v; };      // test hook: has the tool a room for this design?
window.__looks.look = (y, p) => { if (y !== undefined){ lookTo(y, p); look.sy = look.y; look.sp = look.p; lookApply(); } return { y: look.y, p: look.p, K: open && open.K }; };
