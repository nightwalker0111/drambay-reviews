/* 360° display hall: a ring of display bays you stand inside, drawn in WebGL.
   Tile panels are the real face pictures, laid with joints. The bathroom above each panel is drawn by the room engine.
   Units: 1 = 1/0.375 mm, so a 600 x 1200 tile is 225 x 450. */
const PIL = 50, DW = 900, WF = DW + 2 * PIL, BH = 1425, EYE = 825;         // bay face, half fin, display width, bay height, eye line below the bay top
const RING = .84, FLOORY = -(BH - EYE);
let N = 12, SEG = Math.PI * 2 / N, R = WF / 2 / Math.tan(Math.PI / N);
const BOARD = [PIL, 26, DW, 132];            // x, gap above the bay top, width, height
export const WIN = [PIL, 30, DW, 600], LAB = [PIL, 630, DW, 120], PAN = [PIL, 750, DW, 675];
const INK = '#343A3B', MUTED = '#6F7574';
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const lerp = (a, b, t) => a + (b - a) * t;

const VS = `#version 300 es
layout(location=0) in vec2 p;
uniform vec3 uO, uEu, uEv, uCam, uProj; uniform vec2 uYaw;
out vec2 vUv; out vec3 vW;
void main(){
  vec3 w = uO + uEu*p.x + uEv*p.y; vW = w; vUv = p;
  vec3 d = w - uCam;
  float x = d.x*uYaw.x + d.z*uYaw.y, z = d.x*uYaw.y - d.z*uYaw.x;
  gl_Position = vec4(x*uProj.x, d.y*uProj.y + uProj.z*z, 0., z);
}`;
const FS = () => `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vW; out vec4 o;
uniform sampler2D uTex; uniform int uMode; uniform float uTime, uActive, uR, uLen, uPulse; uniform vec2 uRes;
const vec3 FLOOR_FAR = vec3(.765, .735, .69), FLOOR_NEAR = vec3(.60, .57, .53);
const vec3 WALL = vec3(.953, .941, .914), CEIL = vec3(.72, .69, .645);
const vec3 BAND = vec3(.153, .173, .176);
vec3 fin(float x, float side){ return side < 0. ? mix(vec3(.243, .267, .271), vec3(.215, .238, .242), x) : mix(vec3(.168, .188, .192), vec3(.196, .218, .222), x); }
void main(){
  vec2 s = gl_FragCoord.xy/uRes - .5; float vig = 1. - .34*dot(s, s);
  if (uMode == 0){ o = vec4(texture(uTex, vUv).rgb*vig, 1.); return; }
  if (uMode == 1){                                   // polished floor: the bay mirrored below the floor line, softer and fainter with distance
    float d = vUv.y*uLen;
    vec3 t = textureLod(uTex, vec2(vUv.x, 1. - d/${BH}.), 1.2 + d/70.).rgb;
    vec3 f = mix(FLOOR_FAR, FLOOR_NEAR, smoothstep(0., 520., d));
    float k = .34*exp(-d/300.);
    vec3 c = mix(f, t, k)*(1. - .16*exp(-d/26.));   // a soft contact shadow where the bay meets the floor
    o = vec4(c*vig, 1.); return;
  }
  if (uMode == 2){                                   // wall above the bays, fading up to the ceiling
    float y = vUv.y*uLen; float e = ${PIL}./${WF}.;
    vec3 c = BAND*mix(1., .78, smoothstep(190., 560., y));          // one dark banner above every bay, the logo sits on it
    float gp = 1.5/${WF}., gw = fwidth(vUv.x);
    if (vUv.x < e) c = fin(vUv.x/e, -1.)*mix(1., .8, smoothstep(0., 520., y));
    else if (vUv.x > 1. - e) c = fin((vUv.x - 1. + e)/e, 1.)*mix(1., .8, smoothstep(0., 520., y));
    c = mix(c, vec3(.08, .09, .09), .55*(1. - smoothstep(gp, gp + gw, min(abs(vUv.x - e), abs(vUv.x - 1. + e)))));
    o = vec4(c*vig, 1.); return;
  }
  // floor marks: slab joints and the step-in circles
  vec2 q = vW.xz; float ang = atan(q.x, -q.y); float i = floor(ang/${SEG.toFixed(6)} + .5), a = i*${SEG.toFixed(6)};
  vec2 dir = vec2(sin(a), -cos(a)), tn = vec2(cos(a), sin(a));
  vec2 l = vec2(dot(q, tn), dot(q, dir) - uR*${RING});
  float r = length(l), aa = fwidth(r)*1.3 + .001;
  float on = mod(i - uActive + ${N * 2}., ${N}.) < .5 ? 1. : 0.;
  float ring = 1. - smoothstep(0., aa, abs(r - 60.) - 3.2);
  float dotc = 1. - smoothstep(0., aa, r - 25.);
  float ph = fract(uTime*.5);
  float pulse = (1. - smoothstep(0., aa, abs(r - (60. + 46.*ph)) - 2.))*(1. - ph)*uPulse*on;
  float m = clamp(ring + dotc + pulse*.75, 0., 1.)*mix(.5, 1., on);
  float sh = (1. - smoothstep(0., 22., abs(r - 60.) - 3.))*.22 + (1. - smoothstep(0., 40., r - 25.))*.12;
  vec2 g = abs(fract(q/450.) - .5)*450., fw = fwidth(q) + .001;
  vec2 cv = (1. - smoothstep(vec2(1.1), vec2(1.1) + fw, g))*clamp(2.2/fw, 0., 1.);
  float j = max(cv.x, cv.y)*.16;
  float inr = 1. - smoothstep(uR - fw.x - fw.y - 2., uR - 1., dot(q, dir));
  float dk = max(j, sh)*(1. - m);
  float al = dk + m;
  o = vec4(mix(vec3(.17, .16, .15), vec3(1.), m/max(al, 1e-4))*vig, al*inr);
}`;

export class Hall {
  /* opts: bays [{design (size, finish, faces, pair), name, meta, joint:[r,g,b], base}], faceUrl(name), paint(bay, w) -> promise of a picture (drawn at once), onEnter(i), still (bool) */
  constructor(canvas, opts){
    N = opts.bays.length; SEG = Math.PI * 2 / N; R = WF / 2 / Math.tan(Math.PI / N);
    this.cv = canvas; this.o = opts; this.bays = opts.bays.map((b, i) => ({ ...b, i, a: i * SEG, faces: [], room: null, dirty: true, tex: null, cv: document.createElement('canvas') }));
    const gl = this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    const p = this.p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS()]]){ const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.u = {}; for (const n of ['uO', 'uEu', 'uEv', 'uCam', 'uProj', 'uYaw', 'uTex', 'uMode', 'uTime', 'uActive', 'uR', 'uLen', 'uPulse', 'uRes']) this.u[n] = gl.getUniformLocation(p, n);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.yaw = 0; this.target = 0; this.vel = 0; this.cam = [0, 0, 0]; this.hz = .54; this.k = 0; this.on = false; this.paused = false; this.anim = null; this.drag = null; this.queue = Promise.resolve(); this.t0 = performance.now();
    this.board = null; if (opts.logo){ const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { this.logo = im; this._board(); this.need = true; }; im.src = opts.logo; }
    this._events(); this.size();
  }
  get active(){ return ((Math.round(this.yaw / SEG) % N) + N) % N; }
  size(){
    const cv = this.cv, w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    this.vw = w; this.vh = h; this.dpr = dpr;
    this.s = Math.max(Math.min(.76 * h / BH, .86 * w / DW), .32 * w / R);       // screen px per unit at the bay in front
    this.P = this.s * R;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const k = Math.min(1.3, Math.max(.5, Math.round(this.s * dpr * 20) / 20));  // texture px per unit: what the bay in front needs
    if (Math.abs(k - this.k) > .049){ this.k = k; for (const b of this.bays){ b.cv.width = Math.round(WF * k); b.cv.height = Math.round(BH * k); b.dirty = true; b.sized = false; } }
    this.need = true;
  }
  /* ---------- bay pictures ---------- */
  _face(b, n){
    return new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = this.o.faceUrl(n); });
  }
  _loadBay(b){
    if (b.loading) return; b.loading = true;
    b.design.faces.slice(0, 6).forEach((n, i) => this._face(b, n).then(im => { if (im){ b.faces[i] = im; b.dirty = true; this.need = true; } }));
    this.queue = this.queue.then(async () => {
      while (this.paused || !this.on) await new Promise(r => setTimeout(r, 120));
      if (!this.bays.includes(b)) return;                       // the designs were changed meanwhile
      try { await this.o.paint(b, (im, sw, sh) => {
        const w = Math.round(WIN[2] * this.k), h = Math.round(WIN[3] * this.k);
        const c = b.room || (b.room = document.createElement('canvas')); c.width = w; c.height = h;
        const sc = Math.max(w / sw, h / sh), dw = sw * sc, dh = sh * sc, fy = b.focusY === undefined ? .5 : b.focusY;
        c.getContext('2d').drawImage(im, (w - dw) / 2, (h - dh) * fy, dw, dh);
        b.dirty = true; this.need = true;
      }, Math.round(WIN[2] * this.k)); } catch (e) { setTimeout(() => { b.loading = false; }, 5000); }
    });
  }
  _drawBay(b){
    const x = b.cv.getContext('2d'), k = this.k, d = b.design; x.setTransform(k, 0, 0, k, 0, 0);
    let g = x.createLinearGradient(0, 0, 0, BH); g.addColorStop(0, '#F3F0E9'); g.addColorStop(1, '#EAE5DC'); x.fillStyle = g; x.fillRect(0, 0, WF, BH);
    g = x.createLinearGradient(0, 0, PIL, 0); g.addColorStop(0, '#3E4445'); g.addColorStop(1, '#373D3E'); x.fillStyle = g; x.fillRect(0, 0, PIL, BH);
    g = x.createLinearGradient(WF - PIL, 0, WF, 0); g.addColorStop(0, '#2B3031'); g.addColorStop(1, '#323839'); x.fillStyle = g; x.fillRect(WF - PIL, 0, PIL, BH);
    x.fillStyle = '#272C2D'; x.fillRect(PIL, 0, DW, WIN[1]);            // the banner runs down to the picture
    // bathroom window
    const [wx, wy, ww, wh] = WIN;
    if (b.room) x.drawImage(b.room, wx, wy, ww, wh); else { x.fillStyle = '#D9D2C7'; x.fillRect(wx, wy, ww, wh); }
    g = x.createLinearGradient(0, wy, 0, wy + 26); g.addColorStop(0, 'rgba(20,22,23,.30)'); g.addColorStop(1, 'rgba(20,22,23,0)'); x.fillStyle = g; x.fillRect(wx, wy, ww, 26);
    // name strip
    const [lx, ly, lw, lh] = LAB; x.fillStyle = '#F5F2EC'; x.fillRect(lx, ly, lw, lh);
    x.textBaseline = 'alphabetic'; x.fillStyle = INK; x.textAlign = 'left';
    let fs = 50; x.font = `400 ${fs}px Newsreader, Georgia, serif`;
    x.font = `500 27px "Hanken Grotesk", system-ui, sans-serif`; const mw = x.measureText(b.meta).width;
    x.font = `400 ${fs}px Newsreader, Georgia, serif`; while (x.measureText(b.name).width > lw - mw - 110 && fs > 30){ fs -= 2; x.font = `400 ${fs}px Newsreader, Georgia, serif`; }
    x.fillText(b.name, lx + 30, ly + 77);
    x.fillStyle = MUTED; x.textAlign = 'right'; x.font = `500 27px "Hanken Grotesk", system-ui, sans-serif`; x.fillText(b.meta, lx + lw - 30, ly + 75);
    // tile panel: real faces, long side across, with joints
    const [px, py, pw, ph] = PAN, J = 2.2, nf = d.faces.slice(0, 6).length, big = Math.max(...d.size), small = Math.min(...d.size);
    x.fillStyle = `rgb(${b.joint.join(',')})`; x.fillRect(px, py, pw, ph);
    const put = (im, cx, cy, tw, th, turn) => {
      if (!im){ x.fillStyle = b.fill || '#D9D2C7'; x.fillRect(cx, cy, tw, th); return; }
      x.save(); x.translate(cx + tw / 2, cy + th / 2);
      if (im.height > im.width * 1.05 && tw > th * 1.05) x.rotate(Math.PI / 2 + (turn ? Math.PI : 0)), x.drawImage(im, -th / 2, -tw / 2, th, tw);
      else { if (turn) x.rotate(Math.PI); x.drawImage(im, -tw / 2, -th / 2, tw, th); }
      x.restore();
    };
    if (big >= 2400){
      // a slab: one seamless face, laid at the photo's own shape (the photo is a narrow strip of the slab: never stretched to the slab's width), every second strip mirrored so no line shows
      const im = b.faces[0];
      if (!im){ x.fillStyle = b.fill || '#D9D2C7'; x.fillRect(px, py, pw, ph); }
      else {
        const port = im.height > im.width, L_ = port ? im.height : im.width, S_ = port ? im.width : im.height, c = (this.o.slabCrop && this.o.slabCrop(d.code)) || [0, 0, 1, 1];
        const t = document.createElement('canvas'); t.width = L_; t.height = S_; const tx = t.getContext('2d');
        if (port){ tx.translate(L_, 0); tx.rotate(Math.PI / 2); } tx.drawImage(im, 0, 0);
        const st = document.createElement('canvas'); st.width = Math.round(pw); st.height = Math.max(2, Math.round(pw * (S_ * (c[3] - c[1])) / (L_ * (c[2] - c[0]))));
        st.getContext('2d').drawImage(t, c[0] * L_, c[1] * S_, (c[2] - c[0]) * L_, (c[3] - c[1]) * S_, 0, 0, st.width, st.height);      // only the clean part of the photo, the same part the kitchen lays
        x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();
        for (let r = 0, y = py + ph; y > py; r++){ y -= st.height; x.save(); if (r % 2){ x.translate(0, 2 * y + st.height); x.scale(1, -1); } x.drawImage(st, px, y); x.restore(); }
        x.restore();
      }
    } else if (big === 1200 && small === 600){
      const cols = 2, rows = 3, tw = (pw - J * (cols - 1)) / cols, th = (ph - J * (rows - 1)) / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
        const n = r * cols + c, fi = (n * (nf > 4 ? 1 : (nf === 4 ? 3 : 1)) + (nf <= 2 ? 0 : r)) % nf;
        put(b.faces[fi], px + c * (tw + J), py + r * (th + J), tw, th, nf < 6 && ((n * 7 + r) % 3 === 1 || (nf === 1 && n % 2 === 1)));
      }
    } else {
      // every other size is laid to the same scale from the bottom left corner, the way a floor starts: what does not fit is cut at the right and at the top.
      // Tiles of 600 mm and smaller are drawn large, two across, so the graining shows. A dark + light pair is laid as its checker.
      const k = big <= 600 ? pw / (2 * big) : .375, cw = big * k, chh = small * k, cols = Math.ceil(pw / cw - .01), rows = Math.ceil(ph / chh - .01);
      x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
        const n = r * cols + c, fi = d.pair ? (r + c) % 2 : (n + (nf > 2 ? r : 0)) % nf;
        put(b.faces[fi], px + c * cw + J / 2, py + ph - (r + 1) * chh + J / 2, cw - J, chh - J, !d.pair && nf < 4 && (n * 7 + r) % 3 === 1);
      }
      x.restore();
    }
    g = x.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(20,22,23,.34)'); g.addColorStop(.035, 'rgba(20,22,23,0)'); g.addColorStop(.036, 'rgba(255,255,255,.07)'); g.addColorStop(.45, 'rgba(255,255,255,0)'); g.addColorStop(.72, 'rgba(20,22,23,0)'); g.addColorStop(1, 'rgba(20,22,23,.10)');
    x.fillStyle = g; x.fillRect(px, py, pw, ph);
    const gl_ = d.finish === 'mirror' ? .2 : (d.finish === 'polished' ? .12 : 0);
    if (gl_){                                   // polished faces catch the hall's light: one soft slanted band, stronger on High Gloss
      x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip(); x.globalCompositeOperation = 'screen';
      g = x.createLinearGradient(px + pw * .08, py, px + pw * .62, py + ph); g.addColorStop(0, 'rgba(255,250,240,0)'); g.addColorStop(.42, `rgba(255,250,240,${gl_ * .35})`); g.addColorStop(.5, `rgba(255,250,240,${gl_})`); g.addColorStop(.58, `rgba(255,250,240,${gl_ * .35})`); g.addColorStop(1, 'rgba(255,250,240,0)');
      x.fillStyle = g; x.fillRect(px, py, pw, ph); x.restore();
    }
    // close-up mark, top right of the panel
    { const cx = px + pw - 52, cy = py + 52; x.save(); x.fillStyle = 'rgba(22,25,26,.58)'; x.beginPath(); x.arc(cx, cy, 30, 0, 7); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 3.2; x.lineCap = 'round'; x.beginPath(); x.arc(cx - 3, cy - 3, 10.5, 0, 7); x.moveTo(cx + 5, cy + 5); x.lineTo(cx + 12, cy + 12); x.moveTo(cx - 3, cy - 7.5); x.lineTo(cx - 3, cy + 1.5); x.moveTo(cx - 7.5, cy - 3); x.lineTo(cx + 1.5, cy - 3); x.stroke(); x.restore(); }
    // shadow gap beside each fin
    x.fillStyle = 'rgba(20,22,23,.55)'; x.fillRect(PIL - 1.5, 0, 3, BH); x.fillRect(WF - PIL - 1.5, 0, 3, BH);
    this._upload(b);
  }
  /* the dark board above every bay: the Drambay logo and name from the master file, never redrawn */
  _board(){
    const gl = this.gl, c = document.createElement('canvas'), k = 2; c.width = BOARD[2] * k; c.height = BOARD[3] * k; const x = c.getContext('2d'); x.scale(k, k);
    const g = x.createLinearGradient(0, 0, 0, BOARD[3]); x.fillStyle = '#272C2D'; x.fillRect(0, 0, BOARD[2], BOARD[3]);
    const lh = BOARD[3] * .6, lw = lh * this.logo.naturalWidth / this.logo.naturalHeight; x.drawImage(this.logo, (BOARD[2] - lw) / 2, (BOARD[3] - lh) / 2, lw, lh);
    if (this.board) gl.deleteTexture(this.board);
    this.board = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.board); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  _upload(b){
    const gl = this.gl; gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (!b.tex || !b.sized){
      if (b.tex) gl.deleteTexture(b.tex);
      b.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      b.sized = true;
    } else gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, b.cv); gl.generateMipmap(gl.TEXTURE_2D);
    b.dirty = false;
  }
  /* ---------- drawing ---------- */
  _quad(o, eu, ev){ const gl = this.gl, u = this.u; gl.uniform3fv(u.uO, o); gl.uniform3fv(u.uEu, eu); gl.uniform3fv(u.uEv, ev); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  draw(now){
    const gl = this.gl, u = this.u, t = (now - this.t0) / 1000;
    // look after the bays near the view first
    const order = this.bays.slice().sort((p, q) => Math.abs(wrap(p.a - this.yaw)) - Math.abs(wrap(q.a - this.yaw)));
    order.slice(0, 5).forEach(b => this._loadBay(b));
    order.slice(7).forEach(b => { if (b.tex){ gl.deleteTexture(b.tex); b.tex = null; b.sized = false; b.dirty = true; } });
    let budget = 2; for (const b of order.slice(0, 7)){ if (b.dirty && budget > 0){ this._drawBay(b); budget--; } }
    if (order.slice(0, 7).some(b => b.dirty)) this.need = true;
    gl.viewport(0, 0, this.cv.width, this.cv.height); gl.clearColor(.70, .67, .63, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.p); gl.bindVertexArray(this.vao);
    gl.uniform3fv(u.uCam, this.cam); gl.uniform2f(u.uYaw, Math.cos(this.yaw), Math.sin(this.yaw));
    gl.uniform3f(u.uProj, this.P / (this.vw / 2), this.P / (this.vh / 2), 1 - 2 * this.hz);
    gl.uniform2f(u.uRes, this.cv.width, this.cv.height); gl.uniform1f(u.uTime, t); gl.uniform1f(u.uR, R); gl.uniform1f(u.uActive, this.active);
    gl.uniform1f(u.uPulse, this.o.still ? 0 : 1); gl.uniform1i(u.uTex, 0); gl.activeTexture(gl.TEXTURE0);
    const vis = this.bays.filter(b => Math.abs(wrap(b.a - this.yaw)) < 1.9 && b.tex);
    const geo = (b) => { const dx = Math.sin(b.a), dz = -Math.cos(b.a), tx = Math.cos(b.a), tz = Math.sin(b.a); return { c: [dx * R, 0, dz * R], t: [tx, 0, tz] }; };
    const LEN = 760, UP = 900;
    gl.disable(gl.BLEND);
    for (const b of vis){
      const { c, t: tn } = geo(b), l = [c[0] - tn[0] * WF / 2, 0, c[2] - tn[2] * WF / 2], eu = [tn[0] * WF, 0, tn[2] * WF];
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.uniform1i(u.uMode, 1); gl.uniform1f(u.uLen, LEN); this._quad([l[0], FLOORY, l[2]], eu, [0, -LEN, 0]);
      gl.uniform1i(u.uMode, 2); gl.uniform1f(u.uLen, UP); this._quad([l[0], EYE, l[2]], eu, [0, UP, 0]);
      gl.uniform1i(u.uMode, 0); this._quad([l[0], EYE, l[2]], eu, [0, -BH, 0]);
      if (this.board){ gl.bindTexture(gl.TEXTURE_2D, this.board); const y = EYE + BOARD[1] + BOARD[3]; this._quad([l[0] + tn[0] * BOARD[0], y, l[2] + tn[2] * BOARD[0]], [tn[0] * BOARD[2], 0, tn[2] * BOARD[2]], [0, -BOARD[3], 0]); }
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(u.uMode, 3); const E = R * 1.1; this._quad([-E, FLOORY, -E], [2 * E, 0, 0], [0, 0, 2 * E]);
    gl.disable(gl.BLEND);
  }
  _loop(){
    cancelAnimationFrame(this.raf);
    const step = (now) => {
      if (!this.on || this.paused) return; this.raf = requestAnimationFrame(step);
      const dt = Math.min(.05, (now - (this.last || now)) / 1000); this.last = now;
      if (this.anim){ if (this.anim(now) === false) this.anim = null; }
      else if (!this.drag){                       // glide to the bay we are heading for (a critically damped spring keeps the flick's speed)
        const d = this.target - this.yaw;
        if (Math.abs(d) > .0004 || Math.abs(this.vel) > .002){ this.vel += (d * 70 - this.vel * 16.8) * dt; this.yaw += this.vel * dt; this.need = true; }
        else { this.yaw = this.target; this.vel = 0; }
      }
      const a = this.active; if (a !== this.lastActive){ this.lastActive = a; this.o.onBay && this.o.onBay(a); }
      if (this.need || !this.o.still){ this.need = false; this.draw(now); }
    };
    this.last = 0; this.raf = requestAnimationFrame(step);
  }
  open(i){ this.on = true; this.paused = false; if (i !== undefined){ this.yaw = this.target = i * SEG; } this.cam = [0, 0, 0]; this.hz = .54; this.size(); this._loop(); }
  close(){ this.on = false; cancelAnimationFrame(this.raf); }
  setBays(list){
    const gl = this.gl; for (const b of this.bays) if (b.tex) gl.deleteTexture(b.tex);
    this.gen = (this.gen || 0) + 1;
    this.bays = list.map((b, i) => ({ ...b, i, a: i * SEG, faces: [], room: null, dirty: true, tex: null, gen: this.gen, cv: document.createElement('canvas') }));
    for (const b of this.bays){ b.cv.width = Math.round(WF * this.k); b.cv.height = Math.round(BH * this.k); }
    this.lastActive = -1; this.need = true;
  }
  /* one full turn, used while the designs change */
  spin(){ if (this.anim) return; const y0 = this.yaw, t0 = performance.now(), ms = this.o.still ? 1 : 1100; this.vel = 0; this.animKind = 'spin';
    this.anim = (now) => { const q = Math.min(1, (now - t0) / ms); this.yaw = y0 + Math.PI * 2 * ease(q); this.need = true; if (q >= 1){ this.yaw = this.target = y0; return false; } }; }
  refresh(){ for (const b of this.bays) b.dirty = true; this.need = true; }
  ringY(){ return Math.min(this.vh - 44, this.hz * this.vh + (EYE - BH) * -1 * this.s / RING); }
  turn(dir){ if (this.anim) return; this.vel = 0; this.target = Math.round(this.target / SEG) * SEG + dir * SEG; this.need = true; }
  /* where the camera ends when it has stepped up to bay i: the bathroom picture fills the screen the way the full-screen view does */
  _inPose(b){
    const a = this.vw / WIN[2], c = this.vh / WIN[3], sc = Math.min(Math.max(a, c), Math.min(a, c) / .78), D = Math.max(120, this.P / sc), m = R - D;
    return { cam: [Math.sin(b.a) * m, EYE - (WIN[1] + WIN[3] / 2), -Math.cos(b.a) * m], hz: .5 };
  }
  enter(i){
    if (this.anim && this.animKind !== 'back') return; if (this.anim){ this.cam = [0, 0, 0]; this.hz = .54; this.anim = null; } const b = this.bays[((i % N) + N) % N]; this.vel = 0;
    const y0 = this.yaw, y1 = y0 + wrap(b.a - y0), turnMs = Math.min(420, Math.abs(y1 - y0) / SEG * 300), pose = this._inPose(b), t0 = performance.now(), goMs = this.o.still ? 1 : 640; let told = false;
    this.target = y1; this.o.onMove && this.o.onMove(true); this.animKind = 'in';
    this.anim = (now) => {
      const t = now - t0; this.need = true;
      if (t < turnMs){ this.yaw = lerp(y0, y1, ease(t / turnMs)); return; }
      this.yaw = y1; const q = Math.min(1, (t - turnMs) / goMs), e = ease(q);
      this.cam = pose.cam.map(v => v * e); this.hz = lerp(.54, pose.hz, e);
      if (q > .52 && !told){ told = true; this.o.onEnter(b.i); }
      if (q >= 1){ this.inside = b.i; this.paused = true; return false; }
    };
  }
  /* back from the full-screen bathroom: step back to the middle of the hall */
  resume(){
    if (!this.on) return; const b = this.bays[this.inside === undefined ? this.active : this.inside], pose = this._inPose(b), t0 = performance.now(), ms = this.o.still ? 1 : 520;
    this.paused = false; this.inside = undefined; this.yaw = this.target = this.yaw; this.cam = pose.cam.slice(); this.hz = pose.hz;
    this.animKind = 'back';
    this.anim = (now) => { const q = Math.min(1, (now - t0) / ms), e = 1 - ease(q); this.cam = pose.cam.map(v => v * e); this.hz = lerp(.54, pose.hz, e); this.need = true; if (q >= 1){ this.o.onMove && this.o.onMove(false); return false; } };
    this._loop();
  }
  /* where a point of the hall lands on the screen */
  project(w){
    const d = [w[0] - this.cam[0], w[1] - this.cam[1], w[2] - this.cam[2]], c = Math.cos(this.yaw), s = Math.sin(this.yaw), x = d[0] * c + d[2] * s, z = d[0] * s - d[2] * c;
    return z > 1 ? [this.vw / 2 + x * this.P / z, this.hz * this.vh - d[1] * this.P / z, z] : null;
  }
  /* the floor circle under a tap, with a finger-sized target around it (the circle itself is drawn flat, so it is thin on screen) */
  ringAt(px, py){
    let best = null, bd = 1;
    for (const b of this.bays){
      if (Math.abs(wrap(b.a - this.yaw)) > 1.3) continue;
      const q = this.project([Math.sin(b.a) * R * RING, FLOORY, -Math.cos(b.a) * R * RING]); if (!q) continue;
      const rx = Math.max(64, 150 * this.P / q[2]), ry = Math.max(50, rx * .55), d = Math.hypot((px - q[0]) / rx, (py - q[1]) / ry);
      if (d < bd){ bd = d; best = b.i; }
    }
    return best;
  }
  /* which bay, and which part of it, is under a point on the screen */
  hit(px, py){
    const nx = (px / this.vw) * 2 - 1, ny = 1 - (py / this.vh) * 2;
    const vx = nx / (this.P / (this.vw / 2)), vy = (ny - (1 - 2 * this.hz)) / (this.P / (this.vh / 2));     // view ray (vx, vy, forward 1)
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), d = [vx * c + s, vy, vx * s - c];
    if (d[1] < -1e-4){                                        // floor
      const t = FLOORY / d[1], fx = d[0] * t, fz = d[2] * t, i = Math.round(Math.atan2(fx, -fz) / SEG), a = i * SEG;
      const lx = fx * Math.cos(a) + fz * Math.sin(a), ly = fx * Math.sin(a) - fz * Math.cos(a) - R * RING;
      if (Math.hypot(lx, ly) < 125 && Math.hypot(fx, fz) < R) return { bay: ((i % N) + N) % N, part: 'ring' };
    }
    const i = Math.round(Math.atan2(d[0], -d[2]) / SEG), a = i * SEG, dn = d[0] * Math.sin(a) - d[2] * Math.cos(a); if (dn <= 0) return null;
    const t = R / dn, hx = d[0] * t, hy = d[1] * t, hz = d[2] * t, u = hx * Math.cos(a) + hz * Math.sin(a) + WF / 2, v = EYE - hy;
    const inside = (r) => u >= r[0] && u <= r[0] + r[2] && v >= r[1] && v <= r[1] + r[3];
    return { bay: ((i % N) + N) % N, part: inside(WIN) ? 'window' : (inside(PAN) ? 'panel' : (inside(LAB) ? 'label' : 'wall')) };
  }
  _events(){
    const cv = this.cv;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => {
      if (this.paused || (this.anim && this.animKind !== 'back')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, lt: performance.now(), t: performance.now(), go: false, far: 0, v: 0, i0: Math.round(this.target / SEG) }; this.vel = 0;
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    });
    cv.addEventListener('pointermove', (e) => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      d.far = Math.max(d.far, Math.hypot(e.clientX - d.x, e.clientY - d.y));
      if (!d.go && d.far > (e.pointerType === 'mouse' ? 6 : 12)) { d.go = true; d.lx = e.clientX; d.lt = performance.now(); }
      if (d.go && !this.anim){ const now = performance.now(), dx = e.clientX - d.lx, dy = -dx / this.P; this.yaw += dy; const dt = Math.max(1, now - d.lt) / 1000; d.v = d.v * .6 + (dy / dt) * .4; d.lx = e.clientX; d.lt = now; this.need = true; }
    });
    const end = (e) => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return; this.drag = null; this.need = true;
      const dt = performance.now() - d.t, up = e.type === 'pointerup', r = cv.getBoundingClientRect(), x = d.x - r.left, y = d.y - r.top;
      // a tap, even with a finger that slips a little: the circle is the most forgiving target, then the bay in front, then a bay to the side
      const ring = up && d.far < 30 && dt < 900 ? this.ringAt(x, y) : null;
      if (ring !== null){ this.target = Math.round(this.yaw / SEG) * SEG; this.enter(ring); return; }
      if (up && (!d.go || (d.far < 18 && dt < 450)) && dt < 900){
        this.target = Math.round(this.yaw / SEG) * SEG;
        const h = this.hit(x, y); if (!h) return;
        if (h.bay === this.active && h.part === 'panel' && this.o.onZoom) this.o.onZoom(h.bay);
        else if (h.bay === this.active && h.part !== 'wall') this.enter(h.bay);
        else if (h.bay !== this.active){ if (h.part === 'window') this.enter(h.bay); else this.turn(Math.sign(wrap(h.bay * SEG - this.yaw))); }
        return;
      }
      if (d.go && !this.anim){
        this.vel = performance.now() - d.lt < 90 ? Math.max(-5, Math.min(5, d.v)) : 0;
        let t = Math.round((this.yaw + this.vel * .2) / SEG); const dx = e.clientX - d.x;
        if (t === d.i0 && Math.abs(dx) > Math.max(56, this.vw * .16)) t = d.i0 - Math.sign(dx);      // a clear swipe always moves one bay
        this.target = t * SEG;
      }
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }
}
