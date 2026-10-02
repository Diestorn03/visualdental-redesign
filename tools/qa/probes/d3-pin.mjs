// d3: pin (#process .rc__stage) behaviour under different inputs. Samples, per gsap tick (after Lenis+ScrollTrigger), scrollY, stage rect.top, ST progress
// and the timeline time, and ALSO inside the native `scroll` event (which fires before rAF). Inputs: wheel slow / fast / up, keyboard PageDown, Space, scrollbar-like (synthesizeScrollGesture touch).
// Reports pin jitter (stage.top != pinned top while inside the range), engage/release edge samples, and the "settle" lag after the input stops (Lenis + scrub:0.8).
// Usage: node tools/qa/probes/d3-pin.mjs [dpr=1] [w=1366] [h=820]
import { launch, sleep, OUT } from './d3-lib.mjs';
import { writeFileSync } from 'node:fs';

const DPR = +(process.argv[2] || 1), W = +(process.argv[3] || 1366), H = +(process.argv[4] || 820);
const PORT = +(process.env.CDP_PORT || 9403);
const b = await launch({ port: PORT, w: W, h: H, dpr: DPR, url: 'http://127.0.0.1:4403/' });
await sleep(4500);
const info = await b.ev(`(() => { const st = window.__ST.getAll().find((s) => s.pin); return { start: st.start, end: st.end, spacer: !!st.pin.parentElement.classList.contains('pin-spacer'), cs: getComputedStyle(st.pin).position, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight, tl: st.animation.duration() }; })()`);
console.log('pin:', JSON.stringify(info));
const { start, end } = info;

await b.ev(`(() => {
  const g = window.__gsap, ST = window.__ST;
  const st = ST.getAll().find((s) => s.pin); const stage = st.pin;
  const R = (window.__P = { tick: [], scroll: [], on: false });
  g.ticker.add(() => { if (!R.on) return; R.tick.push([performance.now(), scrollY, stage.getBoundingClientRect().top, st.progress, st.animation.time(), getComputedStyle(stage).position, window.__lenis.animatedScroll]); });
  addEventListener('scroll', () => { if (!R.on) return; R.scroll.push([performance.now(), scrollY, stage.getBoundingClientRect().top, getComputedStyle(stage).position]); }, { passive: true });
  return 1;
})()`);
const reset = (y) => b.ev(`window.__lenis.scrollTo(${y}, { immediate: true, force: true }); window.__P.on = false; window.__P.tick.length = 0; window.__P.scroll.length = 0; 1`);
const key = async (vk, code, text) => { await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: vk, code, key: code, text }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: vk, code, key: code }); };

function analyse(name, P) {
  const T = P.tick; const n = T.length;
  let inPin = 0, bad = 0, maxDev = 0; const badRows = [];
  for (let i = 0; i < n; i++) {
    const [t, y, top, prog, tm, pos] = T[i];
    if (y > start + 1 && y < end - 1) { inPin++; const dev = Math.abs(top - (T.find((r) => r[1] > start + 3 && r[1] < end - 3 && Math.abs(r[2]) < 5)?.[2] ?? 0)); if (dev > 0.6) { bad++; if (badRows.length < 8) badRows.push(`${y.toFixed(1)}:${top.toFixed(1)}:${pos}`); } maxDev = Math.max(maxDev, dev); }
  }
  // transition frames: position != fixed while inside the range, or fixed outside it
  const wrongState = T.filter(([t, y, top, p, tm, pos]) => (y > start + 1 && y < end - 1 && pos !== 'fixed') || ((y < start - 1 || y > end + 1) && pos === 'fixed')).length;
  const dts = []; for (let i = 1; i < n; i++) dts.push(T[i][0] - T[i - 1][0]);
  const over25 = dts.filter((d) => d > 25).length;
  console.log(`[${name}] frames=${n} inPin=${inPin} stage.top deviates >0.6px: ${bad} (max ${maxDev.toFixed(2)}px) ${badRows.join(' ')} | wrong position state frames: ${wrongState} | dt>25ms: ${over25} (max ${Math.max(0, ...dts).toFixed(0)})`);
  // edge samples (first 8 ticks within +-120px of start)
  const edge = (e, label) => { const r = T.filter((x) => Math.abs(x[1] - e) < 90).slice(0, 14).map((x) => `${x[1].toFixed(0)}:${x[2].toFixed(1)}${x[5][0]}`); console.log(`   ${label} (y:stage.top + position f=fixed/r=relative):`, r.join(' ')); };
  edge(start, 'engage'); edge(end, 'release');
  // scroll-event samples vs tick samples: scroll events carry the offset the browser scrolled to BEFORE script; stage position may lag
  const S = P.scroll; const lagEvents = S.filter(([t, y, top, pos]) => (y > start + 1 && y < end - 1 && pos !== 'fixed')).length;
  console.log(`   native scroll events: ${S.length}; events with y inside range but stage not yet fixed: ${lagEvents}`);
}
async function settle(name) { // after input stops: how long until scroll AND timeline stop moving
  const t0 = await b.ev('performance.now()');
  await sleep(2500);
  const P = await b.ev('window.__P');
  const T = P.tick; let lastMoveScroll = 0, lastMoveTl = 0, endInput = null;
  for (let i = 1; i < T.length; i++) { if (Math.abs(T[i][1] - T[i - 1][1]) > 0.01) lastMoveScroll = T[i][0]; if (Math.abs(T[i][4] - T[i - 1][4]) > 0.0005) lastMoveTl = T[i][0]; }
  console.log(`   settle: last scrollY change at +${(lastMoveScroll - t0).toFixed(0)}ms after input end, last timeline change at +${(lastMoveTl - t0).toFixed(0)}ms (tl lags scroll by ${(lastMoveTl - lastMoveScroll).toFixed(0)}ms)`);
  return P;
}

// --- 1. wheel, slow (20px every 16ms) across the pin
await reset(start - 500); await b.ev('window.__P.on = true; 1');
for (let y = 0; y < end - start + 1100; y += 20) { await b.wheel(20); await sleep(16); }
let P = await settle('slow'); analyse('wheel slow 20px/16ms', P); writeFileSync(OUT + `pin-slow-dpr${DPR}.json`, JSON.stringify(P));
// --- 2. wheel notches fast (100 / 8ms)
await reset(start - 700); await b.ev('window.__P.on = true; 1');
for (let i = 0; i < 40; i++) { await b.wheel(100); await sleep(8); }
await sleep(400); for (let i = 0; i < 40; i++) { await b.wheel(100); await sleep(8); }
P = await settle('fast'); analyse('wheel fast 100px/8ms', P);
// --- 3. wheel up through the pin
await reset(end + 700); await b.ev('window.__P.on = true; 1');
for (let i = 0; i < 70; i++) { await b.wheel(-60); await sleep(12); }
P = await settle('up'); analyse('wheel up -60px/12ms', P);
// --- 4. keyboard PageDown (native compositor scroll, Lenis does not intercept keys)
await reset(start - 500); await b.ev('window.__P.on = true; 1');
await b.move(600, 400);
for (let i = 0; i < 9; i++) { await key(34, 'PageDown'); await sleep(650); }
P = await settle('pgdn'); analyse('keyboard PageDown', P);
// --- 5. ArrowDown held (key repeat ~30/s)
await reset(start - 300); await b.ev('window.__P.on = true; 1');
for (let i = 0; i < 120; i++) { await key(40, 'ArrowDown'); await sleep(33); }
P = await settle('arrow'); analyse('keyboard ArrowDown x120 @30Hz', P);
// --- 6. touch-like native drag (compositor scroll, no Lenis)
await reset(start - 500); await b.ev('window.__P.on = true; 1');
try { await b.send('Input.synthesizeScrollGesture', { x: 600, y: 600, yDistance: -1500, speed: 900, gestureSourceType: 'mouse', preventFling: true }); } catch (e) { console.log('gesture err', e.message); }
P = await settle('gesture'); analyse('synthesizeScrollGesture(mouse wheel-ish) 1500px', P);
await b.close();
