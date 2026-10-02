// f1-verify: structural checks of the f1 engine against the dev server (no frame-time statistics, so GPU contention cannot colour them).
//   T1  P1 heights: every [data-split] / [data-lit] has the same height split as plain (plain = the same page under prefers-reduced-motion, where the engine never splits), at 7 widths
//   T2  autoSplit: a window resize re-splits, heights match the plain text at the new width, nothing is left half-animated
//   T3  FAQ <details>: a height change after load produces ONE refresh (>= 250 ms after the change) and the later triggers move by exactly that delta
//   T4  deferral: a layout change made while the wheel is running is refreshed only after the scroll has been still for >= 160 ms
//   T5  modes: reduced motion and a phone (touch, 390 wide) boot without errors, with the expected refresh count
//   node tools/qa/probes/f1-verify.mjs [t1,t2,t3,t4,t5]
import { launch, sleep, OUT } from './f1-lib3.mjs';
import { instrument } from './f1-lib3.mjs';
import { mkdirSync } from 'node:fs';

const which = (process.argv[2] || 't1,t2,t3,t4,t5').split(',');
const BASE = 'http://127.0.0.1:4411/';
mkdirSync(OUT + 'verify', { recursive: true });
const errors = [];
let b;
async function open({ w = 1366, h = 820, reduced = false, mobile = false, wait = 3500 } = {}) {
  if (!b) {
    b = await launch({ port: 9411, w, h, profile: 'verify' });
    b.listeners.push((m) => {
      if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    });
    await instrument(b);
  }
  // one Chrome for the whole run (relaunching on the same port is flaky on Windows): switch the emulation, clear the per-tab state and reload
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  await b.send('Page.navigate', { url: BASE + '?r=' + Math.random().toString(36).slice(2) });
  await sleep(wait);
}
const heights = () => b.ev(`JSON.stringify([...document.querySelectorAll('[data-split], [data-lit]')].map((el) => [el.id || el.className.split(' ')[0] || el.tagName, Math.round(el.getBoundingClientRect().height * 100) / 100, el.querySelectorAll('.split-line').length, el.classList.contains('is-split'), el.querySelector('.lit-word') ? 1 : 0]))`).then(JSON.parse);
const refreshes = () => b.ev(`JSON.stringify(window.__R.refresh)`).then(JSON.parse);
const pad = (s, n) => String(s).padEnd(n);

if (which.includes('t1')) {
  console.log('\n=== T1 heights: plain (reduced motion) vs split, per width ===');
  let bad = 0, total = 0;
  for (const w of [390, 600, 768, 1024, 1280, 1440, 1920]) {
    await open({ w, h: 900, reduced: true, wait: 2500 }); const plain = await heights();
    await open({ w, h: 900, wait: 3500 }); const split = await heights();
    const diffs = plain.map((p, i) => ({ id: p[0], plain: p[1], split: split[i]?.[1], lines: split[i]?.[2], is: split[i]?.[3] })).filter((d) => Math.abs(d.plain - d.split) > 0.5);
    total += plain.length; bad += diffs.length;
    console.log(`${pad(w, 5)} elements ${plain.length}  split-class ${split.filter((s) => s[3]).length}  lit ${split.filter((s) => s[4]).length}  height differs: ${diffs.length}${diffs.length ? ' ' + JSON.stringify(diffs) : ''}`);
  }
  console.log(`T1 RESULT: ${bad} of ${total} element-widths differ by more than 0.5 px`);
}

if (which.includes('t2')) {
  console.log('\n=== T2 autoSplit on resize ===');
  await open({ w: 1366, h: 820, wait: 3500 });
  const before = await heights();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false }); await sleep(1800);
  const after = await heights();
  await open({ w: 1100, h: 820, reduced: true, wait: 2500 }); const plain = await heights();
  const d = after.map((a, i) => ({ id: a[0], split: a[1], plain: plain[i]?.[1], lines: `${before[i]?.[2]}->${a[2]}` })).filter((x) => Math.abs(x.split - x.plain) > 0.5);
  console.log(`1366 -> 1100: lines changed in ${after.filter((a, i) => a[2] !== before[i][2]).length} headings, height differs from plain@1100 in ${d.length}${d.length ? ' ' + JSON.stringify(d) : ''}`);
}

if (which.includes('t3')) {
  console.log('\n=== T3 FAQ details open: one refresh, triggers move by the delta ===');
  await open({ w: 1366, h: 820, wait: 3500 });
  await b.ev(`window.__vd.getLenis().scrollTo(document.querySelector('#faq').offsetTop, { immediate: true, force: true }); 0`); await sleep(1500);
  const read = () => b.ev(`JSON.stringify({ sh: document.documentElement.scrollHeight, st: window.__vd.ScrollTrigger.getAll().filter((s) => s.trigger?.closest?.('footer')).map((s) => Math.round(s.start)) })`).then(JSON.parse);
  const n0 = (await refreshes()).length; const r0 = await read();
  const t0 = await b.ev('performance.now()');
  await b.ev(`document.querySelector('#faq details summary').click(); 0`);
  await sleep(1500);
  const rf = (await refreshes()).slice(n0); const r1 = await read();
  console.log(`scrollHeight ${r0.sh} -> ${r1.sh} (delta ${r1.sh - r0.sh}); footer trigger start ${r0.st} -> ${r1.st} (delta ${r1.st[0] - r0.st[0]})`);
  console.log(`refreshes after the click: ${rf.length}${rf.length ? ' first at +' + Math.round(rf[0].t - t0) + ' ms (dur ' + rf[0].dur + ' ms)' : ''}`);
}

if (which.includes('t4')) {
  console.log('\n=== T4 refresh deferral while scrolling ===');
  await open({ w: 1366, h: 820, wait: 3500 });
  await b.ev(`window.__vd.getLenis().scrollTo(1200, { immediate: true, force: true }); 0`); await sleep(1200);
  const n0 = (await refreshes()).length;
  let lastWheel = 0, mutated = 0;
  const t0 = await b.ev('performance.now()');
  const tStart = Date.now();
  while (Date.now() - tStart < 2500) {
    await b.wheel(80); lastWheel = Date.now() - tStart;
    if (!mutated && Date.now() - tStart > 800) { mutated = Date.now() - tStart; await b.ev(`document.querySelector('#about').style.paddingBottom = '90px'; 0`); }
    await sleep(25);
  }
  await sleep(2200);
  const rf = (await refreshes()).slice(n0);
  const tEnd = await b.ev('performance.now()');
  console.log(`layout changed at +${mutated} ms, wheel stopped at +${lastWheel} ms`);
  for (const r of rf) console.log(`  refresh at +${Math.round(r.t - t0)} ms  lenisScrolling=${r.lenis}  dur ${r.dur} ms  -> ${Math.round(r.t - t0 - lastWheel)} ms after the last wheel notch`);
  console.log(`T4 RESULT: ${rf.length} refresh(es); during scroll: ${rf.filter((r) => r.t - t0 < lastWheel).length}; lenis.isScrolling at refresh: ${rf.filter((r) => r.lenis).length}`);
}

if (which.includes('t5')) {
  console.log('\n=== T5 modes ===');
  for (const [name, o] of [['reduced', { w: 1366, h: 820, reduced: true }], ['phone 390 touch', { w: 390, h: 844, mobile: true }]]) {
    errors.length = 0;
    await open({ ...o, wait: 3500 });
    const st = await b.ev(`JSON.stringify({ cls: document.documentElement.className, lenis: !!window.__vd.getLenis(), triggers: window.__vd.ScrollTrigger.getAll().length, splitLines: document.querySelectorAll('.split-line').length, hiddenSplit: [...document.querySelectorAll('[data-split],[data-lit]')].filter((e) => getComputedStyle(e).visibility === 'hidden').length, sh: document.documentElement.scrollHeight })`).then(JSON.parse);
    const rf = await refreshes();
    console.log(`${pad(name, 16)} ${JSON.stringify(st)} refreshes ${rf.length} (${rf.map((r) => r.dur + 'ms').join(', ')}) errors ${errors.length}${errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''}`);
  }
}
if (which.includes('t6')) {
  console.log('\n=== T6 restore: mode reload (calm switch) keeps the reader in place; #hash lands on the section ===');
  await open({ w: 1366, h: 820, wait: 3500 });
  const where = () => b.ev(`JSON.stringify((() => { const secs = [...document.querySelectorAll('main > section[id]')]; const cur = secs.filter((s) => s.getBoundingClientRect().top <= 1).pop(); return { y: Math.round(scrollY), id: cur?.id, f: cur ? +(-cur.getBoundingClientRect().top / cur.offsetHeight).toFixed(3) : null, rm: document.documentElement.classList.contains('calm') }; })())`).then(JSON.parse);
  await b.ev(`window.__vd.getLenis().scrollTo(document.querySelector('#stories').offsetTop + 400, { immediate: true, force: true }); 0`); await sleep(1200);
  const w0 = await where(); const o0 = await b.ev('performance.timeOrigin');
  await b.ev(`import('/src/scripts/engine.js').then((m) => m.setCalm(true)); 0`);
  for (let i = 0; i < 40 && (await b.ev('performance.timeOrigin').catch(() => o0)) === o0; i++) await sleep(250);
  await sleep(3000);
  const w1 = await where();
  console.log('before the reload', JSON.stringify(w0), '| after', JSON.stringify(w1));
  await b.ev(`localStorage.removeItem('vd-calm'); 0`);
  await b.send('Page.navigate', { url: BASE + '#faq' }); await sleep(3500);
  console.log('open with #faq:', await b.ev(`JSON.stringify({ y: Math.round(scrollY), faqTop: Math.round(document.querySelector('#faq').getBoundingClientRect().top) })`));
}
if (which.includes('t7')) {
  console.log('\n=== T7 stale split: a style that lands after the split (here: headings x3 font size) is repaired by the re-split ===');
  const css = "document.head.insertAdjacentHTML('beforeend', '<style id=late>h1,h2,h3,.display,.quote__text{font-size:300% !important}</style>'); 0";
  await open({ w: 1366, h: 820, reduced: true, wait: 2500 }); await b.ev(css); await sleep(800); const plain = await heights();
  await open({ w: 1366, h: 820, wait: 3500 }); const h0 = await heights(); await b.ev(css); await sleep(60); const broken = await heights(); await sleep(1500); const fixed = await heights();
  const n = (a) => a.filter((x, i) => Math.abs(x[1] - plain[i][1]) > 1).length;
  console.log(`headings whose height differs from the plain page with the same style: just after the style ${n(broken)}, after the repair ${n(fixed)} (of ${plain.length}); a split that is not repaired would be ~3x taller`);
}
if (b) await b.close();
process.exit(0);
