/*
  CBCT · procedural radiology slices, plain canvas 2D (no three). Also the single source of the jaw geometry shared with scene.js.

    drawCbct(ctx, { view: 'axial' | 'sagittal' | 'coronal', progress })   the 3 HTML panels. progress = the section progress 0→1.
        The anatomy + noise is baked once per canvas (and per size) and blitted; per call only the scan reveal, the implant / abutment / crown
        silhouettes (appear as the 3D scene places them) and the --accent crosshair are drawn. Cheap enough to call on every scroll tick.
    drawSlice / drawSliceAsync(ctx, opts)   the alpha texture of the 3D cut plane (scene.engine.js): lengthwise slice of the bone with a "window" over the implant.
    bakeCap(w)             the coronal cross-section painted on the two cut ends of the jaw in the 3D scene (async, time-sliced).
    cssAccent()            the page accent (--stroke) as #rrggbb; main thread only (the scene gets it as an option).
    Every bake is a generator driven in slices of ~6 ms (runAsync) so no single task is longer than that, wherever it runs (page or worker).
    GEO                    shared numbers (mm): bone length, gap, tilt, outline, crest profile.

  Coordinates are millimetres: x along the arch (mesiodistal), y up (0 = ridge crest at the neighbouring teeth), z buccal (+) / lingual (-).
*/
export const GEO = {
  L: 19.5, // half length of the bone segment
  gap: 5.4, // half width of the edentulous gap
  toothX: 9, // centre of the neighbouring teeth
  tilt: (12 * Math.PI) / 180, // implant axis vs vertical (mesiodistal plane)
  baseY: -16.4,
  impLen: 10,
  impR: 2,
  // closed bone cross-section (z, y), crest first; sampled with a uniform Catmull-Rom
  outline: [[0, 0.4], [2.6, -0.2], [4.6, -2.2], [5.9, -6], [6.8, -11], [6.0, -15.2], [3, -16.2], [0, -16.4], [-3, -16.2], [-5.8, -15], [-6.6, -10.5], [-5.8, -6], [-4.4, -2.4], [-2.4, -0.3]],
  crest: (x) => -1.6 * Math.exp(-(x * x) / (2 * 3.4 * 3.4)) + 0.04 * Math.sin(x * 0.7), // extra ridge height along x (dip over the gap)
  ridgeW: (y) => { const t = Math.min(1, Math.max(0, (y + 6.5) / 6.3)); return t * t * (3 - 2 * t); }, // how much of that dip an outline point takes
};
const { L, outline } = GEO;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** n points (z,y) evenly spaced along the closed outline. */
export function sampleOutline(n) {
  const P = outline, m = P.length, dense = [];
  for (let i = 0; i < m; i++) {
    const p0 = P[(i + m - 1) % m], p1 = P[i], p2 = P[(i + 1) % m], p3 = P[(i + 2) % m];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      dense.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  const len = [0]; for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const out = []; let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (len[dense.length] * i) / n; while (len[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length], t = (s - len[j]) / (len[j + 1] - len[j] || 1);
    out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
  }
  return out;
}
/** y of the outline at buccal offset z on the upper (top=true) or lower arc. */
const oyCache = new Map(); let oyPts;
export function outlineY(z, top = true) {
  const key = z + (top ? 't' : 'b'); if (oyCache.has(key)) return oyCache.get(key);
  const pts = (oyPts ||= sampleOutline(240)); let best = top ? -1e9 : 1e9;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) { const y = lerp(a[1], b[1], (z - a[0]) / (b[0] - a[0])); best = top ? Math.max(best, y) : Math.min(best, y); }
  }
  oyCache.set(key, best); return best;
}

// ── tiny noise ────────────────────────────────────────────────────────────────────────────────────────────────────────
const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const TN = 128; let TILE; // periodic value-noise table, 32 lattice cells over 128 texels (period 32 noise units)
function tile() {
  if (TILE) return TILE; TILE = new Float32Array(TN * TN); const lat = new Float32Array(1024); for (let i = 0; i < 1024; i++) lat[i] = hash(i & 31, i >> 5);
  for (let y = 0; y < TN; y++) for (let x = 0; x < TN; x++) { const gx = x / 4, gy = y / 4, xi = gx | 0, yi = gy | 0, fx = gx - xi, fy = gy - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = lat[(yi & 31) * 32 + (xi & 31)], b = lat[(yi & 31) * 32 + ((xi + 1) & 31)], d = lat[((yi + 1) & 31) * 32 + (xi & 31)], e = lat[((yi + 1) & 31) * 32 + ((xi + 1) & 31)]; TILE[y * TN + x] = a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v; }
  return TILE;
}
const vnoise = (x, y) => { const t = TILE || tile(), fx = x * 4, fy = y * 4, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, v = fy - yi, x0 = xi & 127, x1 = (xi + 1) & 127, y0 = (yi & 127) * TN, y1 = ((yi + 1) & 127) * TN; return (t[y0 + x0] * (1 - u) + t[y0 + x1] * u) * (1 - v) + (t[y1 + x0] * (1 - u) + t[y1 + x1] * u) * v; };
const fbm = (x, y) => 0.6 * vnoise(x * 0.8, y * 0.8) + 0.4 * vnoise(x * 2.2 + 9, y * 2.2 + 3);
const trab = (x, y) => 0.5 * vnoise(x * 1.5, y * 0.9) + 0.35 * vnoise(x * 3.6 + 5, y * 2.1 + 1) + 0.15 * vnoise(x * 8 + 2, y * 4.5 + 8); // trabecular streaks (anisotropic)
const mk = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
// generators: `yield` marks a place where a bake may pause. run() = to the end; runAsync() = ~6 ms at a time, then back to the event loop.
const run = (g) => { let r; while (!(r = g.next()).done); return r.value; };
const runAsync = async (g, budget = 6) => { let r, t = performance.now(); while (!(r = g.next()).done) if (performance.now() - t > budget) { await new Promise((k) => setTimeout(k)); t = performance.now(); } return r.value; };
let ACC = '#d4a373'; // accent of the HTML panes (crosshair, scan edge); follows html[data-palette] (--stroke)
export function cssAccent() {
  try {
    const v = getComputedStyle(document.querySelector('#digital') || document.documentElement).getPropertyValue('--stroke').trim(), c = mk(1, 1).getContext('2d');
    c.fillStyle = '#d4a373'; c.fillStyle = v; return c.fillStyle.length === 7 ? c.fillStyle : '#d4a373';
  } catch { return '#d4a373'; }
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  ACC = cssAccent();
  new MutationObserver(() => { ACC = cssAccent(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette'] });
}

// ── density models, one per view: (mm, mm) → [grey 0..1, alpha 0..1] ────────────────────────────────────────────────────
const T = GEO.toothX;
function rootHalfW(y) { return lerp(0.55, 3.0, sm(-9, 0.5, y)); } // neighbour root profile, y from crest down to -9
const topY = (x) => outlineY(0.0) + GEO.crest(x); // crest line at z = 0
const bottomY = GEO.baseY;
const R = [0, 0]; // scratch result (no per-pixel allocation)
function sagittal(x, y, o) {
  // lengthwise slice (mesiodistal) at buccal offset o.z
  const yt = o.topAt(x);
  let g = 0.03 + 0.03 * fbm(x * 0.6, y * 0.6), a = o.opaque ? 1 : 0;
  if (y > yt) { // above bone: soft tissue (gum), teeth crowns
    if (o.opaque && y < yt + 2.2 && Math.abs(Math.abs(x) - T) > 3.7) { g = 0.2 + 0.1 * fbm(x, y); }
    for (const s of [-1, 1]) { const d = Math.abs(x - s * T); if (o.opaque && y < 8.3 && d < 3.5 * (1 - 0.18 * sm(3, 8, y)) && y > yt - 1) { g = 0.86 + 0.1 * fbm(x * 2, y * 2) - 0.3 * sm(3.2, 3.5, d); a = 1; } }
    R[0] = g; R[1] = a; return R;
  }
  a = o.alpha ?? 1;
  const dTop = yt - y, dBot = y - bottomY - 0.4;
  let dens = 0.34 + 0.3 * trab(x, y);
  const cortical = Math.max(1 - sm(0, 1.05, dTop), 1 - sm(0, 0.9, dBot));
  dens = lerp(dens, 0.92, cortical * 0.85);
  const cy = -13.4, cd = Math.abs(y - cy); // mandibular canal: a tube along x
  if (cd < 1.0) dens = lerp(dens, 0.14, 1 - sm(0.45, 1.0, cd)); else if (cd < 1.5) dens = lerp(dens, 0.86, (1 - sm(1.0, 1.5, cd)) * 0.6);
  for (const s of [-1, 1]) { // neighbour roots
    const d = Math.abs(x - s * T), w = rootHalfW(y);
    if (y > -9.2 && d < w + 0.35) {
      if (d < w) { dens = 0.78 + 0.1 * fbm(x * 3, y * 3); if (d < 0.12 && y < 0.5 && y > -7.4) dens = 0.5; } else dens = 0.12; // pulp canal, ligament
    }
  }
  if (o.window) { // implant window: nearly transparent (the 3D implant shows through) with a thin white outline
    const k = o.window, dx = x - k.ox, dy = y - k.oy, s = dx * k.ax + dy * k.ay, t = dx * -k.ay + dy * k.ax;
    if (s <= 0.2 && s >= -GEO.impLen - 0.2) {
      const r = GEO.impR + 0.1, e = Math.abs(Math.abs(t) - r);
      if (Math.abs(t) < r) { dens = 1; a = 0.04; }
      if (e < 0.09) { dens = 1; a = 0.95; }
    }
  }
  R[0] = dens; R[1] = a; return R;
}

/** Bake a lengthwise slice into a canvas. win = mm window {x0,x1,yBot,yTop}. */
function* bakeLength(w, h, win, o) {
  const cv = mk(w, h), c = cv.getContext('2d'), id = c.createImageData(w, h), d = id.data;
  const sx = (win.x1 - win.x0) / w, sy = (win.yTop - win.yBot) / h;
  for (let j = 0; j < h; j++) {
    yield;
    for (let i = 0; i < w; i++) {
      const x = win.x0 + (i + 0.5) * sx, y = win.yTop - (j + 0.5) * sy;
      const r = sagittal(x, y, o); let g = r[0], a = r[1];
      g = Math.min(1, Math.max(0, g + (hash(i, j) - 0.5) * 0.035));
      const k = (j * w + i) * 4, v = (g * 255) | 0;
      d[k] = v; d[k + 1] = v; d[k + 2] = Math.min(255, v + 4); d[k + 3] = (a * 255) | 0;
    }
  }
  c.putImageData(id, 0, 0);
  return cv;
}

/** The 3D cut-plane texture. opts: {w,h,yBot,yTop,topAt(x),window:{ox,oy,ax,ay},accent}. drawSlice = in one go, drawSliceAsync = in ~6 ms slices. */
function* sliceG(ctx, { w = 1024, h = 460, yBot = -16.4, yTop = 1.2, topAt, window: win, accent = '#e3b583' } = {}) {
  const base = yield* bakeLength(w, h, { x0: -L, x1: L, yBot, yTop }, { topAt, opaque: false, alpha: 0.86, window: win });
  ctx.clearRect(0, 0, w, h); ctx.drawImage(base, 0, 0);
  const S = w / (2 * L), mmY = (y) => ((yTop - y) / (yTop - yBot)) * h;
  ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath(); // frame that follows the bone outline (the page accent)
  ctx.moveTo(1.5, h - 1.5); ctx.lineTo(1.5, mmY(topAt(-L)));
  for (let x = -L; x <= L; x += 0.5) ctx.lineTo((x + L) * S, mmY(topAt(x)));
  ctx.lineTo(w - 1.5, h - 1.5); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; // ruler ticks along the bottom edge
  for (let x = -L; x <= L; x += 1) { const px = (x + L) * S, big = Math.round(x) % 5 === 0; ctx.fillRect(px - 0.5, h - (big ? 18 : 10), 1.4, big ? 14 : 6); }
}
export const drawSlice = (ctx, o) => run(sliceG(ctx, o));
export const drawSliceAsync = (ctx, o) => runAsync(sliceG(ctx, o));

// ── coronal section (bone outline, cortical rim, trabecular bone, mandibular canal): the HTML panel and the two cut ends of the 3D jaw ──
function* coronalG(w, h, S, Y0) {
  const cv = mk(w, h), c = cv.getContext('2d'), id = c.createImageData(w, h), d = id.data;
  const mc = mk(w, h), mg = mc.getContext('2d', { willReadFrequently: true }), pts = sampleOutline(64); mg.fillStyle = '#fff'; mg.beginPath(); // outline rasterised once → inside test and a cheap rim (8 taps)
  pts.forEach((q, k) => { const X = w / 2 + q[0] * S, Y = Y0 - q[1] * S; k ? mg.lineTo(X, Y) : mg.moveTo(X, Y); }); mg.closePath(); mg.fill();
  const md = mg.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) mask[k] = md[k * 4 + 3] > 127 ? 1 : 0;
  const mkAt = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : mask[j * w + i]);
  for (let j = 0; j < h; j++) {
    yield;
    for (let i = 0; i < w; i++) {
      let g = 0.03 + 0.03 * fbm(i * 0.05, j * 0.05);
      const z = (i + 0.5 - w / 2) / S, y = (Y0 - (j + 0.5)) / S;
      if (mkAt(i, j)) { const r = Math.max(2, Math.round(0.95 * S) | 0), q = (r * 0.7) | 0; let out = 0; out += !mkAt(i + r, j) + !mkAt(i - r, j) + !mkAt(i, j + r) + !mkAt(i, j - r) + !mkAt(i + q, j + q) + !mkAt(i - q, j + q) + !mkAt(i + q, j - q) + !mkAt(i - q, j - q); g = lerp(0.3 + 0.32 * trab(i * 0.12, j * 0.12), 0.92, Math.min(1, out / 4) * 0.85); const cd = Math.hypot(z + 0.7, y + 13.4); if (cd < 1.5) g = lerp(g, 0.1, 1 - sm(1.0, 1.5, cd)); else if (cd < 2.1) g = lerp(g, 0.88, (1 - sm(1.5, 2.1, cd)) * 0.7); }
      else if (y > -2 && y < 3 && Math.abs(z) < 4.5 - Math.max(0, y) * 0.4) g = 0.2 + 0.1 * fbm(i * 0.08, j * 0.08); // soft tissue over the crest
      g = Math.min(1, Math.max(0, g + (hash(i, j) - 0.5) * 0.07));
      const k = (j * w + i) * 4, v = (g * 255) | 0; d[k] = v; d[k + 1] = v; d[k + 2] = Math.min(255, v + 4); d[k + 3] = 255;
    }
  }
  c.putImageData(id, 0, 0);
  return cv;
}
/** Where the bone section sits inside the cap image (px per mm, y of the crest row, image height), for the UVs of the 3D end faces. */
export const capLayout = (w = 160) => { const S = w / 14.6, Y0 = 0.9 * S; return { S, Y0, h: Math.round(17.8 * S) }; };
export const bakeCap = (w = 160) => { const { S, Y0, h } = capLayout(w); return runAsync(coronalG(w, h, S, Y0)); };

// ── the 3 HTML panels ─────────────────────────────────────────────────────────────────────────────────────────────────
const bakes = new WeakMap();
function* bakePanel(view, w, h) {
  if (view === 'sagittal') { // window is 40 mm wide, crest at 42 % of the height
    const S = w / 40, yTop = 0.42 * h / S, win = { x0: -20, x1: 20, yTop, yBot: yTop - h / S };
    return yield* bakeLength(w, h, win, { topAt: (x) => topY(x), opaque: true });
  }
  if (view === 'coronal') return yield* coronalG(w, h, w / 22, 0.3 * h);
  const cv = mk(w, h), c = cv.getContext('2d'), id = c.createImageData(w, h), d = id.data, S = w / 40; // axial: the mandibular body seen from above at implant depth, neighbour roots as bright ovals
  for (let j = 0; j < h; j++) {
    yield;
    for (let i = 0; i < w; i++) {
      let g = 0.03 + 0.03 * fbm(i * 0.05, j * 0.05);
      const x = (i + 0.5 - w / 2) / S, z = (h * 0.5 - (j + 0.5)) / S, hwZ = 6.6, e = Math.min(hwZ - Math.abs(z), 1e9);
      if (Math.abs(z) < hwZ) { g = lerp(0.3 + 0.32 * trab(i * 0.12, j * 0.12), 0.92, (1 - sm(0, 0.95, e)) * 0.85); }
      for (const s of [-1, 1]) { const q = Math.hypot((x - s * T) / 3.3, z / 3.0); if (q < 1.14) g = q < 1 ? (q < 0.16 ? 0.3 : 0.8 + 0.1 * fbm(i * 0.2, j * 0.2)) : 0.13; }
      g = Math.min(1, Math.max(0, g + (hash(i, j) - 0.5) * 0.07));
      const k = (j * w + i) * 4, v = (g * 255) | 0; d[k] = v; d[k + 1] = v; d[k + 2] = Math.min(255, v + 4); d[k + 3] = 255;
    }
  }
  c.putImageData(id, 0, 0);
  return cv;
}

/** progress → the same stage numbers the 3D scene uses (kept here so the panels never need the scene). */
const stage = (p) => ({ scan: sm(0, 1 / 6, p), implant: sm(0.345, 0.495, p), abut: sm(4 / 6 + 0.05, 4 / 6 + 0.12, p), crown: sm(5 / 6, 5 / 6 + 0.06, p) });
// the planned crown in the sagittal slice: same trapezoid as the neighbours (mm, x across / y up from the crest), two cusps and a fossa
const CROWN = [[-4.2, -0.3], [4.2, -0.3], [3.8, 3.6], [3.2, 6.4], [2.0, 7.8], [0.9, 7.0], [0, 6.5], [-0.9, 7.0], [-2.0, 7.8], [-3.2, 6.4], [-3.8, 3.6]];

// The first call per canvas bakes a coarse version at once (~10 ms; three panes = three frames) and refines it in the background in ~6 ms slices:
// a 260 px bake in one piece was 50-65 ms, a hitch wherever it landed. When the refinement is done the pane is repainted with the last progress.
function refine(b, cv, w, h) {
  const bw = Math.min(w, 260); if (bw <= 96) return;
  runAsync(bakePanel(b.view, bw, Math.round((h * bw) / w))).then((img) => { if (bakes.get(cv) !== b) return; b.img = img; paint(b); });
}
export function drawCbct(ctx, { view = 'sagittal', progress = 0 } = {}) {
  const cv = ctx.canvas, w = cv.width, h = cv.height, key = `${view}:${w}x${h}`, lw = Math.min(w, 96);
  let b = bakes.get(cv);
  if (!b || b.key !== key) { b = { key, view, ctx, w, h, progress, img: run(bakePanel(view, lw, Math.round((h * lw) / w))) }; bakes.set(cv, b); refine(b, cv, w, h); }
  b.ctx = ctx; b.progress = progress; paint(b);
}
function paint({ ctx, view, progress, w, h, img }) {
  const st = stage(progress);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true; ctx.drawImage(img, 0, 0, w, h);
  const S = view === 'coronal' ? w / 22 : w / 40, X0 = w / 2;
  const Y0 = view === 'sagittal' ? 0.42 * h : view === 'coronal' ? 0.3 * h : 0.5 * h;
  const oy = GEO.crest(0) + outlineY(0) - 0.2;
  // planned crown (sagittal only): bright like the neighbours, under the abutment
  if (st.crown > 0.002 && view === 'sagittal') {
    ctx.save(); ctx.translate(X0 - 0.4 * S, Y0); ctx.scale(S, -S); ctx.globalAlpha = Math.min(1, st.crown * 1.4); ctx.fillStyle = '#dde1e7'; ctx.strokeStyle = 'rgba(20,24,30,.4)'; ctx.lineWidth = 0.07; ctx.lineJoin = 'round';
    ctx.beginPath(); CROWN.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // implant (white silhouette with thread notches) sliding in along its axis
  if (st.implant > 0.002 && view !== 'axial') {
    const lean = view === 'sagittal' ? GEO.tilt : 0.05, dx = -Math.sin(lean), dy = Math.cos(lean), travel = (1 - st.implant) * 12;
    ctx.save(); ctx.translate(X0, Y0 - oy * S); ctx.scale(S, -S); ctx.translate(dx * travel, dy * travel); ctx.rotate(-lean);
    ctx.globalAlpha = Math.min(1, st.implant * 3);
    ctx.fillStyle = '#f4f6f8'; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.lineTo(1.5, -8.6); ctx.lineTo(0.9, -9.8); ctx.lineTo(0, -10); ctx.lineTo(-0.9, -9.8); ctx.lineTo(-1.5, -8.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(20,24,30,.55)'; ctx.lineWidth = 0.09; ctx.beginPath(); for (let y = -1.1; y > -9.4; y -= 0.8) { ctx.moveTo(-2.1, y); ctx.lineTo(2.1, y - 0.4); } ctx.stroke();
    if (st.abut > 0.002) { ctx.globalAlpha = st.abut; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(20,24,30,.28)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(-1.9, 0); ctx.lineTo(1.9, 0); ctx.lineTo(1.4, 2.1); ctx.lineTo(-1.4, 2.1); ctx.fill(); ctx.rotate(lean); ctx.beginPath(); ctx.rect(-1.2, 2, 2.4, 3.6); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  } else if (st.implant > 0.7 && view === 'axial') { ctx.save(); ctx.globalAlpha = sm(0.7, 1, st.implant); ctx.fillStyle = '#f4f6f8'; ctx.beginPath(); ctx.arc(X0, Y0, 2 * S, 0, 7); ctx.fill(); ctx.restore(); }
  // crosshair: starts off-target, locks onto the implant site as the plan advances
  const tx = view === 'axial' ? X0 : X0 + (view === 'sagittal' ? -1.0 * S : 0), ty = view === 'axial' ? Y0 : Y0 + (view === 'coronal' ? 3.5 : 5) * S;
  const k = sm(0.17, 0.5, progress), cx = lerp(w * 0.28, tx, k) + Math.sin(progress * 9) * 2 * (1 - k), cy = lerp(h * 0.32, ty, k);
  ctx.save(); ctx.strokeStyle = ACC; ctx.fillStyle = ACC; ctx.lineWidth = Math.max(1, w / 260); ctx.globalAlpha = 0.9;
  const g = Math.max(5, w * 0.025); ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, h); ctx.stroke();
  ctx.globalAlpha = 0.55; for (let i = 1; i < 10; i++) { const t = (i * w) / 10, u = (i * h) / 10; ctx.fillRect(t, h - 5, 1, 5); ctx.fillRect(0, u, 5, 1); }
  ctx.restore();
  // step 1 scan reveal: the same sweep as the 3D scene
  if (st.scan < 0.999) { const sx = st.scan * w, f = Math.max(8, w * 0.05); ctx.save(); ctx.fillStyle = 'rgba(5,7,10,.9)'; ctx.fillRect(sx + f, 0, w, h); const gr = ctx.createLinearGradient(sx, 0, sx + f, 0); gr.addColorStop(0, 'rgba(5,7,10,0)'); gr.addColorStop(1, 'rgba(5,7,10,.9)'); ctx.fillStyle = gr; ctx.fillRect(sx, 0, f, h); ctx.fillStyle = ACC; ctx.globalAlpha = 0.9; ctx.fillRect(sx - 1, 0, 2, h); ctx.restore(); }
}
