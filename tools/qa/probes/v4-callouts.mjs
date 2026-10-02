// v4 verifier: sweeps global progress 0..1 and reports every overlap/clip between the HTML callouts and the other overlay elements of the viewport
// (vp label, drag hint, gizmo, window edges), plus callout-vs-callout. Pure geometry, no screenshots.
//   node tools/qa/probes/v4-callouts.mjs --name=co1366 --w=1366 --h=820 [--mobile] [--n=60]
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : '1']; }));
const name = args.name || 'co';
const W = +(args.w || 1366), H = +(args.h || 820), mobile = !!args.mobile, dpr = +(args.dpr || (mobile ? 2 : 1));
process.env.SHOTS_DIR = `C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v4-r2/${name}/`;
const { launch, sleep } = await import('./d4-lib.mjs');
import { writeFileSync } from 'node:fs';
const b = await launch({ port: +(args.port || 9424), w: W, h: H, tag: 'c' });
await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile });
if (mobile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.open('http://127.0.0.1:4424/', 4500);
const scrollTo = async (y, wait = 1100) => { await b.evalJs(`window.scrollTo(0, ${Math.round(y)}); 1`); await sleep(wait); };
const top = await b.evalJs(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
for (const f of [-1.6, -0.9, -0.3]) await scrollTo(top + f * H, 900);
for (let t = 0; t < 40; t++) { if ((await b.evalJs(`document.querySelector('#digital').dataset.ready || ''`)) === '1') break; await sleep(500); }
await scrollTo(top, 1200);
const geo = JSON.parse(await b.evalJs(`JSON.stringify(window.__digital.geo)`));
const N = +(args.n || 60);
const rows = [];
const probe = () => b.evalJs(`(() => {
  const root = document.querySelector('#digital'); const vp = root.querySelector('.dg__vp').getBoundingClientRect();
  const R = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const lab = R(root.querySelector('.dg__vp-label')), hint = root.querySelector('.dg__hint'), gz = R(root.querySelector('.dg__gizmo'));
  const hOp = +getComputedStyle(hint).opacity;
  const calls = [...root.querySelectorAll('.dg__call')].map((c) => ({ a: c.dataset.anchor, op: +getComputedStyle(c).opacity, r: R(c.querySelector('.dg__call-t')) })).filter((c) => c.op > 0.5);
  return JSON.stringify({ vp: { l: vp.left, t: vp.top, r: vp.right, b: vp.bottom }, lab, hint: { ...R(hint), op: hOp }, gz, calls, step: root.dataset.step });
})()`).then(JSON.parse);
const ov = (a, c) => Math.max(0, Math.min(a.r, c.r) - Math.max(a.l, c.l)) * Math.max(0, Math.min(a.b, c.b) - Math.max(a.t, c.t));
const issues = [];
for (let i = 0; i <= N; i++) {
  const p = i / N; const k = Math.min(5, Math.floor(p * 6)), fr = p * 6 - k;
  const y = p >= 1 ? geo.b[6] + 4 : geo.b[k] + fr * (geo.b[k + 1] - geo.b[k]);
  await scrollTo(y - 25, 120); await scrollTo(y, 900);
  const s = await probe();
  const rec = { p: +p.toFixed(3), step: s.step, calls: s.calls.map((c) => c.a), issues: [] };
  for (const c of s.calls) {
    const o1 = ov(c.r, s.lab); if (o1 > 20) rec.issues.push(`${c.a} overlaps vp-label ${Math.round(o1)}px2`);
    if (s.hint.op > 0.3) { const o2 = ov(c.r, s.hint); if (o2 > 20) rec.issues.push(`${c.a} overlaps hint ${Math.round(o2)}px2`); }
    const o3 = ov(c.r, s.gz); if (o3 > 20) rec.issues.push(`${c.a} overlaps gizmo ${Math.round(o3)}px2`);
    if (c.r.l < s.vp.l - 1 || c.r.r > s.vp.r + 1 || c.r.t < s.vp.t - 1 || c.r.b > s.vp.b + 1) rec.issues.push(`${c.a} outside viewport (${Math.round(c.r.l - s.vp.l)},${Math.round(c.r.t - s.vp.t)},${Math.round(s.vp.r - c.r.r)},${Math.round(s.vp.b - c.r.b)})`);
  }
  for (let a = 0; a < s.calls.length; a++) for (let c = a + 1; c < s.calls.length; c++) { const o = ov(s.calls[a].r, s.calls[c].r); if (o > 20) rec.issues.push(`${s.calls[a].a} x ${s.calls[c].a} overlap ${Math.round(o)}px2`); }
  rows.push(rec); if (rec.issues.length) issues.push(rec);
}
writeFileSync(`${process.env.SHOTS_DIR}callouts.json`, JSON.stringify(rows, null, 1));
console.log(`${name}: ${rows.length} samples, ${issues.length} with issues`);
for (const r of issues) console.log(r.p, 'step', r.step, r.issues.join(' | '));
await b.close(); process.exit(0);
