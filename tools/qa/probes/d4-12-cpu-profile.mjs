// d4-12: CPU profile (V8 sampling) while a COLD page is scrolled top->bottom with an eased rAF scroll; aggregates self time by function and
// lists the long frames with the scroll position they happened at.   node tools/qa/probes/d4-12-cpu-profile.mjs [w] [h] [port]
import { launch, sleep } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `cpu${W}` });
await b.open('http://127.0.0.1:4404/');
await b.evalJs(`(() => { let on = false, S = []; const tick = (t) => { if (on) S.push([+t.toFixed(1), +scrollY.toFixed(1)]); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__r = { start() { S = []; on = true; }, stop() { on = false; return S; } }; })()`);
const max = await b.evalJs('document.documentElement.scrollHeight - innerHeight');
await b.send('Profiler.enable'); await b.send('Profiler.setSamplingInterval', { interval: 200 }); await b.send('Profiler.start');
await b.evalJs('__r.start()');
await b.evalJs(`(() => { const t0 = performance.now(), D = 14000; const f = (now) => { const p = Math.min(1, (now - t0) / D); window.scrollTo(0, ${max} * p); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
await sleep(15500);
const { profile } = await b.send('Profiler.stop');
const S = await b.evalJs('__r.stop()');
const long = []; S.forEach((s, i) => { if (i && s[0] - S[i - 1][0] > 40) long.push(`${Math.round(s[0] - S[i - 1][0])}ms@${Math.round(s[1])}`); });
console.log('scrolled', max, 'px in 14 s (≈', Math.round(max / 14), 'px/s); frames>40ms:', long.length, long.join(' '));
// self time
const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map();
const dts = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().slice(0, 40)}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + dts[i] / 1000); });
const top = [...self.entries()].sort((a, c) => c[1] - a[1]).slice(0, 18);
console.log('top self time (ms):'); top.forEach(([k, v]) => console.log('  ', v.toFixed(0).padStart(6), k));
const byUrl = new Map(); profile.samples.forEach((id, i) => { const u = byId.get(id).callFrame.url.split('/').pop().slice(0, 40) || '(native/idle)'; byUrl.set(u, (byUrl.get(u) || 0) + dts[i] / 1000); });
console.log('by script (ms):', JSON.stringify([...byUrl.entries()].sort((a, c) => c[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)])));
await b.close(); process.exit(0);
