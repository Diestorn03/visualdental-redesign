// d1-layers: dump the compositor layer tree (id, size, owner element) at a few scroll positions.  node tools/qa/probes/d1-layers.mjs [y1 y2 ...]
import { launch, install, engineUrlOf, sleep, OUT } from './d1-lib.mjs';
const ys = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number); if (!ys.length) ys.push(0, 600, 1200);
const BASE = 'http://127.0.0.1:4401'; const dir = OUT('d1');
const c = await launch({ port: 9401, w: 1366, h: 820, profile: `${dir}/profile-layers` });
await install(c, await engineUrlOf(BASE));
let layers = [];
let nEv = 0; c.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange') { nEv++; if (m.params.layers) layers = m.params.layers; } });
await c.send('DOM.enable'); await c.send('LayerTree.enable');
await c.send('Page.navigate', { url: BASE + '/' }); await sleep(5000);
const nodeCache = new Map();
async function name(id) { if (!id) return '-'; if (nodeCache.has(id)) return nodeCache.get(id); try { const r = await c.send('DOM.describeNode', { backendNodeId: id }); const n = r.node; const cls = (n.attributes || []).find((x, i, a) => a[i - 1] === 'class'); const idv = (n.attributes || []).find((x, i, a) => a[i - 1] === 'id'); const s = `${n.nodeName.toLowerCase()}${idv ? '#' + idv : ''}${cls ? '.' + cls.split(' ').slice(0, 2).join('.') : ''}`; nodeCache.set(id, s); return s; } catch { return '?'; } }
for (const y of ys) {
  await c.ev(`__d1.getLenis().scrollTo(${y}, { immediate: true, force: true }); 0`); await sleep(1800);
  console.log(`\n=== scrollY ${y}: ${layers.length} layers`);
  for (const l of [...layers].sort((a, b) => b.width * b.height - a.width * a.height)) { if (l.width * l.height < 2000) continue; console.log(`  L${String(l.layerId).padEnd(4)} ${String(Math.round(l.width)).padStart(5)}x${String(Math.round(l.height)).padEnd(5)} @(${Math.round(l.offsetX)},${Math.round(l.offsetY)}) draws=${l.drawsContent ? 1 : 0} ${await name(l.backendNodeId)}`); }
}
await c.close(); process.exit(0);
