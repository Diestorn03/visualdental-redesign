// v4: footer wordmark reveal at the very bottom (mobile 390 + desktop 1366): is it fully lit after settling?
process.env.SHOTS_DIR = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v4-r2/footer/';
const { launch, sleep } = await import('./d4-lib.mjs');
for (const [name, W, H, mobile] of [['m390', 390, 844, true], ['d1366', 1366, 820, false]]) {
  const b = await launch({ port: 9424, w: W, h: H, tag: name });
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.open('http://127.0.0.1:4424/', 4000);
  const sh = await b.evalJs('document.documentElement.scrollHeight');
  for (let y = sh - H * 3; y <= sh; y += 600) { await b.evalJs(`scrollTo(0, ${y}); 1`); await sleep(500); }
  await b.evalJs(`scrollTo(0, ${sh}); 1`);
  for (const t of [500, 2500, 5000]) { await sleep(t === 500 ? 500 : t - (t === 2500 ? 500 : 2500)); const o = await b.evalJs(`(() => { const e = document.querySelector('footer [data-wordmark], footer .ftr__mark, footer .ftr__word') || document.querySelector('footer'); const w = [...document.querySelectorAll('footer *')].filter((x) => /VISUAL|Visual/.test(x.textContent) && getComputedStyle(x).fontSize && parseFloat(getComputedStyle(x).fontSize) > 40).slice(0, 3).map((x) => ({ c: x.className, op: getComputedStyle(x).opacity, tr: getComputedStyle(x).transform })); return { y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, w }; })()`); console.log(name, t, JSON.stringify(o)); }
  await b.shot(name + '-bottom');
  await b.close(); await sleep(800);
}
process.exit(0);
