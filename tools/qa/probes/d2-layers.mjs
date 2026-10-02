// d2-layers: composited layers at a given scroll position (count, size, compositing reasons, owner node) + whether the marquee animation is composited.
//   node tools/qa/probes/d2-layers.mjs --y=16000 [--cond=base]
import { launch, goto, sleep, arg } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const c = await launch({ port: +arg('port', 9402), profile: 'lay', w: +arg('w', 1366), h: +arg('h', 820) });
const cond = CONDS[arg('cond', 'base')];
if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: 4000 });
await c.ev(`scrollTo(0, ${+arg('y', 16000)}); 1`); await sleep(3000);
let layers = null; c.on('LayerTree.layerTreeDidChange', (p) => { if (p.layers) layers = p.layers; });
await c.send('LayerTree.enable'); await sleep(1500);
await c.send('DOM.getDocument', { depth: -1 });
console.log('layers:', layers?.length);
const rows = [];
for (const l of layers || []) {
  let reasons = []; try { reasons = (await c.send('LayerTree.compositingReasons', { layerId: l.layerId })).compositingReasonIds || []; } catch {}
  let d = ''; if (l.backendNodeId) { try { const x = await c.send('DOM.describeNode', { backendNodeId: l.backendNodeId }); const a = x.node.attributes || []; d = x.node.nodeName + '.' + (a[a.indexOf('class') + 1] || '').slice(0, 36); } catch {} }
  rows.push({ w: Math.round(l.width), h: Math.round(l.height), area: l.width * l.height, d, reasons: reasons.join(',') });
}
rows.sort((a, b) => b.area - a.area);
console.log('total layer area (Mpx):', (rows.reduce((a, r) => a + r.area, 0) / 1e6).toFixed(2), 'viewport Mpx', (1366 * 820 / 1e6).toFixed(2));
rows.slice(0, 30).forEach((r) => console.log(`  ${String(r.w).padStart(5)}x${String(r.h).padEnd(6)} ${r.d.padEnd(46)} ${r.reasons}`));
const st = await c.ev(`(() => { const t = document.querySelector('.strip__track'); const a = t && t.getAnimations(); return t ? { n: a.length, state: a[0]?.playState, pending: a[0]?.pending, name: a[0]?.animationName, will: getComputedStyle(t).willChange, anim: getComputedStyle(t).animationName, off: !!t.closest('[data-offscreen]') } : null; })()`);
console.log('strip track animation:', JSON.stringify(st));
await c.close();
