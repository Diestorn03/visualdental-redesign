// v4 verifier: crops of the CAD window (.dg__win) at given global progress values, hi-dpi, page-coordinate clip.
//   node tools/qa/probes/v4-win.mjs --name=win1366 --w=1366 --h=820 --ps=0.05,0.2 [--dpr=2] [--palette=mono] [--mobile]
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : '1']; }));
const name = args.name || 'win';
const W = +(args.w || 1366), H = +(args.h || 820), mobile = !!args.mobile, dpr = +(args.dpr || 2);
process.env.SHOTS_DIR = `C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v4-r2/${name}/`;
const { launch, sleep } = await import('./d4-lib.mjs');
const b = await launch({ port: +(args.port || 9424), w: W, h: H, tag: 'w' });
await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile });
if (mobile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const base = args.url || 'http://127.0.0.1:4424/';
await b.open(base + (args.palette ? `?palette=${args.palette}` : ''), 4500);
const scrollTo = async (y, wait = 1100) => { await b.evalJs(`window.scrollTo(0, ${Math.round(y)}); 1`); await sleep(wait); };
const top = await b.evalJs(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
for (const f of [-1.6, -0.9, -0.3]) await scrollTo(top + f * H, 900);
for (let t = 0; t < 40; t++) { if ((await b.evalJs(`document.querySelector('#digital').dataset.ready || ''`)) === '1') break; await sleep(500); }
await scrollTo(top, 1200);
const geo = JSON.parse(await b.evalJs(`JSON.stringify(window.__digital.geo)`));
const ps = String(args.ps || '0').split(',').map(Number);
for (const p of ps) {
  const k = Math.min(5, Math.floor(p * 6)), fr = p * 6 - k;
  const y = p >= 1 ? geo.b[6] + 4 : geo.b[k] + fr * (geo.b[k + 1] - geo.b[k]);
  // approach from slightly above so lenis/smoothing settle on the target progress
  await scrollTo(y - 30, 500); await scrollTo(y, +(args.wait || 2600));
  const r = await b.evalJs(`(() => { const r = document.querySelector('.dg__win').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, vy: r.top }; })()`);
  await b.shot(`win-p${String(Math.round(p * 1000)).padStart(4, '0')}`, { x: r.x, y: r.y, width: r.w, height: r.h });
  console.log(p, JSON.stringify(await b.evalJs(`JSON.stringify({ prog: window.__digital.progress, step: document.querySelector('#digital').dataset.step })`)), 'winTopInViewport', r.vy);
}
console.log('errors', b.errors.length, b.errors.slice(0, 5));
await b.close(); process.exit(0);
