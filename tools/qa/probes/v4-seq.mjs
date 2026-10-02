// v4 verifier: sequence of #digital frames at given global progress values: --ps=0.35,0.4,...  (pure scroll positions via window.__digital.geo)
//   node tools/qa/probes/v4-shots.mjs --name=desk1366 --w=1366 --h=820 [--mobile] [--reduced] [--palette=mono] [--walk=1] [--digital=1] [--url=http://127.0.0.1:4424/]
// Output: .shots/v4-r2/<name>/{walk-NN,dg-sN,dg-sN-mid,dgwin-sN}.png + report.json (console, callout geometry, layout checks).
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : '1']; }));
const name = args.name || 'run';
const W = +(args.w || 1366), H = +(args.h || 820), mobile = !!args.mobile, dpr = +(args.dpr || (mobile ? 2 : 1));
process.env.SHOTS_DIR = `C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v4-r2/${name}/`;
const { launch, sleep, OUT } = await import('./d4-lib.mjs');
import { writeFileSync } from 'node:fs';

const b = await launch({ port: +(args.port || 9424), w: W, h: H, tag: 'p' });
const warns = [];
b.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && ['warning'].includes(m.params.type)) warns.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)); if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) warns.push('LOG ' + m.params.entry.level + ' ' + m.params.entry.text.slice(0, 200) + ' ' + (m.params.entry.url || '')); });
await b.send('Log.enable');
await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile });
if (mobile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
if (args.reduced) await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const base = args.url || 'http://127.0.0.1:4424/';
const url = base + (args.palette ? `?palette=${args.palette}` : '') + (args.q ? (args.palette ? '&' : '?') + args.q : '');
await b.open(url, 4500);
const report = { name, url, W, H, dpr, mobile, reduced: !!args.reduced };
report.env = await b.evalJs(`({ coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(pointer: fine)').matches, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, mode: document.querySelector('#digital')?.dataset.mode, palette: document.documentElement.dataset.palette, dpr: devicePixelRatio, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight })`);
console.log(JSON.stringify(report.env));

const scrollTo = async (y, wait = 1100) => { await b.evalJs(`window.scrollTo(0, ${Math.round(y)}); 1`); await sleep(wait); };


const top = await b.evalJs(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
for (const f of [-1.6, -0.9, -0.3]) await scrollTo(top + f * H, 900);
for (let t = 0; t < 40; t++) { const rdy = await b.evalJs(`document.querySelector('#digital').dataset.ready || ''`); if (rdy === '1' || report.env.mode === 'static') break; await sleep(500); }
await scrollTo(top, 1200);
const geo = JSON.parse(await b.evalJs(`JSON.stringify(window.__digital.geo)`));
const ps = String(args.ps || '0').split(',').map(Number);
const wait = +(args.wait || 2600);
for (const p of ps) {
  const k = Math.min(5, Math.floor(p * 6)), fr = p * 6 - k;
  const y = p >= 1 ? geo.b[6] + 4 : geo.b[k] + fr * (geo.b[k + 1] - geo.b[k]);
  await scrollTo(y, wait);
  const f = await b.shot(`seq-p${String(Math.round(p * 1000)).padStart(4, '0')}`);
  const st = await b.evalJs(`JSON.stringify({ p: window.__digital.progress, step: document.querySelector('#digital').dataset.step, canvas: [document.querySelector('.dg__canvas').width, document.querySelector('.dg__canvas').height] })`);
  console.log(p, st);
}
report.errors = b.errors; report.warns = warns;
console.log('errors', b.errors.length, b.errors.slice(0, 5));
await b.close();
process.exit(0);
