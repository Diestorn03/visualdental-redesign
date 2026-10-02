// v4: "Drag to rotate" at step 6 with a real mouse (fine pointer). Shots: before / mid-drag / after / +4 s.
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : '1']; }));
process.env.SHOTS_DIR = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v4-r2/drag/';
const { launch, sleep } = await import('./d4-lib.mjs');
const W = +(args.w || 1366), H = +(args.h || 820);
const b = await launch({ port: +(args.port || 9425), w: W, h: H, tag: 'drag' });
await b.open('http://127.0.0.1:4424/', 5000);
const top = await b.evalJs(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
for (const f of [-1.6, -0.9, -0.3, 0]) { await b.evalJs(`scrollTo(0, ${Math.round(top + f * H)}); 1`); await sleep(900); }
for (let t = 0; t < 40; t++) { if ((await b.evalJs(`document.querySelector('#digital').dataset.ready || ''`)) === '1') break; await sleep(500); }
const geo = JSON.parse(await b.evalJs(`JSON.stringify(window.__digital.geo)`));
await b.evalJs(`scrollTo(0, ${Math.round(geo.a[5])}); 1`); await sleep(4000);
const r = await b.evalJs(`(() => { const v = document.querySelector('.dg__vp').getBoundingClientRect(); return { x: v.left, y: v.top, w: v.width, h: v.height, drag: document.querySelector('.dg__vp').classList.contains('is-drag'), cur: getComputedStyle(document.querySelector('.dg__canvas')).cursor }; })()`);
console.log(JSON.stringify(r));
await b.shot('1-before');
const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.5;
await b.move(cx, cy); await sleep(50); await b.down(cx, cy);
for (let i = 1; i <= 14; i++) { await b.move(cx + i * 16, cy + i * 3); await sleep(16); }
await sleep(100); await b.shot('2-mid-drag');
await b.up(cx + 14 * 16, cy + 42); await sleep(1500); await b.shot('3-after');
const sy0 = await b.evalJs('scrollY'); await sleep(4000); await b.shot('4-plus4s');
console.log('scrollY unchanged by drag:', sy0 === (await b.evalJs('scrollY')), 'errors', b.errors.length);
await b.close(); process.exit(0);
