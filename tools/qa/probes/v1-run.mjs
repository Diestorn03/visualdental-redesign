// v1-run: one scenario against the production build with REAL input; records per frame, then checks the invariants of v1-lib.mjs.
//   node tools/qa/probes/v1-run.mjs --scen=down-slow [--w=1366 --h=820] [--mobile] [--base=http://127.0.0.1:4421] [--port=9421] [--tag=name]
//        [--cpu=4] [--net=slow] [--profile=warm]
// desktop: down-slow | down-fast | down-burst | down-pad | up-slow | up-fast | twopass | nav | zone-pin | zone-digital | early | early-slow | reload-mid | faq
// mobile (--mobile): m-down | m-up | m-synth | m-early | m-zones
import { launch, engineUrlOf, install, sleep, paced, wheel, touchScroll, dump, save, analyse, verdict, arg, ROOT, OUT } from './v1-lib.mjs';
import { writeFileSync } from 'node:fs';

const MOBILE = !!arg('mobile', false);
const W = +arg('w', MOBILE ? 390 : 1366), H = +arg('h', MOBILE ? 844 : 820), DPR = +arg('dpr', MOBILE ? 3 : 1);
const BASE = arg('base', 'http://127.0.0.1:4421'), PORT = +arg('port', 9421), SCEN = arg('scen', MOBILE ? 'm-down' : 'down-slow');
const TAG = arg('tag', `${SCEN}${arg('reduced', false) ? '-reduced' : ''}-${W}x${H}${arg('cpu', 1) > 1 ? '-cpu' + arg('cpu', 1) : ''}${arg('net', '') ? '-net' : ''}`);
const PROFILE = arg('profile', null);
const dir = OUT();
const c = await launch({ port: PORT, w: W, h: H, dpr: DPR, mobile: MOBILE, profile: `${dir}/profile-${PORT}${PROFILE ? '-' + PROFILE : ''}`, fresh: !PROFILE });
const eng = await engineUrlOf(BASE);
await install(c, eng);
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__v1.waitStart = () => { const t = () => (document.querySelector('main > section[id]') ? __v1.start() : requestAnimationFrame(t)); t(); }; __v1.waitStart();` });
const REDUCED = !!arg('reduced', false);
if (REDUCED) await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
if (+arg('cpu', 1) > 1) await c.send('Emulation.setCPUThrottlingRate', { rate: +arg('cpu', 1) });
if (arg('net', '')) await c.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
const loadEvents = []; const t0 = Date.now();
c.on((m) => { if (['Page.loadEventFired', 'Page.domContentEventFired'].includes(m.method)) loadEvents.push([m.method, Date.now() - t0]); });
const HASH = arg('hash', '');
// r2 adversarial knobs: --q=palette=mono (query string) · --delay=3500 --delaypat=woff2,avif (hold matching requests for N ms: late fonts / late images)
const QS = arg('q', '');
const DELAY = +arg('delay', 0);
if (DELAY) {
  const pats = String(arg('delaypat', 'woff2')).split(',');
  await c.send('Fetch.enable', { patterns: pats.map((e) => ({ urlPattern: '*.' + e + '*' })) });
  c.on((m) => { if (m.method === 'Fetch.requestPaused') setTimeout(() => c.send('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {}), DELAY); });
}
await c.send('Page.navigate', { url: BASE + '/' + (QS ? '?' + QS : '') + (HASH ? '#' + HASH : '') });

const state = () => c.ev(`(() => { const l = __v1.getLenis?.(); return { y: scrollY, ls: l?.scroll, tg: l?.targetScroll, sh: document.documentElement.scrollHeight, ih: innerHeight, booted: document.documentElement.classList.contains('fx-booted'), lenis: !!l, isScrolling: l?.isScrolling }; })()`);
const atBottom = async () => { const s = await state(); return s.y + s.ih >= s.sh - 2; };
const settle = async (ms = 600, timeout = 9000) => { let last = -1, still = 0; const t = Date.now(); while (Date.now() - t < timeout) { const s = await state(); const v = s.ls ?? s.y; if (Math.abs(v - last) < 0.01) { still += 100; if (still >= ms) return; } else still = 0; last = v; await sleep(100); } };
const gotoY = async (y) => { await c.ev(`(() => { const l = __v1.getLenis?.(); if (l) l.scrollTo(${y}, { immediate: true, force: true }); else scrollTo(0, ${y}); return 0; })()`); await sleep(500); };
const waitReady = async () => { for (let i = 0; i < 120; i++) { const s = await state().catch(() => ({})); if (s.booted && (MOBILE || REDUCED || s.lenis)) return; await sleep(100); } };
const mark = (n) => c.ev(`__v1.marks.push({ t: performance.now(), n: ${JSON.stringify(n)}, y: scrollY }); 0`);
const inflight = []; const fire = (dy, x, y) => { inflight.push(wheel(c, dy, x, y).catch(() => {})); };
const PX = [24, Math.round(H / 2)]; // pointer over the left margin: nothing under it reacts to hover (Services rows are in the content column)
const D_note = () => null;
const legs = []; // { name, from, to, down }
const leg = async (name, down, fn, { check = true } = {}) => { await mark(name + '-s'); await fn(); await settle(700, 8000); await mark(name + '-e'); legs.push({ name, from: name + '-s', to: name + '-e', down, check }); };

async function downUntilBottom(stepMs, dy = 100, maxMs = 120000) { const t = Date.now(); while (Date.now() - t < maxMs) { await paced(1000, stepMs, () => { fire(dy, ...PX); }); if (await atBottom()) break; } }
async function upUntilTop(stepMs, dy = -100, maxMs = 120000) { const t = Date.now(); while (Date.now() - t < maxMs) { await paced(1000, stepMs, () => { fire(dy, ...PX); }); const s = await state(); if (s.y <= 1 && Math.abs(s.tg ?? 0) < 2) break; } }
async function burstDown(count, gap, pause, dy = 100, maxMs = 150000) { const t = Date.now(); while (Date.now() - t < maxMs) { await paced(count * gap, gap, () => { fire(dy, ...PX); }); await sleep(pause); if (await atBottom()) break; } }
async function padDown(maxMs = 120000) { const t = Date.now(); while (Date.now() - t < maxMs) { const steps = 80, peak = 90; await paced(steps * 8, 8, (i) => { const x = i / steps; fire(Math.max(1, Math.round(peak * Math.sin(Math.min(1, x * 6) * Math.PI / 2) * Math.pow(1 - x, 2.2) * 2)), ...PX); }); await sleep(500); if (await atBottom()) break; } }
const geom = () => c.ev(`(() => { const g = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.round(r.height)]; }; const pin = __v1.pinInfo(); return { pin: Array.isArray(pin) ? pin[0] : pin, digital: g('#digital'), dgBody: g('#digital .dg__body'), process: g('#process'), services: g('#services'), faq: g('#faq'), sh: document.documentElement.scrollHeight }; })()`);
async function clickEl(sel) {
  const r = await c.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!r) return false;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
}
// mobile gestures: Input.synthesizeScrollGesture first; if the page does not move, the explicit-timestamp touch events of v1-lib
let synthWorks = null;
async function mGesture(dir, dist = 600, speed = 1800) {
  if (synthWorks !== false) {
    const y0 = (await state()).y;
    try { await c.send('Input.synthesizeScrollGesture', { x: Math.round(W / 2), y: Math.round(H * (dir === 'down' ? 0.8 : 0.25)), yDistance: dir === 'down' ? -dist : dist, speed, gestureSourceType: 'touch', preventFling: false }); } catch (e) { synthWorks = false; }
    if (synthWorks === null) { await sleep(300); synthWorks = Math.abs((await state()).y - y0) > 5; }
    if (synthWorks) return;
  }
  await touchScroll(c, { dist, speed, dir, fling: true });
}

const meta = { q: QS, delay: DELAY, scen: SCEN, w: W, h: H, dpr: DPR, mobile: MOBILE, tag: TAG, base: BASE, cpu: +arg('cpu', 1), net: arg('net', '') };
const hashRun = SCEN === 'hash';
const early = SCEN === 'early' || SCEN === 'early-slow' || SCEN === 'm-early';
if (early) {
  await sleep(+arg('earlyms', 250));
  const tStart = await c.ev('performance.now()');
  const fireFn = MOBILE ? async () => { for (let i = 0; i < 6; i++) { await mGesture('down', 500, 1400); await sleep(250); } } : async () => { await paced(9000, 70, () => { fire(100, ...PX); }); };
  await fireFn(); await settle(800, 7000);
  await sleep(1500); // let the late refreshes (fonts / load / RO coalesced 250 ms + still 160 ms) land: they must not move the page after the reader stops either
  meta.firstInputAt = (await c.ev(`(__v1.inputs.find(([t, n]) => n === 'wheel' || n === 'touchstart') || [null])[0]`));
  meta.tStart = tStart;
} else if (hashRun) {
  await sleep(7000);
  meta.hashFinal = await c.ev(`(() => { const e = document.getElementById(${JSON.stringify(HASH)}); return { y: scrollY, secTop: e ? Math.round(e.getBoundingClientRect().top + scrollY) : null, sh: document.documentElement.scrollHeight }; })()`);
} else {
  await waitReady(); await sleep(3000 + +arg('wait', 0));
  meta.geom = await geom();
  await c.ev(`__v1.long.length = 0; __v1.ls.length = 0; __v1.ro.length = 0; 0`);
  await mark('scenario-start');
  if (SCEN === 'down-slow') await leg('down', true, () => downUntilBottom(90));
  else if (SCEN === 'down-fast') await leg('down', true, () => downUntilBottom(16));
  else if (SCEN === 'down-burst') await leg('down', true, () => burstDown(6, 22, 450));
  else if (SCEN === 'down-pad') await leg('down', true, () => padDown());
  else if (SCEN === 'up-slow' || SCEN === 'up-fast') { const s = await state(); await gotoY(s.sh - s.ih); await sleep(1200); await leg('up', false, () => upUntilTop(SCEN === 'up-fast' ? 16 : 90)); }
  else if (SCEN === 'idle') await leg('idle', null, () => sleep(15000));
  else if (SCEN === 'twopass') {
    await leg('pass1-down', true, () => downUntilBottom(60));
    await sleep(800); await leg('pass2-up', false, () => upUntilTop(60));
    await sleep(800); await leg('pass3-down', true, () => downUntilBottom(60));
  } else if (SCEN === 'nav') {
    const order = ['about', 'services', 'digital', 'process', 'education', 'stories', 'faq', 'contact', 'digital', 'process', 'about', 'digital', 'top'];
    meta.navClicks = [];
    for (const id of order) {
      await mark('click-' + id + '-s');
      const sel = id === 'top' ? '[data-header] a.hdr__brand' : id === 'contact' ? '[data-header] a.hdr__cta' : `[data-header] a[data-nav="${id}"]`;
      await c.ev(`document.querySelector('[data-header]').classList.remove('is-hidden'); 0`); await sleep(400); // a reader scrolls up a little to bring the header back; here we just un-hide it
      const ok = await clickEl(sel);
      await sleep(200); await settle(500, 7000); await sleep(300);
      const s = await state(); const tgt = await c.ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); return e ? Math.round(e.getBoundingClientRect().top) : null; })()`);
      meta.navClicks.push({ id, ok, y: Math.round(s.y), sectionTopAfter: tgt });
      await mark('click-' + id + '-e'); legs.push({ name: 'nav-' + id + '-' + meta.navClicks.length, from: 'click-' + id + '-s', to: 'click-' + id + '-e', down: null, check: true, noJump: true });
    }
  } else if (SCEN === 'zone-pin' || SCEN === 'zone-digital') {
    const g = meta.geom;
    const [a, b] = SCEN === 'zone-pin' ? [g.pin.start, g.pin.end] : [g.digital[0], g.digital[0] + g.digital[1]];
    for (const [nm, dy, ms] of [['slow', 20, 16], ['notch', 100, 90], ['fast', 100, 12]]) {
      await gotoY(a - 700); await sleep(900);
      await leg(`${nm}-down`, true, async () => { let n = 0; while ((await state()).y < b + 700 && n++ < 80) await paced(500, ms, () => { fire(dy, ...PX); }); });
      await gotoY(b + 700); await sleep(900);
      await leg(`${nm}-up`, false, async () => { let n = 0; while ((await state()).y > a - 700 && n++ < 80) await paced(500, ms, () => { fire(-dy, ...PX); }); });
    }
    // reversal inside the zone: down into it then straight back up, three times
    await gotoY(a - 500); await sleep(900);
    await leg('wiggle', null, async () => { for (let k = 0; k < 4; k++) { await paced(700, 14, () => { fire(60, ...PX); }); await sleep(120); await paced(500, 14, () => { fire(-60, ...PX); }); await sleep(120); } }, {});
    // keyboard PageDown through the zone (native smooth scroll with Lenis present)
    await gotoY(a - 500); await sleep(900);
    await leg('pgdn', true, async () => { for (let i = 0; i < 8; i++) { await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 34, code: 'PageDown', key: 'PageDown' }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 34, code: 'PageDown', key: 'PageDown' }); await sleep(700); } });
  } else if (SCEN === 'navmid') {
    // adversarial: nav click while a fast wheel burst is still moving, then wheel the other way during the nav animation, then click again and wheel at once
    await gotoY(meta.geom.services[0] + 300); await sleep(900);
    const hdr = () => c.ev(`document.querySelector('[data-header]').classList.remove('is-hidden'); 0`);
    await leg('navmid-a', null, async () => { await paced(400, 16, () => { fire(100, ...PX); }); await hdr(); await clickEl('[data-header] a[data-nav="process"]'); await sleep(250); await paced(300, 16, () => { fire(-100, ...PX); }); await sleep(400); await hdr(); await clickEl('[data-header] a[data-nav="digital"]'); await sleep(30); await paced(400, 16, () => { fire(100, ...PX); }); }, {});
    await leg('navmid-b', null, async () => { await hdr(); await clickEl('[data-header] a[data-nav="education"]'); await sleep(500); await paced(600, 16, () => { fire(-60, ...PX); }); await sleep(100); await paced(500, 16, () => { fire(120, ...PX); }); });
  } else if (SCEN === 'resize') {
    const g = meta.geom; await gotoY(g.pin.start - 400); await sleep(900);
    const setW = (w) => c.send('Emulation.setDeviceMetricsOverride', { width: w, height: H, deviceScaleFactor: DPR, mobile: false, screenWidth: w, screenHeight: H });
    await leg('resize-while-scrolling', true, async () => { let k = 0; const t0 = Date.now(); const rz = (async () => { while (Date.now() - t0 < 6000) { await sleep(650); await setW(k++ % 2 ? W : W - 70); } await setW(W); })(); await paced(6000, 16, () => { fire(20, ...PX); }); await rz; });
    meta.refreshAfter = D_note();
  } else if (SCEN === 'scrollbar') {
    // native compositor scrolling: drag the scrollbar thumb down and back up (Lenis only follows it; the pin must still engage / release cleanly)
    const sbx = W - 8; const track = H - 34; const thumbTop = 17 + 6;
    const drag = async (from, to, steps, ms) => { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sbx, y: from }); await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sbx, y: from, button: 'left', clickCount: 1, buttons: 1 }); for (let i = 1; i <= steps; i++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sbx, y: Math.round(from + (to - from) * i / steps), button: 'left', buttons: 1 }); await sleep(ms); } await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sbx, y: to, button: 'left', clickCount: 1 }); };
    meta.sbBefore = (await state()).y;
    await leg('scrollbar-down', true, () => drag(thumbTop, track - 4, 160, 16));
    meta.sbAfterDown = (await state()).y;
    await leg('scrollbar-up', false, () => drag(track - 12, thumbTop, 160, 16));
    meta.sbAfterUp = (await state()).y;
  } else if (SCEN === 'reload-mid') {
    await downUntilBottom(60, 100, 6000); await settle(); meta.before = await state();
    await mark('reload'); await c.send('Page.reload'); await sleep(250); await paced(1500, 70, () => { fire(100, ...PX); }); await settle(800, 6000);
  } else if (SCEN === 'faq') {
    // open / close FAQ items (changes body height) and scroll right after: the refresh must wait for the scroll to stop
    const g = meta.geom; await gotoY(g.faq[0] - 100); await sleep(800);
    await leg('faq-toggle', null, async () => { for (let i = 0; i < 3; i++) { await clickEl(`#faq details:nth-of-type(${i + 1}) summary`); await sleep(150); await paced(600, 20, () => { fire(80, ...PX); }); await sleep(250); } });
  } else if (SCEN === 'm-down') await leg('down', true, async () => { const t = Date.now(); while (Date.now() - t < 120000) { await mGesture('down', 600, 1600); await sleep(180); if (await atBottom()) break; } });
  else if (SCEN === 'm-up') { const s = await state(); await gotoY(s.sh - s.ih); await sleep(1200); await leg('up', false, async () => { const t = Date.now(); while (Date.now() - t < 120000) { await mGesture('up', 600, 1600); await sleep(180); if ((await state()).y <= 1) break; } }); }
  else if (SCEN === 'm-synth') await leg('down-slow', true, async () => { const t = Date.now(); while (Date.now() - t < 150000) { await mGesture('down', 300, 500); await sleep(120); if (await atBottom()) break; } });
  else if (SCEN === 'm-zones') {
    const g = meta.geom; const [a, b] = [g.digital[0], g.digital[0] + g.digital[1]];
    await gotoY(a - 700); await sleep(900);
    await leg('digital-down', true, async () => { let n = 0; while ((await state()).y < b + 400 && n++ < 60) { await mGesture('down', 250, 700); await sleep(150); } });
    await leg('digital-up', false, async () => { let n = 0; while ((await state()).y > a - 600 && n++ < 60) { await mGesture('up', 250, 700); await sleep(150); } });
  }
}
await sleep(400);
await Promise.allSettled(inflight);
await mark('scenario-end');
const D = await dump(c);
meta.loadEvents = loadEvents; meta.final = await state().catch(() => null); meta.errors = c.errors; meta.synthWorks = synthWorks; meta.hookState = D.hookState; meta.hookAt = D.hookAt; meta.dclAt = D.dclAt; meta.loadAt = D.loadAt; meta.pins = D.pins;
save(TAG, { ...D, meta });

// ---- analysis per leg
const out = { tag: TAG, meta: { ...meta, loadEvents: undefined }, legs: {}, fails: [] };
const runLeg = (name, from, to, down, noJump) => {
  const a = analyse(D, { fromMark: from, toMark: to, down });
  if (noJump) { a.scrollJumps = []; a.scrollReversals = []; }
  const f = verdict(a); out.legs[name] = { frames: a.frames, travel: a.travel, yRange: [Math.round(a.yMin), Math.round(a.yMax)], dt: a.dt, stalls: a.stalls, shRange: a.scrollHeightRange, nRefresh: a.refresh?.length, layoutShifts: a.layoutShifts?.length, sticky: Object.fromEntries(Object.entries(a.sticky || {}).filter(([, s]) => s.stuckFrames > 0 || s.nBad).map(([k, s]) => [k, { stuck: s.stuckFrames, maxExcess: s.maxExcess, nBad: s.nBad }])), longTasks: a.longTasks?.length, loaf: a.loaf, fails: f };
  for (const x of f) out.fails.push(`[${name}] ${x}`);
  return a;
};
if (hashRun) {
  const tl = []; let py = null; for (const f of D.frames) { if (py === null || Math.abs(f[2] - py) > 0.9) { tl.push([Math.round(f[1]), Math.round(f[2]), f[5]]); py = f[2]; } }
  const shs = []; for (let i = 1; i < D.frames.length; i++) if (Math.abs(D.frames[i][5] - D.frames[i - 1][5]) > 0.5) shs.push([Math.round(D.frames[i][1]), D.frames[i - 1][5], D.frames[i][5]]);
  const a = analyse({ ...D, marks: [] }, {});
  out.hash = { target: HASH, yTimeline: tl.slice(0, 40), nYChanges: tl.length, shChanges: shs, final: meta.hashFinal, clsBad: a.clsBad, ls: a.layoutShifts, refresh: D.refresh.map((r) => `${Math.round(r.t)}${r.init ? 'i' : 'd'}@y${Math.round(r.y)}`).join(' '), dclAt: Math.round(D.dclAt), loadAt: Math.round(D.loadAt) };
  out.pass = tl.length <= 3 && Math.abs((meta.hashFinal?.y ?? 0) - (meta.hashFinal?.secTop ?? 0)) < 4 && !a.clsBad?.length;
} else if (early) {
  // pre-input scrollHeight / layout changes are informational; changes from the first wheel/touch input on are the criterion
  const fi = meta.firstInputAt ?? 0;
  D.marks.push({ n: 'first-input', t: fi, y: 0 }, { n: 'scenario-end', t: Infinity, y: 0 });
  const a = analyse(D, { fromMark: 'first-input', toMark: 'scenario-end', down: true });
  const pre = analyse({ ...D, marks: [{ n: 'a', t: D.dclAt ?? 0 }, { n: 'b', t: fi }] }, { fromMark: 'a', toMark: 'b' });
  const shPre = []; for (let i = 1; i < D.frames.length; i++) if (D.frames[i][1] < fi && Math.abs(D.frames[i][5] - D.frames[i - 1][5]) > 0.5) shPre.push({ now: Math.round(D.frames[i][1]), y: Math.round(D.frames[i][2]), from: D.frames[i - 1][5], to: D.frames[i][5] });
  out.pre = { dclAt: Math.round(D.dclAt), loadAt: Math.round(D.loadAt), firstInputAt: Math.round(fi), firstFrameAt: Math.round(D.frames[0]?.[1]), shChangesBeforeInput: shPre, shAtFirstFrame: D.frames[0]?.[5], clsBeforeInput: D.ls.filter((l) => l.t < fi).map((l) => ({ t: Math.round(l.t), v: +l.v.toFixed(5) })), refreshTimes: D.refresh.map((r) => `${Math.round(r.t)}${r.init ? 'i' : 'd'}`).join(' ') };
  const f = verdict(a); out.legs.early = { frames: a.frames, travel: a.travel, yRange: [Math.round(a.yMin), Math.round(a.yMax)], dt: a.dt, shRange: a.scrollHeightRange, nRefresh: a.refresh?.length, refresh: a.refresh, layoutShifts: a.layoutShifts, longTasks: a.longTasks, loaf: a.loaf, scrollJumps: a.scrollJumps, fails: f };
  for (const x of f) out.fails.push(`[early] ${x}`);
  out.pass = out.fails.length === 0;
} else {
  for (const l of legs) runLeg(l.name, l.from, l.to, l.down, l.noJump);
  if (SCEN === 'reload-mid') { const fi2 = (D.inputs.find(([t, n]) => n === 'wheel') || [0])[0]; D.marks.push({ n: 'first-wheel', t: fi2, y: 0 }); out.reloadFirstWheelAt = Math.round(fi2); const a = analyse(D, { fromMark: 'first-wheel', toMark: 'scenario-end', down: true }); const f = verdict(a); out.legs.reload = { frames: a.frames, shRange: a.scrollHeightRange, fails: f }; for (const x of f) out.fails.push(`[reload] ${x}`); }
  out.pass = out.fails.length === 0;
}
out.errors = c.errors;
writeFileSync(`${dir}/${TAG}.summary.json`, JSON.stringify(out, null, 1));
console.log(`${out.pass ? 'PASS' : 'FAIL'} ${TAG}`);
for (const [k, v] of Object.entries(out.legs)) console.log(`  ${k}: frames=${v.frames} travel=${v.travel} y=${JSON.stringify(v.yRange)} dt=${JSON.stringify(v.dt)} sh=${JSON.stringify(v.shRange)} refresh=${v.nRefresh ?? ''} ls=${Array.isArray(v.layoutShifts) ? v.layoutShifts.length : v.layoutShifts} sticky=${JSON.stringify(v.sticky || {})}${v.fails?.length ? '\n     FAILS: ' + v.fails.join('\n     ') : ''}`);
if (out.pre) console.log('  pre-input:', JSON.stringify(out.pre));
if (out.hash) console.log('  hash:', JSON.stringify(out.hash));
if (meta.sbBefore !== undefined) console.log('  scrollbar y:', meta.sbBefore, meta.sbAfterDown, meta.sbAfterUp);
if (meta.navClicks) console.log('  nav:', JSON.stringify(meta.navClicks));
if (c.errors.length) console.log('  console errors:', c.errors.slice(0, 5));
console.log('  hook:', meta.hookState, 'dcl', Math.round(meta.dclAt), 'load', Math.round(meta.loadAt), 'synthWorks', synthWorks, 'pins', JSON.stringify(meta.pins));
await c.close();
process.exit(0);
