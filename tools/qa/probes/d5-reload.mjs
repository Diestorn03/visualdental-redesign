// d5-reload: what happens to the scroll position and to the frames when the page is reloaded mid-scroll (F5), and when the footer "Reduce motion" switch reloads it.
// node tools/qa/probes/d5-reload.mjs --device=desktop|mobile --sec=services --frac=0.5
import { launch, wheel, touchScroll, waitSettled, pullRec, analyze, save, sleep } from './d5-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const device = arg('device', 'desktop'), sec = arg('sec', 'services'), frac = +arg('frac', 0.5);
const S = await launch(`reload-${device}`, { device, wait: 3500 });
const touch = device !== 'desktop';
const reach = async (ty) => { for (let g = 0; g < 400; g++) { const y = await S.eval('scrollY'); const d = ty - y; if (Math.abs(d) < 50) break; if (touch) { await touchScroll(S, { dist: Math.min(600, Math.abs(d)), speed: 1500, dir: d > 0 ? 'down' : 'up' }); await sleep(120); } else { await wheel(S, { dy: Math.max(-300, Math.min(300, d)) }); await sleep(28); } } await waitSettled(S, { quiet: 500, max: 6000 }); };
const target = await S.eval(`(() => { const s = document.getElementById(${JSON.stringify(sec)}); return s.getBoundingClientRect().top + scrollY + s.offsetHeight * ${frac}; })()`);
await reach(target);
const probe = `(() => { const ids = ['top','about','services','process','education','stories','faq','contact']; let cur = null; for (const id of ids) { const s = document.getElementById(id); if (s && s.getBoundingClientRect().top <= innerHeight * 0.5) cur = s; } const r = cur.getBoundingClientRect(); return { y: Math.round(scrollY), sec: cur.id, frac: +(-r.top / r.height).toFixed(3), h: document.documentElement.scrollHeight }; })()`;
const before = await S.eval(probe);
console.log('before reload', JSON.stringify(before));
const T0 = Date.now();
await S.send('Page.reload');
// sample scrollY from the Node side at ~40 ms
const samples = [];
const t1 = Date.now();
while (Date.now() - t1 < 7000) { try { samples.push([Date.now() - T0, await S.eval('(() => [scrollY, document.documentElement.scrollHeight, document.readyState, document.documentElement.className])()')]); } catch { samples.push([Date.now() - T0, 'n/a']); } await sleep(60); }
const compact = []; let last = '';
for (const [t, v] of samples) { const k = JSON.stringify(v); if (k !== last) { compact.push([t, v]); last = k; } }
console.log('scrollY / height / readyState over time after F5:'); compact.slice(0, 40).forEach(([t, v]) => console.log('  +' + t + 'ms', JSON.stringify(v)));
await pullRec(S);
const a = analyze(S.rec, { from: T0, minJump: 15 });
const after = await S.eval(probe);
console.log('after reload ', JSON.stringify(after));
console.log(`frames since reload: jumps=${a.scrollJumps.length} heightChanges=${a.docHeightChanges.length} sectionShifts=${a.sectionShifts.length} CLS=${a.clsTotal} dt max=${a.dt.max}`);
a.scrollJumps.slice(0, 8).forEach((j) => console.log('   JUMP', JSON.stringify(j)));
a.docHeightChanges.slice(0, 10).forEach((j) => console.log('   HEIGHT', JSON.stringify(j)));
const ev = S.rec.ev.filter((e) => e.T >= T0 && ['st-refresh', 'vd:ready', 'resize', 'split-add'].includes(e.type)).map((e) => ({ T: Math.round(e.T - T0), type: e.type, y: Math.round(e.y) }));
console.log('events:', JSON.stringify(ev.slice(0, 30)));
save(`reload-${device}.json`, { before, after, compact, a: { dt: a.dt, scrollJumps: a.scrollJumps, docHeightChanges: a.docHeightChanges, sectionShifts: a.sectionShifts.slice(0, 40), cls: a.cls }, ev });
S.close();
