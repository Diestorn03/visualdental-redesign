// Generates the Hero molar: a low-poly triangulated mesh (echo of the logo mark) as inline-ready SVG.
//   node tools/svg/hero-mesh.mjs   ->  tools/svg/hero-mesh.svg   (Hero.astro imports it with ?raw)
// No dependencies: Catmull-Rom outline + jittered hex grid inside + Bowyer-Watson Delaunay, clipped to the molar.
// Strokes are grouped (outline, 12 bands top to bottom, dots, facets) so hero.js can draw them in a few staggered tweens.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 400, H = 640, BANDS = 12, STEP = 25, SPACING = 38;

// Molar silhouette (clockwise from the left cervical line): two cusps with a notch, a short right root and a long left one.
const KEY = [
  [58, 318], [24, 262], [12, 190], [22, 112], [62, 52], [118, 22], [166, 34], [200, 72], [236, 40], [296, 14], [350, 44],
  [384, 110], [392, 190], [378, 262], [344, 318], [326, 392], [304, 480], [276, 560], [250, 618], [226, 566], [214, 486],
  [206, 410], [196, 366], [178, 424], [160, 504], [140, 578], [114, 628], [92, 574], [74, 490], [62, 400],
];

// deterministic PRNG so the mesh is stable between runs
let seed = 7;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* ---- outline: closed centripetal Catmull-Rom, resampled at equal arc length ---- */
function catmull(p0, p1, p2, p3, t) {
  const a = 0.5, d = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) ** a;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), tt = t1 + (t2 - t1) * t;
  const L = (A, B, ta, tb) => A.map((v, i) => ((tb - tt) / (tb - ta)) * v + ((tt - ta) / (tb - ta)) * B[i]);
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = A1.map((v, i) => ((t2 - tt) / (t2 - t0)) * v + ((tt - t0) / (t2 - t0)) * A2[i]);
  const B2 = A2.map((v, i) => ((t3 - tt) / (t3 - t1)) * v + ((tt - t1) / (t3 - t1)) * A3[i]);
  return B1.map((v, i) => ((t2 - tt) / (t2 - t1)) * v + ((tt - t1) / (t2 - t1)) * B2[i]);
}
const dense = [];
for (let i = 0; i < KEY.length; i++) {
  const [a, b, c, d] = [0, 1, 2, 3].map((k) => KEY[(i + k - 1 + KEY.length) % KEY.length]);
  for (let s = 0; s < 24; s++) dense.push(catmull(a, b, c, d, s / 24));
}
function resample(poly, step) {
  const seg = poly.map((p, i) => Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]));
  const total = seg.reduce((s, v) => s + v, 0), n = Math.round(total / step), out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k * total) / n;
    while (acc + seg[i] < target) acc += seg[i++];
    const f = (target - acc) / seg[i], p = poly[i], q = poly[(i + 1) % poly.length];
    out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
  }
  return out;
}
const outline = resample(dense, STEP);

/* ---- geometry helpers ---- */
const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const distOutline = (p) => Math.min(...outline.map((a, i) => distSeg(p, a, outline[(i + 1) % outline.length])));

/* ---- interior points: jittered hex grid ---- */
const pts = outline.map((p) => [...p]);
for (let r = 0, y = 0; y < H; y += SPACING * 0.866, r++) {
  for (let x = (r % 2) * (SPACING / 2); x < W; x += SPACING) {
    const p = [x + (rnd() - 0.5) * SPACING * 0.5, y + (rnd() - 0.5) * SPACING * 0.5];
    if (inside(p, outline) && distOutline(p) > SPACING * 0.42) pts.push(p);
  }
}

/* ---- Bowyer-Watson Delaunay ---- */
function delaunay(P) {
  const big = 4000, S = [[-big, -big], [big * 2, -big], [0, big * 2]];
  const all = [...P, ...S], n = P.length;
  const circ = (t) => { const [a, b, c] = t.map((i) => all[i]); const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d; const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d; return [ux, uy, (a[0] - ux) ** 2 + (a[1] - uy) ** 2]; };
  let tris = [{ v: [n, n + 1, n + 2] }]; tris[0].c = circ(tris[0].v);
  for (let i = 0; i < n; i++) {
    const p = all[i], bad = [], keep = [];
    for (const t of tris) ((p[0] - t.c[0]) ** 2 + (p[1] - t.c[1]) ** 2 < t.c[2] ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) for (let k = 0; k < 3; k++) { const e = [t.v[k], t.v[(k + 1) % 3]], key = e.slice().sort((a, b) => a - b).join('-'); edges.set(key, edges.has(key) ? null : e); }
    for (const e of edges.values()) if (e) { const v = [e[0], e[1], i]; keep.push({ v, c: circ(v) }); }
    tris = keep;
  }
  return tris.filter((t) => t.v.every((i) => i < n)).map((t) => t.v);
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const tris = delaunay(pts).filter((t) => {
  const [a, b, c] = t.map((i) => pts[i]);
  return inside([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3], outline) && [mid(a, b), mid(b, c), mid(c, a)].every((m) => inside(m, outline));
});

/* ---- edges, grouped in horizontal bands ---- */
const n0 = outline.length, onRim = (i, j) => i < n0 && j < n0 && (Math.abs(i - j) === 1 || Math.abs(i - j) === n0 - 1);
const edgeSet = new Map();
for (const t of tris) for (let k = 0; k < 3; k++) { const i = t[k], j = t[(k + 1) % 3]; if (!onRim(i, j)) edgeSet.set(i < j ? `${i}-${j}` : `${j}-${i}`, i < j ? [i, j] : [j, i]); }
const edges = [...edgeSet.values()].sort((a, b) => (pts[a[0]][1] + pts[a[1]][1]) / 2 - (pts[b[0]][1] + pts[b[1]][1]) / 2);
const f = (v) => +v.toFixed(1);
const seg = ([i, j]) => `M${f(pts[i][0])} ${f(pts[i][1])}L${f(pts[j][0])} ${f(pts[j][1])}`;
const per = Math.ceil(edges.length / BANDS);
const bands = Array.from({ length: BANDS }, (_, b) => edges.slice(b * per, (b + 1) * per).sort((a, c) => pts[a[0]][0] - pts[c[0]][0]).map(seg).join(''));

/* ---- facets: a few triangles with a faint fill (3 tiers = 3 paths) so it reads as solid low-poly, lit from the upper left ---- */
const tier = [[], [], []];
for (const t of tris) {
  const [a, b, c] = t.map((i) => pts[i]), cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
  const lit = 1 - (cy / H) * 0.6 - (cx / W) * 0.25 + (rnd() - 0.5) * 0.7;
  if (lit > 0.78) tier[2].push(t); else if (lit > 0.6) tier[1].push(t); else if (lit > 0.46) tier[0].push(t);
}
const tri = (t) => `M${t.map((i) => `${f(pts[i][0])} ${f(pts[i][1])}`).join('L')}Z`;

const rim = `M${outline.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z`;
const dots = pts.map((p) => `M${f(p[0])} ${f(p[1])}h.01`).join('');

const svg = `<svg class="hero__mesh" viewBox="-8 -8 ${W + 16} ${H + 16}" fill="none" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false">
<defs><linearGradient id="hero-mesh-g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".45"/></linearGradient></defs>
<g class="hero__facets" stroke="none" fill="currentColor"><path fill-opacity=".05" d="${tier[0].map(tri).join('')}"/><path fill-opacity=".1" d="${tier[1].map(tri).join('')}"/><path fill-opacity=".17" d="${tier[2].map(tri).join('')}"/></g>
<g class="hero__lines" stroke="url(#hero-mesh-g)">
<path data-outline class="hero__rim" d="${rim}"/>
${bands.map((d) => `<path data-band d="${d}"/>`).join('\n')}
</g>
<path data-dots class="hero__dots" stroke="currentColor" d="${dots}"/>
</svg>
`;
const out = fileURLToPath(new URL('./hero-mesh.svg', import.meta.url));
writeFileSync(out, svg);
console.log(`hero-mesh.svg: ${pts.length} vertices (${n0} on the rim), ${tris.length} triangles, ${edges.length} edges in ${BANDS} bands, ${(svg.length / 1024).toFixed(1)} KB`);
