// d1-scroll: drives the production build with REAL wheel / click input and records, per frame, everything needed to find scroll jank.
//   node tools/qa/probes/d1-scroll.mjs --scen=down-notch [--w=1366 --h=820] [--ptr=edge|center] [--tag=name] [--base=http://127.0.0.1:4401] [--port=9401]
// scenarios: down-notch | down-fast | down-burst | down-pad | up-notch | up-fast | nav | early | early-fresh | reload-mid | idle
// Output: .shots/diag/d1/data/<tag>.json  (read it with d1-analyse.mjs)
import { launch, install, engineUrlOf, sleep, paced, move, dump, OUT } from './d1-lib.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const arg = (k, d) => { const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : d; };
const W = +arg('w', 1366), H = +arg('h', 820), BASE = arg('base', 'http://127.0.0.1:4401'), PORT = +arg('port', 9401);
const SCEN = arg('scen', 'down-notch'), PTR = arg('ptr', 'edge'), TAG = arg('tag', `${SCEN}-${W}-${PTR}`);
const dir = OUT('d1'); mkdirSync(`${dir}/data`, { recursive: true });
const PX = PTR === 'center' ? [Math.round(W / 2), Math.round(H / 2)] : [24, Math.round(H / 2)];

const EXTRA = [
  ['rc head', '#process .rc__head'], ['rc stage', '#process .rc__stage'], ['rc fig1', '#process .rc__step:nth-child(1) .rc__fig'], ['rc txt1', '#process .rc__step:nth-child(1) .rc__txt'], ['rc progress', '#process .rc__progress'],
  ['about story title', '#about .story__title'], ['about manifesto', '#about .manifesto'], ['about collage', '#about .collage'], ['about shot1', '#about .shot--1'],
  ['svc list', '#services .svc__list'], ['svc row3', '#services .svc__row:nth-child(3)'], ['svc panel', '#services .svc__panel'],
  ['edu stage', '#education .plate__stage'], ['edu photo', '#education .plate__photo'], ['edu edu', '#education .edu'],
  ['stories vids', '#stories .vids'], ['stories strip', '#stories [data-strip]'], ['stories quote', '#stories .quote'],
  ['faq list', '#faq .container'], ['contact form', '#contact form'], ['hero photo', '#top .hero__photo'], ['hero mesh', '#top .hero__mesh-wrap'],
];

const PROFILE = arg('profile', null); // reuse a named profile (warm HTTP + shader caches) instead of a fresh one
const VARIANT = arg('variant', '');
const c = await launch({ port: PORT, w: W, h: H, profile: PROFILE ? `${dir}/profile-${PROFILE}` : `${dir}/profile-${PORT}-${TAG}`, fresh: !PROFILE, gpu: !arg('nogpu', false), extra: String(arg('flags', '')).split(' ').filter(Boolean) });
const eng = await engineUrlOf(BASE);
await install(c, eng);
const startSrc = `window.__d1.waitStart = (extra) => { const tick = () => (document.querySelector('main > section[id]') ? __d1.start(extra) : requestAnimationFrame(tick)); tick(); };`;
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: startSrc });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__d1.waitStart(${JSON.stringify(EXTRA)});` });
const VARIANTS = {
  'no-backdrop': '*, *::before, *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }',
  'no-blend': '*, *::before, *::after { mix-blend-mode: normal !important; }',
  'no-filter': '*, *::before, *::after { filter: none !important; }',
  'no-willchange': '*, *::before, *::after { will-change: auto !important; }',
  'no-svg': 'svg { display: none !important; }',
  'no-clip': '*, *::before, *::after { clip-path: none !important; }',
  'no-reveal-all': '[data-reveal], [data-stagger] > *, .split-line, .split-word, .split-line-mask, .lit-word, [data-draw] { opacity: 1 !important; transform: none !important; clip-path: none !important; filter: none !important; translate: none !important; }',
  'no-reveal-opacity': '[data-reveal], [data-stagger] > *, .split-line, .split-word, .lit-word, [data-draw] { opacity: 1 !important; }',
  'no-reveal-transform': '[data-reveal], [data-stagger] > *, .split-line, .split-word, .lit-word { transform: none !important; clip-path: none !important; filter: none !important; }',
  'no-fx': '*, *::before, *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; mix-blend-mode: normal !important; filter: none !important; will-change: auto !important; }',
};
const HIDE = arg('hide', ''); const CSS_EXTRA = arg('css', '');
if (VARIANT || HIDE || CSS_EXTRA) {
  const css = VARIANT.split('+').map((v) => VARIANTS[v] || '').join(' ') + (HIDE ? ` ${HIDE} { visibility: hidden !important; }` : '') + ' ' + CSS_EXTRA;
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const s = document.createElement('style'); s.id = 'd1-variant'; s.textContent = ${JSON.stringify(css)}; (document.head || document.documentElement).appendChild(s); })();` });
}
const JSV = { 'no-avif': `(() => { const strip = (n) => { if (n.nodeType !== 1) return; if (n.matches && n.matches('source[type="image/avif"]')) n.remove(); n.querySelectorAll && n.querySelectorAll('source[type="image/avif"]').forEach((x) => x.remove()); }; new MutationObserver((l) => l.forEach((m) => m.addedNodes.forEach(strip))).observe(document, { childList: true, subtree: true }); })();`,
  'no-webp': `(() => { const strip = (n) => { if (n.nodeType !== 1) return; if (n.matches && n.matches('source[type="image/avif"], source[type="image/webp"]')) n.remove(); n.querySelectorAll && n.querySelectorAll('source[type="image/avif"], source[type="image/webp"]').forEach((x) => x.remove()); }; new MutationObserver((l) => l.forEach((m) => m.addedNodes.forEach(strip))).observe(document, { childList: true, subtree: true }); })();` };
for (const v of VARIANT.split('+')) if (JSV[v]) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: JSV[v] });
const t0 = Date.now();
const loadEvents = [];
c.on((m) => { if (['Page.loadEventFired', 'Page.domContentEventFired'].includes(m.method)) loadEvents.push([m.method, Date.now() - t0]); });
if (+arg('cpu', 1) > 1) await c.send('Emulation.setCPUThrottlingRate', { rate: +arg('cpu', 1) });
if (arg('anim', false)) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__d1.anim = true;' });
await c.send('Page.navigate', { url: BASE + '/' });

const state = () => c.ev(`(() => { const l = __d1.getLenis?.(); return { y: scrollY, ls: l?.scroll, tg: l?.targetScroll, sh: document.documentElement.scrollHeight, ih: innerHeight, vel: l?.velocity, ready: document.documentElement.classList.contains('fx-booted') }; })()`);
const atBottom = async () => { const s = await state(); return s.y + s.ih >= s.sh - 2; };
const settle = async (ms = 600, timeout = 8000) => { // lenis scroll stops changing
  let last = -1, still = 0; const t = Date.now();
  while (Date.now() - t < timeout) { const s = await state(); if (Math.abs((s.ls ?? s.y) - last) < 0.01) { still += 100; if (still >= ms) return; } else still = 0; last = s.ls ?? s.y; await sleep(100); }
};
const gotoY = async (y) => { await c.ev(`__d1.getLenis().scrollTo(${y}, { immediate: true, force: true }); 0`); await sleep(400); };
const wheel = (dy) => c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: PX[0], y: PX[1], deltaX: 0, deltaY: dy });
const inflight = [];
const fire = (dy) => { inflight.push(wheel(dy).catch(() => {})); };

async function waitReady() { for (let i = 0; i < 100; i++) { const s = await state().catch(() => ({})); if (s.ready && s.ls !== undefined) return; await sleep(100); } }
const mark = (name) => c.ev(`__d1.marks.push({ t: performance.now(), n: ${JSON.stringify(name)}, y: scrollY }); 0`);

const MAXY = +arg('maxy', 0), MINY = +arg('miny', 0);
async function downUntilBottom(stepMs, dy = 100, maxMs = 90000) {
  const t = Date.now(); let n = 0;
  while (Date.now() - t < maxMs) {
    await paced(1000, stepMs, () => { fire(dy); });
    n++;
    if (await atBottom()) break;
    if (MAXY && (await state()).y >= MAXY) break;
  }
}
async function upUntilTop(stepMs, dy = -100, maxMs = 90000) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    await paced(1000, stepMs, () => { fire(dy); });
    const s = await state(); if (s.y <= 1 && Math.abs((s.tg ?? 0)) < 2) break;
  }
}
async function burstDown(count, gap, pause, dy = 100, maxMs = 120000) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    await paced(count * gap, gap, () => { fire(dy); });
    await sleep(pause);
    if (await atBottom()) break;
  }
}
// precision-touchpad-like flick: pixel deltas that rise fast and decay (≈ 1 s), then a pause
async function padDown(maxMs = 90000) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    const steps = 80; const peak = 90;
    await paced(steps * 8, 8, (i) => { const x = i / steps; fire(Math.max(1, Math.round(peak * Math.sin(Math.min(1, x * 6) * Math.PI / 2) * Math.pow(1 - x, 2.2) * 2))); });
    await sleep(500);
    if (await atBottom()) break;
  }
}
async function clickEl(sel) {
  const r = await c.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, hidden: document.querySelector('[data-header]').classList.contains('is-hidden') }; })()`);
  if (!r) return false;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
}

const TRACE = !!arg('trace', false);
const traceEvents = [];
if (TRACE) c.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) traceEvents.push(e); });
const traceStart = () => c.send('Tracing.start', { transferMode: 'ReportEvents', categories: arg('cats', 'devtools.timeline,toplevel,gpu,viz,blink.user_timing,disabled-by-default-devtools.timeline.frame') }).catch((e) => console.log('trace start failed', e.message));
let traceDone;
const traceStop = async () => { traceDone = new Promise((r) => c.on((m) => { if (m.method === 'Tracing.tracingComplete') r(); })); await c.send('Tracing.end'); await traceDone; };
const meta = { scen: SCEN, w: W, h: H, ptr: PTR, tag: TAG, trace: TRACE, variant: VARIANT + (HIDE ? ' hide=' + HIDE : '') + (CSS_EXTRA ? ' css=' + CSS_EXTRA : ''), profile: PROFILE, nogpu: !!arg('nogpu', false), flags: arg('flags', ''), cpu: +arg('cpu', 1) };
if (SCEN === 'early' || SCEN === 'early-fresh') {
  // start wheeling 250 ms after navigation commit, with an empty cache (fresh profile): the reader does not wait for the page to finish
  await sleep(250);
  const t = Date.now();
  await paced(9000, 70, () => { fire(100); });
  await settle(800, 6000);
} else if (SCEN === 'reload-mid') {
  await waitReady(); await sleep(2500);
  await downUntilBottom(60, 100, 6000); // about 6 s of wheel: lands somewhere mid page
  await settle(); meta.before = await state();
  await c.send('Page.reload'); await sleep(250);
  await paced(1500, 70, () => { fire(100); });
  await settle(800, 6000);
} else {
  await waitReady(); await sleep((SCEN === 'idle' ? 6000 : 3000) + +arg('wait', 0)); // everything loaded, fonts done, observers settled
  await c.ev(`__d1.refresh.length = 0; __d1.long.length = 0; __d1.ls.length = 0; __d1.ro.length = 0; 0`);
  if (MINY) { await gotoY(MINY); await sleep(1500); }
  await mark('scenario-start');
  if (TRACE) { await traceStart(); meta.sync = await c.ev(`(() => { const n = performance.now(); performance.mark('d1sync'); return n; })()`); }
  if (SCEN === 'down-notch') { await downUntilBottom(90); }
  else if (SCEN === 'down-fast') { await downUntilBottom(16); }
  else if (SCEN === 'down-burst') { await burstDown(6, 22, 450); }
  else if (SCEN === 'down-pad') { await padDown(); }
  else if (SCEN === 'twopass') {
    await mark('pass1-down'); await downUntilBottom(90); await settle(); await sleep(800);
    await mark('pass2-up'); await upUntilTop(90); await settle(); await sleep(800);
    await mark('pass3-down'); await downUntilBottom(90); await settle();
  }
  else if (SCEN === 'up-notch' || SCEN === 'up-fast') {
    const s = await state(); await gotoY(s.sh - s.ih); await sleep(1500); await mark('up-start');
    await upUntilTop(SCEN === 'up-fast' ? 16 : 90);
  } else if (SCEN === 'nav') {
    const order = ['about', 'services', 'process', 'education', 'stories', 'faq', 'contact', 'about', 'process', 'top'];
    for (const id of order) {
      await mark('click-' + id);
      const sel = id === 'top' ? '[data-header] a[href="#top"], [data-header] a[href="#"]' : `[data-header] a[data-nav="${id}"]`;
      let ok = await clickEl(sel);
      if (!ok) { await c.ev(`document.querySelector('[data-header]').classList.remove('is-hidden'); 0`); ok = await clickEl(sel); }
      meta['click-' + id + '-' + order.indexOf(id)] = ok;
      await sleep(200); await settle(500, 6000); await sleep(300);
    }
  } else if (SCEN === 'idle') { await sleep(4000); }
}
await sleep(500);
await Promise.allSettled(inflight);
await mark('scenario-end');
if (TRACE) { await traceStop(); writeFileSync(`${dir}/data/${TAG}.trace.json`, JSON.stringify(traceEvents)); console.log('trace events', traceEvents.length); }
const D = await dump(c);
D.meta = { ...meta, loadEvents, final: await state().catch(() => null), errors: c.errors };
D.marks = JSON.parse(await c.ev('JSON.stringify(__d1.marks)'));
writeFileSync(`${dir}/data/${TAG}.json`, JSON.stringify(D));
console.log(`saved ${TAG}: ${D.frames.length} frames, ${D.refresh.length} refresh events, ${D.ls.length} layout-shifts, ${D.ro.length} RO, ${D.long.length} long tasks`);
await c.close();
process.exit(0);
