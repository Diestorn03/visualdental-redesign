// v4 verifier: visual capture of the production build (astro preview).
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
if (args.lite) await b.send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(navigator,'deviceMemory',{get:()=>2});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});" });
if (args.reduced) await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const base = args.url || 'http://127.0.0.1:4424/';
const url = base + (args.palette ? `?palette=${args.palette}` : '') + (args.q ? (args.palette ? '&' : '?') + args.q : '');
await b.open(url, 4500);
const report = { name, url, W, H, dpr, mobile, reduced: !!args.reduced };
report.env = await b.evalJs(`({ coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(pointer: fine)').matches, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, mode: document.querySelector('#digital')?.dataset.mode, palette: document.documentElement.dataset.palette, dpr: devicePixelRatio, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight })`);
console.log(JSON.stringify(report.env));

const scrollTo = async (y, wait = 1100) => { await b.evalJs(`window.scrollTo(0, ${Math.round(y)}); 1`); await sleep(wait); };

if (args.walk !== '0') {
  const total = report.env.sh; const stepY = Math.round(H * (args.stride ? +args.stride : 0.9));
  let i = 0;
  for (let y = 0; y < total; y += stepY, i++) {
    await scrollTo(y, mobile ? 900 : 1000);
    await b.shot(`walk-${String(i).padStart(2, '0')}-y${y}`);
  }
  report.walkShots = i;
}

if (args.digital !== '0') {
  // arrive gently so the scene gets built (the page reaches #digital by scrolling, as a reader would)
  const top = await b.evalJs(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
  for (const f of [-1.6, -0.9, -0.3]) await scrollTo(top + f * H, 900);
  for (let t = 0; t < 40; t++) { const rdy = await b.evalJs(`document.querySelector('#digital').dataset.ready || ''`); if (rdy === '1' || report.env.mode === 'static') break; await sleep(500); }
  await scrollTo(top, 1500);
  await b.shot('dg-head');
  const hasGeo = await b.evalJs(`!!(window.__digital && window.__digital.geo)`);
  report.geo = hasGeo ? await b.evalJs(`JSON.stringify(window.__digital.geo)`) : null;
  const rect = await b.evalJs(`(() => { const r = document.querySelector('.dg__win').getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  report.win = rect;
  report.steps = [];
  const geo = hasGeo ? JSON.parse(report.geo) : null;
  const inspect = () => b.evalJs(`(() => {
    const root = document.querySelector('#digital');
    const vp = root.querySelector('.dg__vp').getBoundingClientRect();
    const rr = (el) => { const r = el.getBoundingClientRect(); return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const calls = [...root.querySelectorAll('.dg__call')].map((c) => { const t = c.querySelector('.dg__call-t').getBoundingClientRect(); return { a: c.dataset.anchor, on: c.classList.contains('is-on'), op: +getComputedStyle(c).opacity, flip: c.classList.contains('is-flip'), below: c.classList.contains('is-below'), t: { x: +t.left.toFixed(1), y: +t.top.toFixed(1), w: +t.width.toFixed(1), h: +t.height.toFixed(1) }, inside: t.left >= vp.left && t.right <= vp.right && t.top >= vp.top && t.bottom <= vp.bottom }; });
    const cv = root.querySelector('.dg__canvas');
    const wt = root.querySelector('[data-t]'), tt = root.querySelector('.dg__title');
    return { step: root.dataset.step, live: root.classList.contains('is-live'), mode: root.dataset.mode, ready: root.dataset.ready, prog: window.__digital ? window.__digital.progress : null, wiz: root.querySelector('.dg__wiz-n').textContent.trim() + ' ' + wt.textContent.trim(), wizOver: wt.scrollWidth > wt.clientWidth, titleOver: tt.scrollWidth > tt.clientWidth, vp: { x: vp.left, y: vp.top, w: vp.width, h: vp.height }, canvas: { w: cv.width, h: cv.height, op: getComputedStyle(cv).opacity, disp: getComputedStyle(cv).display }, calls, hint: getComputedStyle(root.querySelector('.dg__hint')).opacity, activeTools: [...root.querySelectorAll('.dg__tool.is-on')].length, stageTop: root.querySelector('.dg__stage').getBoundingClientRect().top };
  })()`);
  const wk = rect;
  for (let i = 0; i < 6; i++) {
    if (geo) {
      await scrollTo(geo.a[i], 3200);
      await b.shot(`dg-s${i + 1}`);
      const r = await b.evalJs(`(() => { const r = document.querySelector('.dg__win').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      await b.shot(`dgwin-s${i + 1}`, { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(W - Math.max(0, r.x), r.w), height: Math.min(H - Math.max(0, r.y), r.h) });
      report.steps.push({ i: i + 1, ...(await inspect()) });
      // mid-transition between this step and the next
      if (i < 5) {
        await scrollTo(geo.b[i + 1] + (geo.b[i + 2] - geo.b[i + 1]) * 0.0 + (geo.a[i] - geo.b[i + 1]) * 0 + ((geo.a[i + 1] - geo.a[i]) * 0.5), 1600);
        await b.shot(`dgwin-s${i + 1}-mid`, { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(W - Math.max(0, r.x), r.w), height: Math.min(H - Math.max(0, r.y), r.h) });
      }
    } else {
      // static: no geo; scroll the Nth step into view
      await b.evalJs(`document.querySelectorAll('.dg__step')[${i}].scrollIntoView({ block: 'center' }); 1`);
      await sleep(1200);
      if (i === 0) { await b.evalJs(`document.querySelector('.dg__win').scrollIntoView({ block: 'center' }); 1`); await sleep(1500); await b.shot('dg-static-win'); report.steps.push({ i: 'static', ...(await inspect()) }); }
    }
  }
  if (!geo) {
    await b.evalJs(`document.querySelector('.dg__steps').scrollIntoView({ block: 'center' }); 1`); await sleep(1200); await b.shot('dg-static-steps');
    report.poster = await b.evalJs(`(() => { const p = document.querySelector('.dg__poster'); if (!p) return null; const im = p.tagName === 'IMG' ? p : p.querySelector('img'); return im ? { cur: im.currentSrc, nat: [im.naturalWidth, im.naturalHeight], shown: getComputedStyle(im).opacity } : { tag: p.tagName }; })()`);
  }
  report.copy = await b.evalJs(`(() => { const r = document.querySelector('#digital'); return { eyebrow: r.querySelector('.eyebrow').textContent.trim(), h2: r.querySelector('h2').textContent.replace(/\\s+/g, ' ').trim(), lead: r.querySelector('.lead').textContent.trim(), steps: [...r.querySelectorAll('.dg__name')].map((e) => e.textContent.trim()), lines: [...r.querySelectorAll('.dg__line')].map((e) => e.textContent.trim()), tag: r.querySelector('.dg__tag').textContent.trim(), title: r.querySelector('.dg__title').textContent.trim(), vpl: r.querySelector('.dg__vp-label').textContent.trim(), hint: r.querySelector('.dg__hint').textContent.trim(), fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family) }; })()`);
}
report.errors = b.errors; report.warns = warns;
writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 1));
console.log('errors', b.errors.length, b.errors.slice(0, 5), 'warns', warns.length, warns.slice(0, 5));
await b.close();
process.exit(0);
