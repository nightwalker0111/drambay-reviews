/* Drambay Room Studio pilot engine.
   A room is an approved photo. Tiled surfaces are re-laid live with the real tile face:
   face x the room's own light, real joints, then gloss reflections traced inside the room box.
   Objects (fittings, glass, mirror) sit back on top from a cut-out layer. */

const MAXP = 12;

const VS = `#version 300 es
in vec2 p; out vec2 vUV;
void main(){ vUV = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.,1.); }`;

const COMMON = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
in vec2 vUV; out vec4 o;
uniform vec2 uRes; uniform vec3 uF, uU, uR; uniform vec3 uCam; // f, cx, cy
uniform int uNP;
uniform vec3 uPo[${MAXP}], uPeu[${MAXP}], uPev[${MAXP}], uPn[${MAXP}];
uniform vec4 uPext[${MAXP}]; uniform vec2 uPoff[${MAXP}];
uniform int uPset[${MAXP}], uPsw[${MAXP}];
uniform sampler2DArray uT0, uT1, uT2;
uniform vec2 uTsz[3]; uniform int uTn[3]; uniform float uTj[3]; uniform vec3 uTg[3];
uniform vec4 uTfin[3]; uniform vec2 uTlh[3];
uniform sampler2D uMaps, uLight, uObj, uBase;
uniform float uRef, uShoulder, uTime, uPx;
uniform vec4 uWin; uniform vec4 uSway;

vec3 rayAt(vec2 px){ return uF + (px.x-uCam.y)/uCam.x*uR - (px.y-uCam.z)/uCam.x*uU; }
vec2 planeUV(int k, vec2 px, out float t){
  vec3 D = rayAt(px); t = dot(uPo[k],uPn[k]) / dot(D,uPn[k]);
  vec3 P = D*t - uPo[k]; return vec2(dot(P,uPeu[k]), dot(P,uPev[k])) + uPoff[k];
}
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
int planeId(vec2 px){ return int(texelFetch(uMaps, ivec2(clamp(px/uRes,0.,0.99999)*vec2(textureSize(uMaps,0))), 0).r*255./40. + .5); }
// joint coverage (box filtered) and the tile cell
float cellOf(int s, int k, vec2 uv, vec2 w, out vec2 c, out vec2 st){
  vec2 tw = uPsw[k]==1 ? uTsz[s].yx : uTsz[s].xy; float j = uTj[s]; vec2 cw = tw + j;
  c = floor(uv/cw); vec2 f = uv - c*cw; vec2 d = min(f, cw-f);
  vec2 ww = max(w, vec2(1e-3));
  vec2 cov = clamp((min(d + ww*.5, vec2(j*.5)) - max(d - ww*.5, vec2(-j*.5))) / ww, 0., 1.);
  st = clamp((f - j*.5)/tw, 0., 1.);
  return 1. - (1.-cov.x)*(1.-cov.y);
}
// maps.b = glass*100 (+128: stand-off object, kept out of the reflection source)
vec2 glassNor(vec2 px){ float b = texelFetch(uMaps, ivec2(clamp(px/uRes,0.,0.99999)*vec2(textureSize(uMaps,0))), 0).b*255.; float n = step(127.5, b); return vec2((b - 128.*n)/100., n); }
vec3 sRGB(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(1e-6)), vec3(1./2.4)) - .055, step(vec3(.0031308), c)); }
vec3 lin(vec3 c){ return mix(c/12.92, pow((c+.055)/1.055, vec3(2.4)), step(vec3(.04045), c)); }
vec4 objAt(vec2 uv){
  // tiny leaf sway inside the sway box (live element)
  vec2 px = uv*uRes;
  if (uSway.z > uSway.x && px.x > uSway.x && px.x < uSway.z && px.y > uSway.y && px.y < uSway.w){
    float hgt = (uSway.w - px.y)/(uSway.w - uSway.y);
    float edge = smoothstep(0.,.12,hgt) * smoothstep(0.,.15,(px.x-uSway.x)/(uSway.z-uSway.x)) * smoothstep(0.,.15,(uSway.z-px.x)/(uSway.z-uSway.x));
    uv.x += edge*hgt*hgt * (sin(uTime*.9 + px.y*.012) * 1.6 + sin(uTime*.37) * .9) / uRes.x;
  }
  return texture(uObj, uv);
}
`;

const FS_A = COMMON + `
vec3 faceTex(int s, vec3 q, vec2 gx, vec2 gy){
  if (s==0) return textureGrad(uT0, q, gx, gy).rgb;
  if (s==1) return textureGrad(uT1, q, gx, gy).rgb;
  return textureGrad(uT2, q, gx, gy).rgb;
}
vec3 tileAlbedo(int s, int k, vec2 uv, vec2 dx, vec2 dy){
  vec2 c, st; vec2 w = abs(dx) + abs(dy);
  float g = cellOf(s, k, uv, w, c, st);
  bool sw = uPsw[k]==1; vec2 tw = sw ? uTsz[s].yx : uTsz[s].xy;
  int n = uTn[s]; float hsh = h21(c + 17.*float(s) + 3.*float(k));
  int ci = int(c.x) , cj = int(c.y);
  int idx = n<=1 ? 0 : (n==2 ? (ci+cj) : (ci + 2*cj));
  idx = ((idx % n) + n) % n;
  float flip = step(.5, hsh);
  vec2 q = mix(st, 1.-st, flip); vec2 sg = mix(vec2(1.), vec2(-1.), flip);
  vec2 gx = dx/tw*sg, gy = dy/tw*sg;
  if (n <= 1){   // one face only: each tile takes a slightly different crop of it, so the same vein does not repeat tile after tile
    const float jit = .12; vec2 off = vec2(h21(c + 31.7), h21(c*1.9 + 77.1))*jit;
    q = off + q*(1. - jit); gx *= 1. - jit; gy *= 1. - jit;
  }
  if (sw){ q = q.yx; gx = gx.yx; gy = gy.yx; }
  vec3 a = faceTex(s, vec3(q, float(idx)), gx, gy);
  a *= 1. + (h21(c*1.7 + 9.1) - .5)*.03;
  // joint: tone drifts a little along each run, never perfect
  vec3 gr = uTg[s] * (1. + (h21(vec2(c.x*.37, c.y*.61) + 5.) - .5)*.09);
  return mix(a, gr, g);
}
void main(){
  vec2 px = vUV*uRes;
  vec3 col = texture(uBase, vUV).rgb;
  int id = planeId(px);
  if (id > 0 && id <= uNP){
    int k = id-1; int s = uPset[k];
    if (s >= 0){
      float t, t1; vec2 uv = planeUV(k, px, t);
      vec2 dx = planeUV(k, px + vec2(uPx,0.), t1) - uv, dy = planeUV(k, px + vec2(0.,uPx), t1) - uv;
      vec3 a = tileAlbedo(s, k, uv, dx, dy);
      vec3 L = texture(uLight, vUV).rgb;
      // live: daylight from the window breathes very slowly
      float wl = uWin.w * exp(-distance(px, uWin.xy)/uWin.z) * (.5 + .5*sin(uTime*.33));
      vec3 lit = a * L / uRef * (1. + wl);
      vec3 sr = sRGB(lit); float kn = uShoulder;
      sr = mix(sr, kn + (1.-kn)*tanh((sr-kn)/(1.-kn)), step(vec3(kn), sr));
      lit = lin(clamp(sr, 0., 1.));
      vec4 mp = texture(uMaps, vUV); float gl = glassNor(px).x;
      lit = lit * (1. - .06*gl) + vec3(.004,.007,.006)*gl;
      col = mix(col, lit, mp.g);
    }
  }
  vec4 ob = objAt(vUV);
  col = mix(col, ob.rgb, ob.a * (1. - glassNor(px).y));
  o = vec4(col, 1.);
}`;

const FS_B = COMMON + `
uniform sampler2D uA; uniform float uTopY; uniform float uLods;
uniform int uPcut[${MAXP}];   // stand-ins for things on the floor: 1 = counts only where the object's own cut-out is (table), 2 = soft-edged face (sofa)
uniform vec4 uWater; uniform vec2 uWater2; uniform float uGrain;
uniform sampler2D uDepth; uniform vec3 uPar;   // tilt: xy = shift, z = zoom margin (0 = off)
vec3 srcA(vec2 uv, float lod){ return textureLod(uA, vec2(uv.x, 1.-uv.y), lod).rgb; }
vec2 toPx(vec3 Q, out float z){ z = dot(Q,uF); return vec2(uCam.y + uCam.x*dot(Q,uR)/max(z,1.), uCam.z - uCam.x*dot(Q,uU)/max(z,1.)) / uRes; }
vec3 seen(vec3 Pw, vec3 Rd, float tt, float lod, vec3 far){
  if (tt > 9e8) return far;
  float z; vec2 sp = toPx(Pw + Rd*tt, z);
  if (z < 50.) return far;
  vec2 e = smoothstep(vec2(-.03), vec2(.2), sp) * smoothstep(vec2(-.03), vec2(.2), 1.-sp);
  return mix(far, srcA(clamp(sp, 0., 1.), lod), e.x*e.y);
}
float objA(vec2 sp, float r){   // object cut-out alpha, softened over r px
  vec2 d = vec2(r)/uRes;
  return (texture(uObj, sp).a*2. + texture(uObj, sp + vec2(d.x,0.)).a + texture(uObj, sp - vec2(d.x,0.)).a + texture(uObj, sp + vec2(0.,d.y)).a + texture(uObj, sp - vec2(0.,d.y)).a) / 6.;
}
vec3 trace(vec3 Pw, vec3 Rd, int skip, float lod){
  float best = 1e9; vec2 s1 = vec2(1e9, 0.), s2 = vec2(1e9, 0.);   // nearest wall; the two nearest stand-ins (distance, cover)
  for (int i=0;i<${MAXP};i++){
    if (i>=uNP) break; if (i==skip) continue;
    float den = dot(Rd,uPn[i]); if (den > -1e-5) continue;
    float tt = dot(uPo[i]-Pw, uPn[i])/den; if (tt < 1.) continue;
    vec3 q = Pw + Rd*tt - uPo[i]; float u = dot(q,uPeu[i]), v = dot(q,uPev[i]);
    if (u < uPext[i].x || u > uPext[i].y || v < uPext[i].z || v > uPext[i].w) continue;
    if (uPcut[i] > 0){
      // stand-in for something standing on the floor (table, sofa face): laid softly over whatever is behind it, never a hard box
      if (tt >= s2.x) continue;
      float a = smoothstep(0., 90., uPext[i].w - v);
      if (uPcut[i] == 1){ float zc; vec2 sc = toPx(Pw + Rd*tt, zc); if (zc < 50.) continue; a = smoothstep(.2, .8, objA(sc, 5.)); }
      else a *= smoothstep(0., 70., u - uPext[i].x) * smoothstep(0., 70., uPext[i].y - u);
      if (a < .004) continue;
      if (tt < s1.x){ s2 = s1; s1 = vec2(tt, a); } else s2 = vec2(tt, a);
      continue;
    }
    if (tt < best) best = tt;
  }
  if (Rd.y > 1e-5){ float tt = (uTopY - Pw.y)/Rd.y; if (tt > 1. && tt < best) best = tt; }
  // the part of the room behind the camera is unknown: one calm tone (the frame's own average, a little darker), no edges
  vec3 far = srcA(vec2(.5), 20.) * .62;
  vec3 c = seen(Pw, Rd, best, lod, far);
  if (s2.x < best) c = mix(c, seen(Pw, Rd, s2.x, lod, far), s2.y);
  if (s1.x < best) c = mix(c, seen(Pw, Rd, s1.x, lod, far), s1.y);
  return c;
}
void main(){
  // 3D feel: the finished picture is shifted by depth (near things move more than far ones)
  vec2 uvw = vUV;
  if (uPar.z > 0.){ uvw = .5 + (vUV - .5)*(1. - 2.*uPar.z); uvw = clamp(uvw + uPar.xy*(texture(uDepth, uvw).r - .62), 0., 1.); }
  vec2 px = uvw*uRes;
  vec3 col = srcA(uvw, 0.);
  int id = planeId(px);
  vec4 ob = objAt(uvw); vec4 mp = texture(uMaps, uvw);
  if (id > 0 && id <= uNP){
    int k = id-1; int s = uPset[k];
    if (s >= 0 && uTfin[s].x > 0.){
      float t, t1; vec2 uv = planeUV(k, px, t);
      vec2 dx = planeUV(k, px + vec2(uPx,0.), t1) - uv, dy = planeUV(k, px + vec2(0.,uPx), t1) - uv;
      vec2 c, st; float g = cellOf(s, k, uv, abs(dx)+abs(dy), c, st);
      vec3 D = rayAt(px); vec3 Dn = normalize(D); vec3 N = uPn[k];
      // keep the bounce start inside the surface, so a pixel a hair past a corner cannot look through the next wall
      vec2 ur = clamp(uv - uPoff[k], uPext[k].xz + 2., uPext[k].yw - 2.);
      vec3 Pw = uPo[k] + uPeu[k]*ur.x + uPev[k]*ur.y;
      vec3 Rd = reflect(Dn, N);
      float a1 = (h21(c + 11.3) - .5)*2., a2 = (h21(c*1.3 + 4.7) - .5)*2.;
      Rd = normalize(Rd + (uPeu[k]*a1 + uPev[k]*a2) * uTlh[s].x * 1.6);
      float lod = uTfin[s].w + uLods;
      vec3 rf = .6*trace(Pw, Rd, k, lod) + .4*trace(Pw, Rd, k, lod + 1.7);
      float cosv = clamp(dot(-Dn, N), 0., 1.);
      float F = min(uTfin[s].x + uTfin[s].y*pow(1.-cosv, 2.5), uTfin[s].z) * (1.-g);
      vec3 r = col*(1.-F) + rf*F + max(rf - .5, 0.)*uTlh[s].y*(1.-g);
      col = mix(col, r, mp.g*(1.-ob.a));
    }
  }
  col = mix(col, ob.rgb, ob.a * glassNor(px).y);
  // live: shower water, drawn in code (fine falling threads + a little floor mist)
  if (uWater.z > 0.){
    float y0 = uWater.y, y1 = uWater2.x; float yy = (px.y - y0)/(y1 - y0);
    if (yy > 0. && yy < 1.){
      float half_ = uWater.z + (px.y - y0)*uWater2.y; float xx = (px.x - uWater.x)/half_;
      if (abs(xx) < 1.){
        float colw = 4.5; float ci = floor((px.x - uWater.x)/colw); float r1 = h21(vec2(ci, 3.)), r2 = h21(vec2(ci, 8.));
        float ph = fract(px.y/(64. + 70.*r1) - uTime*(8. + 5.*r2) + r1*7.);
        float dash = smoothstep(0., .18, ph)*smoothstep(.6, .22, ph);
        float xin = fract((px.x - uWater.x)/colw); float thin = smoothstep(.34, .08, abs(xin - .5 + (r1-.5)*.3));
        float env_ = (1. - xx*xx) * smoothstep(0., .03, yy) * smoothstep(1., .93, yy) * step(.42, r2) * (.55 + .45*h21(vec2(ci, floor(uTime*3.))));
        col += vec3(.85,.9,.95) * dash*thin*env_ * .085 * uWater.w;
      }
    }
    float md = length((px - vec2(uWater.x, y1)) / vec2(uWater.z*3.2, uWater.z*.9));
    col += vec3(.8,.85,.9) * exp(-md*md*2.) * (.035 + .012*sin(uTime*3.1 + px.x*.05)) * uWater.w;
  }
  vec3 outc = sRGB(clamp(col, 0., 1.));
  outc += (h21(gl_FragCoord.xy + fract(uTime)*37.) - .5) * uGrain;
  o = vec4(outc, 1.);
}`;

const FIN = {
  hg:    { f0: .16, fg: .9, fmax: .7,  lod: .7,  lip: .0012, hb: .5 },
  gloss: { f0: .10, fg: .75, fmax: .5, lod: 1.4, lip: .0022, hb: .3 },
  matt:  { f0: 0,    fg: 0,  fmax: 0,   lod: 0,   lip: 0,     hb: 0 },
};
export const finishOf = d => d.finish === 'mirror' ? 'hg' : (d.finish === 'polished' ? 'gloss' : 'matt');

function srgb2lab(r, g, b){
  const f = v => { v /= 255; return v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };
  const R = f(r), G = f(g), B = f(b);
  let X = (.4124*R + .3576*G + .1805*B)/.95047, Y = .2126*R + .7152*G + .0722*B, Z = (.0193*R + .1192*G + .9505*B)/1.08883;
  const t = v => v > .008856 ? Math.cbrt(v) : 7.787*v + 16/116;
  X = t(X); Y = t(Y); Z = t(Z);
  return [116*Y - 16, 500*(X - Y), 200*(Y - Z)];
}
// joint colour rule (light tile: dark grey, beige: brown, dark: grey, dark brown: ivory)
export function groutFor(rgb){
  const [L, a, b] = srgb2lab(...rgb);
  if (L < 35 && b > 4) return [190, 182, 168];
  if (L < 35) return [126, 128, 128];
  if (b > 6 && L >= 55) return [104, 74, 52];
  if (b > 5 && a >= 2 && L < 55) return [190, 182, 168];
  if (L >= 62) return [60, 58, 58];
  return [94, 92, 92];
}
const toLin = v => { v /= 255; return v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };

async function loadBitmap(url){
  const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new Error(url + ' ' + r.status);
  const b = await r.blob();
  try { return await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); }
  catch (e) { return await createImageBitmap(b); }
}

export class Engine {
  constructor(){
    this.canvas = document.createElement('canvas');
    const gl = this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not available');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.pA = this._prog(VS, FS_A); this.pB = this._prog(VS, FS_B);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.fbo = gl.createFramebuffer(); this.texA = null; this.aw = 0; this.ah = 0;
    this.rooms = new Map(); this.sets = new Map(); this.maxSets = 7;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }
  _prog(vs, fs){
    const gl = this.gl, p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]){
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++){ const a = gl.getActiveUniform(p, i); const nm = a.name.replace(/\[0\]$/, ''); p.u[nm] = gl.getUniformLocation(p, a.name); }
    return p;
  }
  _tex2d(bmp, srgb, linear = true){
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  /* at(path) -> url, when the pictures do not sit next to the page */
  async loadRoom(dir, at = (p) => p){
    if (this.rooms.has(dir)) return this.rooms.get(dir);
    const pr = (async () => {
      const j = await (await fetch(at(dir + 'room.json'))).json();
      const [base, maps, light, obj] = await Promise.all(['base.jpg', 'maps.png', 'light.jpg', 'obj.webp'].map(f => loadBitmap(at(dir + f))));
      const room = { j, dir, base: this._tex2d(base, true), maps: this._tex2d(maps, false), light: this._tex2d(light, true), obj: this._tex2d(obj, true), depth: null };
      [base, maps, light, obj].forEach(b => b.close && b.close());
      try { const d = await loadBitmap(at(dir + 'depth.jpg')); room.depth = this._tex2d(d, false); d.close && d.close(); } catch (e) {}   // optional: without it the room simply stays flat
      return room;
    })();
    this.rooms.set(dir, pr); return pr;
  }
  /* design: {code, size:[w,h], finish, faces:[names]}, urlOf(name) -> face url */
  async loadSet(design, urlOf){
    const key = design.code;
    if (this.sets.has(key)){ const v = this.sets.get(key); this.sets.delete(key); this.sets.set(key, v); return v; }
    const pr = (async () => {
      const gl = this.gl; const names = design.faces.slice(0, 4);
      const bmps = (await Promise.allSettled(names.map(n => loadBitmap(urlOf(n))))).filter(r => r.status === 'fulfilled').map(r => r.value);
      if (!bmps.length) throw new Error('No face image for ' + design.name);
      const long = Math.max(...design.size), short = Math.min(...design.size);
      const Lp = Math.min(1536, this.maxTex), Sp = Math.max(64, Math.round(Lp*short/long/64)*64);
      const cv = document.createElement('canvas'); cv.width = Lp; cv.height = Sp; const cx = cv.getContext('2d', { willReadFrequently: true });
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      const levels = Math.floor(Math.log2(Math.max(Lp, Sp))) + 1;
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.SRGB8_ALPHA8, Lp, Sp, bmps.length);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      let avg = [0, 0, 0];
      bmps.forEach((b, i) => {
        cx.save(); cx.clearRect(0, 0, Lp, Sp);
        if (b.height > b.width*1.05){ cx.translate(Lp, 0); cx.rotate(Math.PI/2); cx.drawImage(b, 0, 0, Sp, Lp); }   // portrait face: lay it long side across
        else cx.drawImage(b, 0, 0, Lp, Sp);
        cx.restore();
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, Lp, Sp, 1, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        if (i === 0){
          const s = document.createElement('canvas'); s.width = 24; s.height = 12; const sx = s.getContext('2d'); sx.drawImage(cv, 0, 0, 24, 12);
          const d = sx.getImageData(0, 0, 24, 12).data; const m = [[], [], []];
          for (let q = 0; q < d.length; q += 4){ m[0].push(d[q]); m[1].push(d[q+1]); m[2].push(d[q+2]); }
          avg = m.map(a => a.sort((x, y) => x - y)[a.length >> 1]);
        }
        b.close && b.close();
      });
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      const fin = finishOf(design);
      return { tex, n: bmps.length, long, short, joint: long >= 1200 ? 2 : 3, grout: groutFor(avg), avg, fin, design };
    })();
    this.sets.set(key, pr);
    pr.catch(() => this.sets.delete(key));
    while (this.sets.size > this.maxSets){
      const [k, v] = this.sets.entries().next().value; this.sets.delete(k);
      v.then(s => this.gl.deleteTexture(s.tex)).catch(() => {});
    }
    return pr;
  }
  _target(w, h){
    const gl = this.gl;
    if (this.aw === w && this.ah === h) return;
    if (this.texA) gl.deleteTexture(this.texA);
    this.texA = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texA);
    const lv = Math.floor(Math.log2(Math.max(w, h))) + 1;
    gl.texStorage2D(gl.TEXTURE_2D, lv, gl.SRGB8_ALPHA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texA, 0);
    this.aw = w; this.ah = h;
  }
  // start offset along a bounded run: a cut under a third of a tile is split to both ends
  static startOff(width, tw, j){
    if (!width || width > 8000 || width <= tw) return 0;
    const cw = tw + j, rem = width % cw;
    return rem < tw/3 ? cw - (tw + rem)/2 : 0;
  }
  /* sets: {floor, wall, feature} (loaded sets). opts: width (output px), time (s), live (bool), grain, par [x, y] in -1..1 (tilt) */
  render(room, sets, opts = {}){
    const gl = this.gl, j = room.j;
    const scale = Math.min(1, (opts.width || j.W) / j.W);
    const w = Math.max(2, Math.round(j.W*scale)), h = Math.max(2, Math.round(j.H*scale));
    if (this.canvas.width !== w || this.canvas.height !== h){ this.canvas.width = w; this.canvas.height = h; }
    this._target(w, h);
    const S = [sets.floor, sets.wall, sets.feature || sets.wall];
    const role = { floor: 0, wall: 1, feature: 2, none: -1 };
    const np = Math.min(MAXP, j.planes.length);
    const fl = (a) => new Float32Array(a.flat());
    const pset = [], psw = [], poff = [];
    j.planes.slice(0, np).forEach((p, i) => {
      const s = role[p.role]; pset.push(s);
      if (s < 0){ psw.push(0); poff.push([0, 0]); return; }
      const T = S[s]; const sw = p.kind === 'floor' && p.long === 'v' ? 1 : 0; psw.push(sw);
      const tw = sw ? T.short : T.long, th = sw ? T.long : T.short;
      const wd = p.kind === 'floor' ? (p.span ? p.span[0] : 0) : p.ext[1] - p.ext[0];
      poff.push([Engine.startOff(wd, tw, T.joint) + (p.uoff || 0), (p.voff || 0)]);
    });
    const live = j.live || {}; const on = !!opts.live; const t = opts.time || 0;
    const common = (P) => {
      gl.useProgram(P); const u = P.u;
      gl.uniform2f(u.uRes, j.W, j.H); gl.uniform3fv(u.uF, j.F); gl.uniform3fv(u.uU, j.U); gl.uniform3fv(u.uR, j.R);
      gl.uniform3f(u.uCam, j.f, j.cx, j.cy); gl.uniform1i(u.uNP, np);
      gl.uniform3fv(u.uPo, fl(j.planes.slice(0, np).map(p => p.o))); gl.uniform3fv(u.uPeu, fl(j.planes.slice(0, np).map(p => p.eu)));
      gl.uniform3fv(u.uPev, fl(j.planes.slice(0, np).map(p => p.ev))); gl.uniform3fv(u.uPn, fl(j.planes.slice(0, np).map(p => p.n)));
      if (u.uPext) gl.uniform4fv(u.uPext, fl(j.planes.slice(0, np).map(p => p.ext.map(v => Math.max(-1e7, Math.min(1e7, v))))));
      if (u.uPcut) gl.uniform1iv(u.uPcut, new Int32Array(j.planes.slice(0, np).map(p => p.cut | 0)));
      gl.uniform2fv(u.uPoff, fl(poff)); gl.uniform1iv(u.uPset, new Int32Array(pset)); gl.uniform1iv(u.uPsw, new Int32Array(psw));
      gl.uniform2fv(u.uTsz, fl(S.map(T => [T.long, T.short])));
      if (u.uTn) gl.uniform1iv(u.uTn, new Int32Array(S.map(T => T.n)));
      gl.uniform1fv(u.uTj, new Float32Array(S.map(T => T.joint)));
      if (u.uTg) gl.uniform3fv(u.uTg, fl(S.map(T => T.grout.map(toLin))));
      if (u.uTfin) gl.uniform4fv(u.uTfin, fl(S.map(T => { const f = FIN[T.fin]; return [f.f0, f.fg, f.fmax, f.lod]; })));
      if (u.uTlh) gl.uniform2fv(u.uTlh, fl(S.map(T => [FIN[T.fin].lip, FIN[T.fin].hb])));
      gl.uniform1f(u.uRef, j.ref); gl.uniform1f(u.uShoulder, j.shoulder || .72); gl.uniform1f(u.uTime, on ? t : 0); gl.uniform1f(u.uPx, 1/scale);
      const wn = live.window; gl.uniform4f(u.uWin, wn ? wn[0] : 0, wn ? wn[1] : 0, wn ? wn[2] : 1, on && wn ? wn[3] : 0);
      const sy = live.sway; if (u.uSway) gl.uniform4f(u.uSway, ...(on && sy ? sy : [0, 0, 0, 0]));
      const bind = (unit, target, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, tex); if (u[name]) gl.uniform1i(u[name], unit); };
      bind(0, gl.TEXTURE_2D, room.maps, 'uMaps'); bind(1, gl.TEXTURE_2D, room.light, 'uLight'); bind(2, gl.TEXTURE_2D, room.obj, 'uObj'); bind(3, gl.TEXTURE_2D, room.base, 'uBase');
      bind(4, gl.TEXTURE_2D_ARRAY, S[0].tex, 'uT0'); bind(5, gl.TEXTURE_2D_ARRAY, S[1].tex, 'uT1'); bind(6, gl.TEXTURE_2D_ARRAY, S[2].tex, 'uT2');
      return u;
    };
    gl.bindVertexArray(this.vao); gl.viewport(0, 0, w, h); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); common(this.pA); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.texA); gl.generateMipmap(gl.TEXTURE_2D);
    const u = common(this.pB); gl.uniform1i(u.uA, 7);
    gl.uniform1f(u.uTopY, (j.top || 2900) - j.h);
    gl.uniform1f(u.uLods, Math.log2(Math.max(scale, .05)) * 1.0);
    const wt = live.water; gl.uniform4f(u.uWater, wt ? wt.head[0] : 0, wt ? wt.head[1] : 0, on && wt && opts.water !== false ? wt.r : 0, 1);
    gl.uniform2f(u.uWater2, wt ? wt.floor : 1, wt ? wt.spread : 0);
    gl.uniform1f(u.uGrain, opts.grain === undefined ? .012 : opts.grain);
    const par = room.depth && opts.par ? opts.par : null;
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, room.depth || room.maps); gl.uniform1i(u.uDepth, 8);
    gl.uniform3f(u.uPar, par ? par[0]*.03 : 0, par ? par[1]*.018 : 0, par ? .012 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}
