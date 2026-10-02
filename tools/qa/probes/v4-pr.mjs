// v4: does the Digital scene stay sharp? Real wheel through #digital (no screenshots), samples rAF intervals + canvas drawing-buffer ratio (adaptive pixel ratio).
//   node tools/qa/probes/v4-pr.mjs --port=9425 [--w=1366 --h=820] [--url=http://127.0.0.1:4424/]
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : '1']; }));
process.env.SHOTS_DIR = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v4-r2/pr/';
const { launch, sleep, stats } = await import('./d4-lib.mjs');
const W = +(args.w || 1366), H = +(args.h || 820);
const b = await launch({ port: +(args.port || 9425), w: W, h: H, tag: 'pr' });
await b.open(args.url || 'http://127.0.0.1:4424/', 6500);
const top = await b.evalJs(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
await b.evalJs(`(() => { window.__fr = []; let l = performance.now(); const t = (n) => { window.__fr.push(n - l); if (n - l > 33) (window.__big = window.__big || []).push([Math.round(n - l), Math.round(scrollY)]); l = n; requestAnimationFrame(t); }; requestAnimationFrame(t); window.__pr = []; setInterval(() => { const c = document.querySelector('.dg__canvas'); window.__pr.push([Math.round(scrollY), c.width, c.clientWidth, +(c.width / c.clientWidth).toFixed(2)]); }, 500); })()`);
const x = 683, y = 400;
await b.wheelTo(top - H * 1.2, x, y);
await sleep(2000);
const geo = JSON.parse(await b.evalJs(`JSON.stringify(window.__digital && window.__digital.geo)`));
const t0 = await b.evalJs(`window.__fr.length`);
for (let i = 0; i < 6; i++) { await b.wheelTo(geo.a[i], x, y); await sleep(1800); } // dwell like a reader
await b.wheelTo(geo.b[6] + 150, x, y); await sleep(2500);
const fr = await b.evalJs(`window.__fr.slice(${t0})`);
const pr = await b.evalJs(`window.__pr`);
console.log('frames while crossing #digital (ms):', JSON.stringify(stats(fr)), ' >33ms:', fr.filter((v) => v > 33).length, ' >50ms:', fr.filter((v) => v > 50).length);
console.log('canvas ratio over time [scrollY, bufW, cssW, ratio]:'); console.log(pr.filter((_, i) => i % 3 === 0).map((r) => r.join('/')).join('  '));
console.log('hitches >33ms [ms, scrollY]:', JSON.stringify(await b.evalJs('window.__big || []')), 'geo.a', JSON.stringify(geo.a.map(Math.round)));
console.log('errors', b.errors.length);
await b.close(); process.exit(0);
