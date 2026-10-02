// v4: mobile #digital with the header's real hide/return cycle (wheel input arms it). Shots: down (header hidden) / up (header back over the sticky window).
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : '1']; }));
process.env.SHOTS_DIR = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v4-r2/mobhdr/';
const { launch, sleep } = await import('./d4-lib.mjs');
const W = 390, H = 844;
const b = await launch({ port: +(args.port || 9425), w: W, h: H, tag: 'mh' });
await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.open('http://127.0.0.1:4424/', 5000);
const top = await b.evalJs(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
for (const f of [-1.6, -0.9, -0.3, 0]) { await b.evalJs(`scrollTo(0, ${Math.round(top + f * H)}); 1`); await sleep(900); }
for (let t = 0; t < 40; t++) { if ((await b.evalJs(`document.querySelector('#digital').dataset.ready || ''`)) === '1') break; await sleep(500); }
const geo = JSON.parse(await b.evalJs(`JSON.stringify(window.__digital.geo)`));
await b.evalJs(`scrollTo(0, ${Math.round(geo.a[2] - 500)}); 1`); await sleep(1200);
const hs = () => b.evalJs(`(() => { const h = document.querySelector('[data-header]'); return { hidden: h.classList.contains('is-hidden'), top: +h.getBoundingClientRect().top.toFixed(1), h: +h.getBoundingClientRect().height.toFixed(1), stageTop: +document.querySelector('.dg__stage').getBoundingClientRect().top.toFixed(1), y: Math.round(scrollY) }; })()`);
for (let i = 0; i < 12; i++) { await b.wheel(200, 500, 80); await sleep(40); }
await sleep(1500); console.log('after wheel down', JSON.stringify(await hs())); await b.shot('1-down');
for (let i = 0; i < 4; i++) { await b.wheel(200, 500, -60); await sleep(40); }
await sleep(1500); console.log('after wheel up  ', JSON.stringify(await hs())); await b.shot('2-up');
await b.close(); process.exit(0);
