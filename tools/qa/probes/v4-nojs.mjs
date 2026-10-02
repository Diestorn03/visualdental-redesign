// v4: #digital with JavaScript disabled (CDP). Output: .shots/v4-r2/nojs/{head,steps}.png + a line with the poster state.
process.env.SHOTS_DIR = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v4-r2/nojs/';
const { launch, sleep } = await import('./d4-lib.mjs');
const b = await launch({ port: +(process.argv[2] || 9424), w: 1366, h: 820, tag: 'nojs' });
await b.send('Emulation.setScriptExecutionDisabled', { value: true });
await b.open('http://127.0.0.1:4424/', 3500);
await b.send('Emulation.setScriptExecutionDisabled', { value: false });
const info = await b.evalJs(`(() => { const r = document.querySelector('#digital'); const im = r.querySelector('.dg__poster img, img.dg__poster'); const w = r.querySelector('.dg__win').getBoundingClientRect(); return JSON.stringify({ mode: r.dataset.mode, js: !!window.__digital, poster: im ? { cur: im.currentSrc, op: getComputedStyle(im).opacity, nat: [im.naturalWidth, im.naturalHeight] } : null, canvasDisp: getComputedStyle(r.querySelector('.dg__canvas')).display, win: [w.width, w.height], top: w.top + scrollY }); })()`);
console.log(info);
const top = JSON.parse(info).top;
await b.evalJs(`scrollTo(0, ${Math.round(top - 120)}); 1`); await sleep(800); await b.shot('head');
await b.evalJs(`document.querySelector('.dg__steps').scrollIntoView({block:'center'}); 1`); await sleep(800); await b.shot('steps');
await b.close(); process.exit(0);
