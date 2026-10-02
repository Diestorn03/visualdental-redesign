// d3: which compositor layers get (re)painted while wheel-scrolling a region? Uses CDP LayerTree.layerPainted (count + painted area per layer) and maps layers to DOM nodes.
// Usage: node tools/qa/probes/d3-layers.mjs <y0> <y1> [dpr=1]
import { launch, sleep } from './d3-lib.mjs';

const Y0 = +(process.argv[2] || 0), Y1 = +(process.argv[3] || 1000), DPR = +(process.argv[4] || 1);
const PORT = +(process.env.CDP_PORT || 9403);
const b = await launch({ port: PORT, dpr: DPR, url: 'http://127.0.0.1:4403/' });
await sleep(4200);
await b.send('DOM.enable'); await b.send('DOM.getDocument', { depth: 0 });
await b.ev(`window.__lenis.scrollTo(${Math.max(0, Y0 - 500)}, { immediate: true, force: true }); 1`);
await sleep(1500);
const layers = new Map(); const painted = new Map();
let nChange = 0;
b.listeners.push((m) => {
  if (m.method === 'LayerTree.layerTreeDidChange') { nChange++; for (const l of m.params.layers || []) layers.set(l.layerId, l); }
  if (m.method === 'LayerTree.layerPainted') { const { layerId, clip } = m.params; const p = painted.get(layerId) || { n: 0, area: 0 }; p.n++; p.area += clip.width * clip.height; painted.set(layerId, p); }
});
await b.send('LayerTree.enable');
const rnd = (a, c) => a + Math.floor(Math.random() * (c - a + 1));
let guard = 0;
while (guard++ < 400) { const y = await b.ev('scrollY'); if (y >= Y1) break; for (let i = 0; i < 8; i++) { await b.wheel(100); await sleep(rnd(20, 30)); } await sleep(150); }
await sleep(800);
const rows = [];
for (const [id, p] of painted) {
  const l = layers.get(id); let d = '?';
  if (l?.backendNodeId) { try { const r = await b.send('DOM.describeNode', { backendNodeId: l.backendNodeId }); const nd = r.node; const at = nd.attributes || []; const get = (k) => { const i = at.indexOf(k); return i >= 0 ? at[i + 1] : ''; }; d = `${nd.nodeName.toLowerCase()}${get('id') ? '#' + get('id') : ''}${get('class') ? '.' + get('class').split(' ').slice(0, 2).join('.') : ''}`; } catch { d = 'node?'; } }
  rows.push({ id, d, n: p.n, mpx: +(p.area / 1e6).toFixed(2), w: l?.width, h: l?.height, y: l?.offsetY });
}
rows.sort((a, c) => c.mpx - a.mpx);
console.log(`region ${Y0}..${Y1}: layerTreeDidChange x${nChange}, layers painted: ${rows.length}, total painted Mpx ${rows.reduce((a, r) => a + r.mpx, 0).toFixed(1)}`);
for (const r of rows.slice(0, 18)) console.log(`  ${String(r.mpx).padStart(6)} Mpx  x${String(r.n).padStart(4)}  layer ${r.w}x${r.h}  ${r.d}`);
await b.close();
