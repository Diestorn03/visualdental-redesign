/*
  Digital · 3D implant-planning engine (three.js, fully procedural: no models, no textures downloaded).
  It runs in a Web Worker (scene.worker.js, canvas transferred as an OffscreenCanvas) so that nothing it does (PMREM, the first shader link, which on a
  cold GPU shader cache is 1-2.5 s of waiting for the D3D compiler, uploads, first renders of each step) can ever block the page's main thread.
  If the browser cannot do that, scene.js imports this same module on the main thread. Nothing here touches `document`/`window`: all DOM input comes in as options.

    const e = await createEngine(canvas, { reduced, lite, dpr, gizmo, accent, w, h }, emit)
    e.setProgress(p [, immediate])   0→1 over the six wizard steps (each is 1/6). Smoothed here (≈ 0.14 s) unless `reduced`.
    e.resize(w, h)                   CSS size of the canvas (the page measures it; a worker cannot)
    e.start() / e.stop()             the rAF loop; nothing renders outside it (renderNow() draws one frame, for static use)
    e.drag('down'|'move'|'up', dx, dy)  pointer drag deltas (CSS px), forwarded by the page. Fine pointers only; the wheel is never captured.
    e.setAccent('#rrggbb')           plane / axis line / crown lines / scan glow follow the page accent (--stroke), the gold abutment does not
    emit({ pj, info, st })           after every frame: pj = [x, y, visible] × 8 callout anchors (CSS px in the canvas; names in NAMES), info, state
    emit({ ev: 'lost' | 'restored' })  WebGL context lost / restored

  The whole scene is built, compiled and walked through every step (warm) BEFORE createEngine resolves, so the first real frame in front of the reader
  never pays for a program, a buffer or a texture upload. The page keeps showing the poster until then.
  Steps (p): 0 scan sweep (wire → solid) · 1 planned crown + prosthetic axis · 2 CBCT cut plane + implant screwed in · 3 surgical guide
             · 4 abutment seats (bounce + flash) · 5 crown turns solid, slow presentation orbit (±34° around the 3/4 view). Camera: Catmull-Rom through 7 poses.
  Geometry numbers live in cbct.js (GEO) so the CBCT slices always match this model. Units: mm.
*/
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GEO, sampleOutline, outlineY, drawSliceAsync, bakeCap, capLayout } from './cbct.js';

export const NAMES = ['crown', 'implantTip', 'implantBody', 'axisTop', 'abutment', 'angle', 'sleeve', 'plane'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const D2R = Math.PI / 180;
const { L, toothX: TX, tilt: TILT } = GEO;
const COS = Math.cos(TILT), SIN = Math.sin(TILT);
const mkCv = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const inWorker = typeof document === 'undefined';
// a pause between build phases: in the worker only so that messages (resize, progress) get through; on the page so that a frame can be painted
const breathe = inWorker ? () => new Promise((r) => setTimeout(r)) : () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(() => f(performance.now()), 16);
const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;

// camera poses at p = 0, 1/6 … 1: [yaw°, pitch°, distance, target x, y, z]
const KEYS = [[30, 25, 74, 0, -4, 0], [22, 28, 64, 0, -1, 0], [14, 27, 56, 0, 1, 0], [8, 15, 58, 0, -3.5, 0], [-24, 33, 62, 0, 4.5, 0], [16, 21, 44, 0, 1.5, 0], [28, 23, 63, 0, -0.5, 0]];
const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
function camPose(p, out) {
  const f = clamp01(p) * 6, i = Math.min(5, Math.floor(f)), t = f - i, a = KEYS[Math.max(0, i - 1)], b = KEYS[i], c = KEYS[i + 1], d = KEYS[Math.min(6, i + 2)];
  for (let n = 0; n < 6; n++) out[n] = cr(a[n], b[n], c[n], d[n], t);
}

// tooth profile (r, y) for r = 1 = half width; y = 0 is the gum line
const TOOTH = [[0, -9.5], [0.18, -9.2], [0.45, -7.5], [0.62, -4.5], [0.75, -1.5], [0.78, 0], [0.92, 1.2], [1, 2.6], [0.98, 4.2], [0.9, 5.5], [0.74, 6.4], [0.45, 6.9], [0, 6.7]];
// the planned crown: straighter walls and a wider occlusal table than the neighbours (a premolar/molar rather than an egg)
const CROWN = [[0, 0], [0.9, 0], [0.97, 0.7], [1, 2.2], [0.99, 3.8], [0.93, 5.0], [0.82, 5.8], [0.5, 6.2], [0, 6.0]];

export async function createEngine(canvas, { reduced = false, lite = false, dpr = 1, gizmo = true, accent = '#d4a373', w: W0 = 800, h: H0 = 500 } = {}, emit = () => {}) {
  const disposables = [];
  const keep = (o) => (disposables.push(o), o);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: false, powerPreference: 'high-performance', stencil: false });
  const PR_MAX = Math.min(dpr || 1, lite ? 1 : 1.75), PR_MIN = Math.min(1, PR_MAX); let pr = PR_MAX;
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true; renderer.autoClear = false; renderer.info.autoReset = false;
  let W = Math.max(2, Math.round(W0)), H = Math.max(2, Math.round(H0));
  renderer.setSize(W, H, false);
  await breathe();

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, W / H, 1, 400);
  const room = new RoomEnvironment(), pm = new THREE.PMREMGenerator(renderer), envRT = pm.fromScene(room, 0.04);
  const ENV = envRT.texture; pm.dispose(); room.dispose();
  await breathe();

  // ── background: cold CAD gradient + vignette, baked (dithered against banding) ──
  {
    const c = mkCv(768, 512), g = c.getContext('2d', { willReadFrequently: true });
    let r = g.createRadialGradient(384, 190, 10, 384, 250, 560); r.addColorStop(0, '#4a5b70'); r.addColorStop(0.45, '#2d3947'); r.addColorStop(1, '#0f141a'); g.fillStyle = r; g.fillRect(0, 0, 768, 512);
    r = g.createRadialGradient(384, 256, 170, 384, 256, 480); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = r; g.fillRect(0, 0, 768, 512);
    const id = g.getImageData(0, 0, 768, 512), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 5; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0);
    scene.background = keep(new THREE.CanvasTexture(c)); scene.background.colorSpace = THREE.SRGBColorSpace;
  }
  await breathe();
  const key = new THREE.DirectionalLight(0xfff0dc, 1.5), rim = new THREE.DirectionalLight(0x9fc3ff, 0.7);
  key.position.set(-22, 40, 34); rim.position.set(30, 14, -26); scene.add(key, rim, new THREE.HemisphereLight(0xeef3fb, 0x6a6a74, 2.1));

  // ── accent (the page's --stroke): plane, axis line, crown lines and the glow behind the scan band ──
  const acc = new THREE.Color(), accLin = new THREE.Color(), accSoft = new THREE.Color();
  const uni = { uScanX: { value: -99 }, uAcc: { value: new THREE.Vector3(0.95, 0.6, 0.28) } };

  // ── scan sweep: shared uniform, patched into the model materials (solid appears behind the band, wire ahead of it) ──
  const patchSolid = (sh) => {
    sh.uniforms.uScanX = uni.uScanX; sh.uniforms.uAcc = uni.uAcc;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWX;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWX = (modelMatrix * vec4(transformed, 1.0)).x;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWX;\nuniform float uScanX;\nuniform vec3 uAcc;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat sd = vWX - uScanX; if (sd > 0.0) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat sb = smoothstep(-2.6, 0.0, sd); totalEmissiveRadiance += uAcc * sb * sb * 1.6;');
  };
  const patchWire = (sh) => {
    sh.uniforms.uScanX = uni.uScanX;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWX;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWX = (modelMatrix * vec4(transformed, 1.0)).x;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWX;\nuniform float uScanX;').replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= smoothstep(-2.8, 0.6, vWX - uScanX);');
  };

  // ── materials ──
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 20); // keeps z <= constant
  const M = {
    bone: keep(new THREE.MeshStandardMaterial({ color: 0xd8c9a6, roughness: 0.68, metalness: 0, vertexColors: true, clippingPlanes: [clip] })),
    cap: keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.4, clippingPlanes: [clip] })), // the two cut ends of the jaw: a CT cross-section
    gum: keep(new THREE.MeshStandardMaterial({ color: 0xe58b95, roughness: 0.6, transparent: true, opacity: 0.6, depthWrite: false, clippingPlanes: [clip] })),
    tooth: keep(new THREE.MeshPhysicalMaterial({ color: 0xe6dac0, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4, envMap: ENV, envMapIntensity: 0.6 })),
    crown: keep(new THREE.MeshPhysicalMaterial({ color: 0xe6b27a, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3, transparent: true, opacity: 0, depthWrite: false, envMap: ENV, envMapIntensity: 0.7, emissive: 0xffffff, emissiveIntensity: 0 })),
    ti: keep(new THREE.MeshStandardMaterial({ color: 0xb4bac2, metalness: 1, roughness: 0.27, envMap: ENV, envMapIntensity: 1.25, transparent: true, side: THREE.DoubleSide })),
    gold: keep(new THREE.MeshStandardMaterial({ color: 0xd9ac55, metalness: 1, roughness: 0.24, envMap: ENV, envMapIntensity: 1.3, transparent: true, side: THREE.DoubleSide })),
    steel: keep(new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.2, envMap: ENV, envMapIntensity: 1.2, transparent: true, side: THREE.DoubleSide })),
    guide: keep(new THREE.MeshPhysicalMaterial({ color: 0x7fd4e8, roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0, depthWrite: false })),
    wire: keep(new THREE.MeshBasicMaterial({ color: 0x9cc4ee, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false })),
    crownLines: keep(new THREE.LineBasicMaterial({ color: 0xf0c48c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })),
  };
  for (const k of ['bone', 'cap', 'gum', 'tooth']) M[k].onBeforeCompile = patchSolid;
  M.wire.onBeforeCompile = patchWire;

  // ── geometry helpers ──
  const fin = (g) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4); g.computeVertexNormals(); return keep(g); };
  const lathe = (pts, seg = 40) => fin(new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), lite ? Math.round(seg * 0.6) : seg));
  function toothGeo(md, bl, { root = true, cusp = 0.8, sy = 1, seg = 48, prof: P = TOOTH, sq = 0 } = {}) {
    const prof = P.filter((q) => root || q[1] >= 0); if (!root && P === TOOTH) prof.unshift([0, 0]);
    const g = new THREE.LatheGeometry(prof.map((q) => new THREE.Vector2(q[0], q[1])), lite ? Math.round(seg * 0.6) : seg), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), z = pos.getZ(i); let y = pos.getY(i);
      const w = sm(5.1, 6.7, y), rr = Math.hypot(x, z), th = Math.atan2(z, x);
      if (sq > 0 && rr > 1e-4) { const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th)), k = 1 / Math.pow(Math.pow(c, 3) + Math.pow(s, 3), 1 / 3); x *= lerp(1, k, sq * 0.9); z *= lerp(1, k, sq * 0.9); } // squarer section (superellipse, n = 3)
      if (w > 0) y += w * cusp * (1.1 * Math.pow(Math.abs(Math.sin(th)), 2) * sm(0.15, 0.8, rr) - 0.55 * (1 - sm(0, 0.55, rr)) + 0.35 * Math.pow(Math.abs(Math.cos(th)), 2) * sm(0.5, 0.9, rr) - 0.25);
      pos.setXYZ(i, x * (md / 2), y * sy, z * (bl / 2));
    }
    return fin(g);
  }
  // bone surface with the shared ridge profile + a hint of organic noise (same function for bone and gum so they never intersect)
  const bp = (x, z, y0, o) => { const n = Math.sin(x * 1.7 + z * 2.3) * Math.sin(y0 * 1.3 + x * 0.9) * 0.09; o[0] = x; o[1] = y0 + GEO.ridgeW(y0) * GEO.crest(x) + n; o[2] = z + n * 0.8; };
  const NV = lite ? 48 : 76, NX = lite ? 70 : 120, ring = sampleOutline(NV), tmp = [0, 0, 0];
  const capFan = (NV, ring, s) => { // flat end face at x = s·L: fan around its centre
    const cp = new Float32Array((NV + 1) * 3), ci = [], x = s * L; let cy = 0, cz = 0;
    for (let j = 0; j < NV; j++) { bp(x, ring[j][0], ring[j][1], tmp); cp.set(tmp, j * 3); cy += tmp[1]; cz += tmp[2]; }
    cp.set([x, cy / NV, cz / NV], NV * 3);
    for (let j = 0; j < NV; j++) { const a = j, b = (j + 1) % NV; if (s > 0) ci.push(NV, a, b); else ci.push(NV, b, a); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(cp, 3)); g.setIndex(ci); g.computeVertexNormals(); return g;
  };
  // wire = true: body + flat caps in one piece (the coarse scan mesh). Otherwise the body alone, with a soft vertex tint, and the caps come separately (capGeo).
  function boneGeo(NX = lite ? 70 : 120, NV = lite ? 48 : 76, wire = false) {
    const ring = sampleOutline(NV), pos = new Float32Array((NX + 1) * NV * 3), idx = [];
    for (let i = 0; i <= NX; i++) for (let j = 0; j < NV; j++) { bp(-L + (2 * L * i) / NX, ring[j][0], ring[j][1], tmp); pos.set(tmp, (i * NV + j) * 3); }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NV; j++) { const a = i * NV + j, b = i * NV + ((j + 1) % NV), c = (i + 1) * NV + j, d = (i + 1) * NV + ((j + 1) % NV); idx.push(a, b, c, b, d, c); }
    const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.BufferAttribute(pos, 3)); body.setIndex(idx); body.computeVertexNormals();
    if (wire) return keep(mergeGeometries([body, capFan(NV, ring, -1), capFan(NV, ring, 1)]));
    const col = new Float32Array(pos.length); // a little low-frequency variation of the bone colour (cortical blotches), so it does not read as plastic
    for (let k = 0; k < pos.length; k += 3) { const v = 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(pos[k] * 0.55 + pos[k + 2] * 1.3) * Math.sin(pos[k + 1] * 0.7 + pos[k] * 0.3)); col[k] = v; col[k + 1] = v * 0.98; col[k + 2] = v * 0.93; }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return keep(body);
  }
  const capLay = capLayout(160);
  function capGeo(s) { // end face with UVs into the coronal section image (u mirrored on the +x end: seen from outside, +z is on the left there)
    const g = capFan(NV, ring, s), pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { const u = (pos.getZ(i) * capLay.S + 80) / 160; uv[i * 2] = s > 0 ? 1 - u : u; uv[i * 2 + 1] = (pos.getY(i) * capLay.S - capLay.Y0 + capLay.h) / capLay.h; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return keep(g);
  }
  function gumGeo() {
    let s = 0; while (!(ring[s][1] > -7 && ring[(s + NV - 1) % NV][1] <= -7)) s++;
    let m = 0; while (ring[(s + m) % NV][1] > -7 && m < NV) m++;
    const pos = new Float32Array((NX + 1) * m * 3), idx = [];
    for (let i = 0; i <= NX; i++) {
      const x = -L + (2 * L * i) / NX, bump = Math.exp(-Math.pow((Math.abs(x) - TX) / 2.8, 2));
      for (let j = 0; j < m; j++) {
        const a = ring[(s + j + NV - 1) % NV], b = ring[(s + j + 1) % NV], c = ring[(s + j) % NV];
        let tz = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tz, ty) || 1; tz /= tl; ty /= tl;
        const off = (0.5 + 0.42 * bump) * sm(0, 6, Math.min(j, m - 1 - j));
        bp(x, c[0], c[1], tmp); tmp[2] += -ty * off; tmp[1] += tz * off; pos.set(tmp, (i * m + j) * 3); // outward normal of this clockwise ring is (−ty, tz) in (z, y)
      }
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = (i + 1) * m + j, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return keep(g);
  }
  // implant thread: real helix sweep of a trapezoid profile (flat across each flank, smooth along the helix)
  function threadGeo() {
    const STEPS = lite ? 300 : 560, pitch = 0.8, y0 = -1.1, y1 = -9.6, turns = (y0 - y1) / pitch;
    const prof = [[-0.12, -0.2], [0.46, -0.045], [0.46, 0.045], [-0.12, 0.2]];
    const CORE = [[-9.6, 0.62], [-9.2, 1.0], [-8.4, 1.3], [-1.1, 1.55]];
    const core = (y) => { for (let i = 0; i < CORE.length - 1; i++) if (y <= CORE[i + 1][0]) return lerp(CORE[i][1], CORE[i + 1][1], (y - CORE[i][0]) / (CORE[i + 1][0] - CORE[i][0])); return CORE[CORE.length - 1][1]; };
    const pos = [], idx = [];
    for (let k = 0; k < 3; k++) {
      const base = pos.length / 3;
      for (let s = 0; s <= STEPS; s++) {
        const t = s / STEPS, th = -t * turns * Math.PI * 2, yc = y0 - t * (y0 - y1), rc = core(yc), hs = 0.2 + 0.8 * sm(-9.6, -7.9, yc);
        for (const q of [prof[k], prof[k + 1]]) { const r = rc + (q[0] < 0 ? q[0] : q[0] * hs); pos.push(r * Math.cos(th), yc + q[1], r * Math.sin(th)); }
      }
      for (let s = 0; s < STEPS; s++) { const a = base + 2 * s; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return keep(g);
  }

  // ── model ──
  const model = new THREE.Group(); scene.add(model);
  const bone = new THREE.Mesh(boneGeo(), M.bone), gum = new THREE.Mesh(gumGeo(), M.gum); gum.renderOrder = 1;
  const capL = new THREE.Mesh(capGeo(-1), M.cap), capR = new THREE.Mesh(capGeo(1), M.cap);
  const nGeo = toothGeo(7.2, 8.3, { cusp: 1.25 }), toothL = new THREE.Mesh(nGeo, M.tooth), toothR = new THREE.Mesh(nGeo, M.tooth);
  toothL.position.set(-TX, 1, 0); toothR.position.set(TX, 1, 0); toothR.rotation.y = Math.PI * 0.12; toothL.rotation.y = -0.1;
  model.add(bone, capL, capR, gum, toothL, toothR);
  const wireGroup = new THREE.Group(); model.add(wireGroup);
  { // the scan mesh is deliberately coarser than the surface, it reads as a CAD triangulation instead of a moiré
    const wb = new THREE.Mesh(boneGeo(lite ? 40 : 64, lite ? 28 : 40, true), M.wire), wg = toothGeo(7.2, 8.3, { seg: 22 });
    wireGroup.add(wb); for (const o of [toothL, toothR]) { const w = new THREE.Mesh(wg, M.wire); w.position.copy(o.position); w.rotation.copy(o.rotation); wireGroup.add(w); }
    wireGroup.children.forEach((w) => (w.renderOrder = 2));
  }

  const O = new THREE.Vector3(0, GEO.crest(0) + outlineY(0) - 0.2, 0); // implant platform centre
  const axis = new THREE.Group(); axis.position.copy(O); axis.rotation.z = TILT; model.add(axis);
  const J = new THREE.Vector3(-2 * SIN, O.y + 2 * COS, 0); // abutment joint, world
  // implant
  const implant = new THREE.Group(); axis.add(implant);
  implant.add(new THREE.Mesh(lathe([[0, -10], [0.6, -9.95], [0.95, -9.7], [1.2, -9.2], [1.35, -8.2], [1.55, -1.0], [1.85, -0.98], [2.0, -0.9], [2.0, -0.1], [1.95, 0], [1.15, 0], [1.0, -0.25], [0.9, -0.8], [0, -0.8]]), M.ti), new THREE.Mesh(threadGeo(), M.ti));
  // abutment: gold collar along the implant axis + post that bends back to vertical (angled abutment)
  const abut = new THREE.Group(); axis.add(abut);
  abut.add(new THREE.Mesh(lathe([[0, 0], [1.9, 0], [2.05, 0.12], [1.95, 0.55], [1.75, 1.2], [1.55, 2.0], [0, 2.0]]), M.gold));
  const post = new THREE.Group(); post.position.y = 2; post.rotation.z = -TILT; abut.add(post);
  post.add(new THREE.Mesh(lathe([[0, 0], [1.55, 0], [1.5, 1.2], [1.25, 2.8], [1.05, 3.7], [0.8, 4.15], [0, 4.25]]), M.gold), new THREE.Mesh(keep(new THREE.SphereGeometry(1.56, 24, 16)), M.gold));
  // planned crown (upright, between the neighbours): translucent amber ghost with its crease lines and cervical margin, turns solid ivory at the last step
  const crown = new THREE.Group(); crown.position.set(J.x, -0.3, 0); model.add(crown);
  const cGeo = toothGeo(8.8, 9.6, { root: false, cusp: 1.7, sy: 1.2, prof: CROWN, sq: 0.7 });
  const cm = new THREE.Mesh(cGeo, M.crown), cl = new THREE.LineSegments(keep(new THREE.EdgesGeometry(cGeo, 16)), M.crownLines);
  const mpos = []; for (let k = 0; k <= 64; k++) { const th = (k / 64) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), q = 1 / Math.pow(Math.pow(Math.abs(c), 3) + Math.pow(Math.abs(s), 3), 1 / 3); mpos.push(c * lerp(1, q, 0.9) * 4.4 * 0.9, 0.02, s * lerp(1, q, 0.9) * 4.8 * 0.9); }
  const mg = keep(new THREE.BufferGeometry()); mg.setAttribute('position', new THREE.Float32BufferAttribute(mpos, 3));
  const margin = new THREE.Line(mg, M.crownLines); // cervical margin
  cm.renderOrder = 4; cl.renderOrder = 5; margin.renderOrder = 5; crown.add(cm, cl, margin);
  // axis line (dashes, growing from the crown downwards) + vertical reference and angle arc
  const dashMat = keep(new THREE.MeshBasicMaterial({ color: 0xe9b987, transparent: true, depthWrite: false, toneMapped: false })), refMat = keep(new THREE.MeshBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
  const ND = 34, dashes = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.14, 0.55, 0.14)), dashMat, ND), m4 = new THREE.Matrix4();
  for (let i = 0; i < ND; i++) dashes.setMatrixAt(i, m4.makeTranslation(0, 13.5 - i * 0.84, 0)); dashes.renderOrder = 6; dashes.frustumCulled = false; axis.add(dashes);
  const NR = 12, ref = new THREE.InstancedMesh(dashes.geometry, refMat, NR);
  for (let i = 0; i < NR; i++) ref.setMatrixAt(i, m4.makeTranslation(O.x, O.y + 0.4 + i * 0.84, 0)); ref.renderOrder = 6; ref.frustumCulled = false; model.add(ref);
  const arc = new THREE.Mesh(keep(new THREE.TorusGeometry(11, 0.08, 6, 28, TILT)), dashMat); arc.position.copy(O); arc.rotation.z = Math.PI / 2; arc.renderOrder = 6; model.add(arc);
  // surgical guide: shells over the neighbours + bridges + housing with a steel sleeve aligned to the axis
  const guide = new THREE.Group(); model.add(guide);
  const sGeo = toothGeo(8.6, 9.8, { root: false, cusp: 0.8, sy: 1.1 });
  const shellL = new THREE.Mesh(sGeo, M.guide), shellR = new THREE.Mesh(sGeo, M.guide); shellL.position.copy(toothL.position); shellR.position.copy(toothR.position); shellL.rotation.y = toothL.rotation.y; shellR.rotation.y = toothR.rotation.y; shellL.position.y -= 0.2; shellR.position.y -= 0.2;
  const hy = 8.6, hs = (hy - O.y) / COS, hx = -hs * SIN;
  const bGeo = keep(new THREE.BoxGeometry(1, 2.1, 8.6)), bridgeL = new THREE.Mesh(bGeo, M.guide), bridgeR = new THREE.Mesh(bGeo, M.guide);
  const bl = -TX - 0.2, br = hx - 3.2; bridgeL.scale.x = br - bl; bridgeL.position.set((bl + br) / 2, hy - 0.1, 0);
  const bl2 = hx + 3.2, br2 = TX + 0.2; bridgeR.scale.x = br2 - bl2; bridgeR.position.set((bl2 + br2) / 2, hy - 0.1, 0);
  const housing = new THREE.Mesh(lathe([[2.4, -2.2], [3.4, -2.2], [3.4, 2.2], [2.4, 2.2], [2.4, -2.2]], 36), M.guide), sleeve = new THREE.Mesh(lathe([[2.1, -2.9], [2.5, -2.9], [2.5, 2.9], [2.1, 2.9], [2.1, -2.9]], 36), M.steel);
  housing.position.set(hx, hy, 0); housing.rotation.z = TILT; sleeve.position.copy(housing.position); sleeve.rotation.z = TILT; sleeve.renderOrder = 7;
  for (const o of [shellL, shellR, bridgeL, bridgeR, housing]) o.renderOrder = 5;
  guide.add(shellL, shellR, bridgeL, bridgeR, housing, sleeve);
  await breathe();
  // CBCT cut plane (the clip plane removes the front of the bone/gum; this quad shows the slice and the implant through its window)
  const ZC = 2.2, y0c = outlineY(ZC), topAt = (x) => y0c + GEO.ridgeW(y0c) * GEO.crest(x), yBot = outlineY(ZC, false), yTop = y0c + 0.5;
  const sw = lite ? 640 : 960, sh = Math.round((sw * (yTop - yBot)) / (2 * L)), sliceCv = mkCv(sw, sh);
  const sliceOpts = { w: sw, h: sh, yBot, yTop, topAt, window: { ox: O.x, oy: O.y, ax: -SIN, ay: COS }, accent };
  const sliceCtx = sliceCv.getContext('2d');
  await drawSliceAsync(sliceCtx, sliceOpts);
  const sliceTex = keep(new THREE.CanvasTexture(sliceCv)); sliceTex.colorSpace = THREE.SRGBColorSpace; sliceTex.anisotropy = 4;
  const planeGeo = keep(new THREE.PlaneGeometry(2 * L, yTop - yBot));
  const cut = new THREE.Group(); cut.position.y = (yTop + yBot) / 2; model.add(cut);
  const cutMat = keep(new THREE.MeshBasicMaterial({ map: sliceTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
  const cutMesh = new THREE.Mesh(planeGeo, cutMat); cutMesh.renderOrder = 3; cut.add(cutMesh);
  const capTex = keep(new THREE.CanvasTexture(await bakeCap(160))); capTex.colorSpace = THREE.SRGBColorSpace; capTex.anisotropy = 4; M.cap.map = M.cap.emissiveMap = capTex;
  await breathe();
  // scan curtain
  const scanMat = keep(new THREE.MeshBasicMaterial({ color: 0xd4a373, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const scanGeo = keep(new THREE.PlaneGeometry(28, 30).rotateY(Math.PI / 2)), scan = new THREE.Group(); scan.position.y = -3; scan.renderOrder = 8;
  const scanLine = keep(new THREE.LineBasicMaterial({ color: 0xf0c48c, transparent: true, opacity: 0.9, toneMapped: false }));
  scan.add(new THREE.Mesh(scanGeo, scanMat), new THREE.LineSegments(keep(new THREE.EdgesGeometry(scanGeo)), scanLine)); model.add(scan);
  // seat flash (gold: it belongs to the abutment, not to the page accent)
  const glowTex = (() => { const c = mkCv(128, 128), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,230,190,1)'); r.addColorStop(0.3, 'rgba(240,180,110,.5)'); r.addColorStop(1, 'rgba(240,180,110,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return keep(new THREE.CanvasTexture(c)); })();
  const flash = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }))); flash.position.y = 0.6; flash.renderOrder = 9; axis.add(flash);
  // floor grid + soft contact shadow
  const floorY = GEO.baseY - 0.5;
  const grid = new THREE.Mesh(keep(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2)), keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = (modelMatrix * vec4(position, 1.0)).xz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vP; void main(){ vec2 a = vP / 4.0, b = vP / 20.0; vec2 g = abs(fract(a - 0.5) - 0.5) / fwidth(a), h = abs(fract(b - 0.5) - 0.5) / fwidth(b); float l = 1.0 - min(min(g.x, g.y), 1.0), m = 1.0 - min(min(h.x, h.y), 1.0); float f = 1.0 - smoothstep(14.0, 78.0, length(vP)); gl_FragColor = vec4(0.5, 0.64, 0.82, (l * 0.14 + m * 0.3) * f); }',
  })));
  grid.position.y = floorY; grid.renderOrder = -2; model.add(grid);
  const shadowTex = (() => { const c = mkCv(256, 128), g = c.getContext('2d'), r = g.createRadialGradient(128, 64, 0, 128, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.65)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.setTransform(1, 0, 0, 0.5, 0, 32); g.fillStyle = r; g.fillRect(0, 0, 256, 256); return keep(new THREE.CanvasTexture(c)); })();
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(74, 34).rotateX(-Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }))); shadow.position.y = floorY + 0.02; shadow.renderOrder = -1; model.add(shadow);

  // ── axis gizmo (own scene, bottom-left corner) ──
  const gz = new THREE.Scene(), gzCam = new THREE.OrthographicCamera(-1.9, 1.9, 1.9, -1.9, 0.1, 20), up = new THREE.Vector3(0, 1, 0);
  const cylG = keep(new THREE.CylinderGeometry(0.05, 0.05, 1, 6)), coneG = keep(new THREE.ConeGeometry(0.13, 0.32, 10));
  for (const [dx, dy, dz, col, ch] of [[1, 0, 0, 0xe0605c, 'X'], [0, 1, 0, 0x7ccf6e, 'Y'], [0, 0, 1, 0x5f8fe6, 'Z']]) {
    const d = new THREE.Vector3(dx, dy, dz), q = new THREE.Quaternion().setFromUnitVectors(up, d), mt = keep(new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    const a = new THREE.Mesh(cylG, mt); a.quaternion.copy(q); a.position.copy(d).multiplyScalar(0.5); const b = new THREE.Mesh(coneG, mt); b.quaternion.copy(q); b.position.copy(d).multiplyScalar(1.1);
    const c = mkCv(64, 64), g = c.getContext('2d'); g.font = '600 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillText(ch, 32, 34);
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(new THREE.CanvasTexture(c)), transparent: true, toneMapped: false, depthTest: false }))); sp.scale.setScalar(0.55); sp.position.copy(d).multiplyScalar(1.5);
    gz.add(a, b, sp);
  }
  const hub = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 10, 8)), keep(new THREE.MeshBasicMaterial({ color: 0xcfd8e3 }))); gz.add(hub);

  // ── state, camera, interaction ──
  let p = 0, ps = 0, rafId = 0, last = 0, clock = 0, orbT = 0, dirty = true, lost = false, running = false;
  let userYaw = 0, userPitch = 0, vYaw = 0, drag = false, lastTouch = -1e9;
  const pose = new Array(6).fill(0), v3 = new THREE.Vector3(), tc = new THREE.Color();
  const S = { scan: 0, crown: 0, axis: 0, impl: 0, abut: 0, plane: 0, guide: 0, solid: 0 };

  function setAccent(hex, rebake) {
    acc.set(hex); accLin.copy(acc); // THREE.Color keeps working-space (linear) values after set(): these are the numbers shaders and materials want
    accSoft.copy(acc).lerp(tc.set(0xffffff), 0.22);
    dashMat.color.copy(accSoft); scanMat.color.copy(acc); scanLine.color.copy(accSoft); M.crownLines.color.copy(accSoft);
    uni.uAcc.value.set(Math.min(1.15, accLin.r * 1.45), Math.min(1.15, accLin.g * 1.45), Math.min(1.15, accLin.b * 1.45));
    M.crown.emissive.copy(acc);
    sliceOpts.accent = '#' + acc.getHexString(THREE.SRGBColorSpace); dirty = true;
    if (rebake) drawSliceAsync(sliceCtx, sliceOpts).then(() => { sliceTex.needsUpdate = true; dirty = true; }); // the frame of the cut plane is baked into its texture
  }
  setAccent(accent);

  function apply() {
    const q = ps * 6, u0 = clamp01(q), u1 = clamp01(q - 1), u2 = clamp01(q - 2), u3 = clamp01(q - 3), u4 = clamp01(q - 4), u5 = clamp01(q - 5);
    // 1 · scan: band crosses the model, wire ahead of it, solid behind it
    const sx = u0 >= 1 ? 99 : lerp(-L - 3, L + 3, sm(0, 1, u0)); uni.uScanX.value = sx;
    scan.visible = u0 > 0.002 && u0 < 0.998; scan.position.x = sx; wireGroup.visible = u0 < 0.998; S.scan = u0;
    // 2 · planned crown (ghost) + prosthetic axis; at the last step it turns solid ivory early (by 1/3 of the step) so the middle of step 6 already shows a finished tooth
    const cIn = easeOut(sm(0, 0.8, u1)), g = M.guide.opacity / 0.34;
    crown.visible = cIn > 0.003; crown.position.y = -0.3 + (1 - cIn) * 4.5;
    const ghost = (0.42 - 0.27 * g) * cIn, solid = sm(0, 0.3, u5);
    M.crown.opacity = lerp(ghost, 1, solid); M.crown.depthWrite = solid > 0.95;
    M.crown.color.setRGB(lerp(Math.min(1, accLin.r * 1.17), 0.84, solid), lerp(Math.min(1, accLin.g * 1.17), 0.76, solid), lerp(Math.min(1, accLin.b * 1.17), 0.62, solid)); // linear: accent ghost → ivory
    M.crown.emissiveIntensity = 0.28 * cIn * (1 - solid) + 0.55 * Math.exp(-Math.pow((u5 - 0.16) / 0.1, 2)); // amber ghost, and a short glow while it turns solid
    M.crownLines.opacity = 0.7 * cIn * (1 - solid); S.crown = cIn; S.solid = solid;
    const grow = easeOut(sm(0.15, 0.95, u1)) * (1 - sm(0, 0.35, u5)); S.axis = grow;
    dashes.visible = ref.visible = arc.visible = grow > 0.01; dashes.count = Math.max(1, Math.ceil(ND * grow)); dashMat.opacity = Math.min(1, grow * 3) * 0.95;
    ref.count = Math.ceil(NR * clamp01(grow * 1.3)); refMat.opacity = 0.5 * Math.min(1, grow * 3);
    // 3 · CBCT plane sweeps in, implant is screwed down the axis
    const pin = easeOut(sm(0, 0.3, u2)), pout = sm(0, 0.25, u3), amt = pin * (1 - pout); S.plane = amt;
    const cz = lerp(9, ZC, amt); clip.constant = cz; cut.position.z = cz + 0.03; cut.visible = amt > 0.01; cutMat.opacity = amt;
    const tt = clamp01((u2 - 0.12) / 0.72), dd = 12 * (1 - easeOut(tt)), fade = sm(0, 0.12, u2);
    implant.position.y = dd; implant.rotation.y = dd * Math.PI; implant.visible = fade > 0.003; M.ti.opacity = fade; S.impl = fade;
    // 4 · surgical guide drops on the neighbours, then fades
    const gIn = sm(0.1, 0.35, u3) * (1 - sm(0.84, 1, u3)); M.guide.opacity = 0.34 * gIn; M.steel.opacity = gIn; S.guide = gIn;
    guide.visible = gIn > 0.003; guide.position.y = 14 * (1 - easeOut(clamp01((u3 - 0.1) / 0.55)));
    // 5 · abutment falls, seats with a little bounce and a flash
    const ta = clamp01(u4 / 0.62), tcc = clamp01((u4 - 0.62) / 0.38), bounce = ta >= 1 ? 0.5 * Math.exp(-5.5 * tcc) * Math.abs(Math.sin(tcc * Math.PI * 2.4)) : 0;
    abut.position.y = u4 <= 0 ? 9 : 9 * (1 - ta * ta) + bounce; abut.visible = u4 > 0.002 || ps >= 5 / 6; if (ps >= 5 / 6) abut.position.y = 0;
    M.gold.opacity = sm(0, 0.07, u4); S.abut = M.gold.opacity;
    const fl = Math.exp(-Math.pow((u4 - 0.64) / 0.07, 2)) * (u4 > 0 && u4 < 1 ? 1 : 0); flash.material.opacity = fl * 0.95; flash.scale.setScalar(2 + 8 * fl); flash.visible = fl > 0.01;
    // camera: scripted path + idle drift + presentation orbit (a slow swing of ±34° around the 3/4 view: never edge-on) + user drag
    camPose(ps, pose);
    const aspect = W / H, k = Math.max(1, 1.55 / aspect), orb = sm(0.1, 0.5, u5);
    const yaw = (pose[0] + userYaw * 57.2958) * D2R + (reduced ? 0 : Math.sin(clock * 0.4) * 0.035) + Math.sin(orbT * 0.35) * 0.6 * orb;
    const pitch = Math.max(4 * D2R, Math.min(82 * D2R, (pose[1] + userPitch * 57.2958) * D2R)), r = pose[2] * k, cp = Math.cos(pitch);
    camera.position.set(pose[3] + r * cp * Math.sin(yaw), pose[4] + r * Math.sin(pitch), pose[5] + r * cp * Math.cos(yaw)); camera.lookAt(pose[3], pose[4], pose[5]);
    return orb;
  }

  const gsz = () => Math.round(Math.min(104, Math.max(64, H * 0.18)));
  function paint() { // everything for one image, nothing time-dependent: the build uses it to render each step once
    apply(); scene.updateMatrixWorld(); renderer.info.reset();
    renderer.clear(); renderer.setViewport(0, 0, W, H); renderer.render(scene, camera);
    if (!gizmo) return;
    const gs = gsz(), m = 12;
    gzCam.position.copy(camera.position).sub(v3.set(pose[3], pose[4], pose[5])).normalize().multiplyScalar(6); gzCam.up.copy(camera.up); gzCam.lookAt(0, 0, 0);
    renderer.setScissorTest(true); renderer.setViewport(m, m, gs, gs); renderer.setScissor(m, m, gs, gs); renderer.clearDepth(); renderer.render(gz, gzCam); renderer.setScissorTest(false);
  }

  // project(): callout anchors (object-local points, so they follow descents and the tilt)
  const PTS = {
    crown: [crown, 0, 7.6, 0, () => S.crown > 0.35],
    implantTip: [implant, 0, -10, 0, () => S.impl > 0.5 && S.plane > 0.3],
    implantBody: [implant, 2.1, -5, 0, () => S.impl > 0.5 && S.plane > 0.3],
    axisTop: [axis, 0, 12, 0, () => S.axis > 0.7],
    abutment: [abut, 2.1, 1.0, 0, () => S.abut > 0.5],
    angle: [model, O.x - 11 * Math.sin(TILT / 2), O.y + 11 * Math.cos(TILT / 2), 0, () => S.axis > 0.6],
    sleeve: [guide, hx + 3.5, hy, 0, () => S.guide > 0.5],
    plane: [cut, L - 2, y0c - 1.8 - (yTop + yBot) / 2, 0, () => S.plane > 0.5],
  };
  function projectAll() {
    const a = new Array(NAMES.length * 3); camera.updateMatrixWorld();
    NAMES.forEach((n, i) => {
      const e = PTS[n]; e[0].updateWorldMatrix(true, false);
      v3.set(e[1], e[2], e[3]).applyMatrix4(e[0].matrixWorld).project(camera);
      a[i * 3] = (v3.x * 0.5 + 0.5) * W; a[i * 3 + 1] = (-v3.y * 0.5 + 0.5) * H;
      a[i * 3 + 2] = e[4]() && v3.z < 1 && Math.abs(v3.x) < 1.02 && Math.abs(v3.y) < 1.02 ? 1 : 0;
    });
    return a;
  }
  const publish = () => emit({ pj: projectAll(), info: { ...renderer.info.render, pr: +pr.toFixed(2) }, st: { p, ps, ...S } });

  function frame(dt) {
    clock += dt;
    if (reduced) ps = p; else ps += (p - ps) * (1 - Math.exp(-dt * 7)); if (Math.abs(p - ps) < 1e-5) ps = p;
    // user orbit: inertia, then drift back to the scripted pose when idle (stays put on the last step so a presenter can show it)
    if (!drag) { userYaw += vYaw * dt; vYaw *= Math.exp(-dt * 3); if (clock - lastTouch > 2.5 && ps < 0.93) { const f = Math.exp(-dt * 0.7); userYaw *= f; userPitch *= f; } }
    if (!reduced && ps > 5 / 6 + 0.02) orbT += dt;
    paint(); publish();
  }
  const needsFrames = () => !reduced || dirty || drag || Math.abs(vYaw) > 0.01 || Math.abs(p - ps) > 1e-4;

  // adaptive resolution. Pixels are the only thing that scales with the screen, so when the display stays clearly behind its own period
  // (90 frames in a row ≥ 1.6× the best period seen, so one 40 ms first-use hitch can never trigger it) the pixel ratio steps down
  // (1.75 → 1.4 → 1.12 → 1.0). It never goes below 1.0: a soft 3D is worse than a slow one. It climbs back after 120 calm frames.
  let period = 16.7, slowRun = 0, calm = 0, skip = 60;
  function adapt(ms) {
    if (reduced || ms > 250) return; // tab switches and long pauses say nothing about the GPU
    if (skip > 0) { skip--; return; }
    period = Math.max(6.5, Math.min(period * 1.002, ms));
    if (ms > Math.max(period * 1.6, 20)) { calm = 0; if (++slowRun >= 90 && pr > PR_MIN) { pr = Math.max(PR_MIN, pr * 0.8); slowRun = 0; skip = 40; renderer.setPixelRatio(pr); resize(); } }
    else { slowRun = 0; if (ms < period * 1.25 && ++calm > 120 && pr < PR_MAX) { pr = Math.min(PR_MAX, pr * 1.15); calm = 0; skip = 40; renderer.setPixelRatio(pr); resize(); } }
  }
  function loop(now) {
    rafId = raf(loop);
    const ms = last ? now - last : 16.7, dt = Math.min(0.05, ms / 1000); last = now;
    if (lost || !needsFrames()) return;
    adapt(ms); dirty = false; frame(dt);
  }
  const onLost = (e) => { e.preventDefault(); lost = true; emit({ ev: 'lost' }); }, onRest = () => { lost = false; dirty = true; emit({ ev: 'restored' }); };
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRest);

  function resize(nw, nh) {
    if (nw) W = Math.max(2, Math.round(nw)); if (nh) H = Math.max(2, Math.round(nh));
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); dirty = true;
  }
  await breathe();

  // warm-up 1: compile every program (also those of things that are hidden at p = 0) and upload the textures, in parallel (KHR_parallel_shader_compile)
  {
    const all = []; scene.traverse((o) => { if (!o.visible) all.push(o); o.visible = true; }); gz.traverse((o) => { if (!o.visible) all.push(o); o.visible = true; });
    for (const t of [sliceTex, capTex, glowTex, shadowTex, scene.background]) renderer.initTexture(t);
    try { await renderer.compileAsync(scene, camera); await renderer.compileAsync(gz, gzCam); } catch { renderer.compile(scene, camera); renderer.compile(gz, gzCam); }
    for (const o of all) o.visible = false;
  }
  // warm-up 2: draw every step once (buffers go to the GPU, each program runs once, MSAA targets exist) while nobody looks: the first real frame is an ordinary one
  const real = { p, ps };
  for (const q of [0, 0.08, 0.17, 0.26, 0.34, 0.42, 0.5, 0.58, 0.67, 0.75, 0.84, 0.92, 1]) { ps = q; paint(); await breathe(); }
  ps = real.ps; p = real.p; paint(); dirty = true; last = 0; // the canvas holds a correct first frame already

  return {
    setProgress(x, immediate) { p = clamp01(+x || 0); if (immediate) ps = p; dirty = true; },
    resize, setAccent: (hex) => setAccent(hex, true),
    start() { running = true; if (!rafId) { last = 0; rafId = raf(loop); } },
    stop() { running = false; caf(rafId); rafId = 0; },
    renderNow() { frame(0.016); },
    drag(kind, dx = 0, dy = 0) {
      if (kind === 'down') { drag = true; vYaw = 0; lastTouch = clock; }
      else if (kind === 'move') { if (!drag) return; userYaw -= dx * 0.0075; userPitch = Math.max(-0.45, Math.min(0.5, userPitch + dy * 0.005)); vYaw = -dx * 0.0075 * 18; lastTouch = clock; dirty = true; }
      else { drag = false; lastTouch = clock; }
    },
    warm: () => Promise.resolve(),
    _dbg: { scene, renderer, camera, model, gz, M, grid, shadow, bone, gum, wireGroup, crown, scan, cut, ENV }, // probes only
    dispose() {
      caf(rafId); rafId = 0; running = false;
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRest);
      for (const o of disposables) o.dispose?.(); envRT.dispose(); renderer.dispose();
    },
  };
}
