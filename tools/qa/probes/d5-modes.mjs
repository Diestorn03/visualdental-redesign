// d5-modes: reduced-motion / calm / normal on desktop (real wheel) or mobile (real touch): scroll the whole page and verify
//   (a) no content stays invisible (opacity < .99, visibility hidden, clip-path other than none, on the engine's hooks and on every element with a clip/opacity inline style)
//   (b) no layout jumps (CLS, section shifts, scrollHeight changes, scrollY jumps) while scrolling
//   (c) structure: pins, lenis, html classes, horizontal overflow, Recipe list/pin, Services thumbnails
// node tools/qa/probes/d5-modes.mjs --device=desktop|mobile --mode=normal|reduced|calm [--lite]
import { launch, touchScroll, wheel, mouseMove, waitSettled, info, pullRec, analyze, save, sleep, secAt } from './d5-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const device = arg('device', 'desktop'), mode = arg('mode', 'reduced');
const S = await launch(`modes-${device}-${mode}`, { device, mode, wait: 3500 });
const touch = device !== 'desktop';
const AUDIT = `(() => {
  const bad = [];
  const sel = '[data-reveal], [data-stagger] > *, [data-draw], [data-split], [data-lit], .lit-word, .split-line, .split-word, .hero__rise, .hero__ln > span, .hero__photo, .hero__mesh-wrap, .ftr__wm--fill, .strip__view, .svc__row, .rc__step, .rc__frame, .plate__svg, .anno, .mark, figure, .portrait, .shot';
  for (const e of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    const o = parseFloat(cs.opacity);
    const issues = [];
    if (o < 0.99 && !e.classList.contains('lit-word')) issues.push('opacity=' + o.toFixed(2));
    if (cs.visibility === 'hidden') issues.push('visibility:hidden');
    if (cs.clipPath && cs.clipPath !== 'none') issues.push('clip-path=' + cs.clipPath.slice(0, 40));
    if (cs.transform && cs.transform !== 'none' && !e.closest('.strip__track') && !e.closest('.svc__panel')) { const m = new DOMMatrix(cs.transform); if (Math.abs(m.m42) > 1 || Math.abs(m.m41) > 1 || Math.abs(m.a - 1) > 0.01) issues.push('transform=' + cs.transform.slice(0, 50)); }
    if (e.classList.contains('lit-word') && o < 0.99) issues.push('lit-word opacity=' + o.toFixed(2));
    if (issues.length && r.width > 0 && r.height > 0) bad.push({ el: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).trim().split(/\s+/).slice(0, 2).join('.'), txt: (e.textContent || '').trim().slice(0, 24), issues: issues.join(' '), top: Math.round(r.top + scrollY) });
  }
  return bad;
})()`;
const STRUCT = `(() => { const o = {}; o.cls = document.documentElement.className; o.scrollW = document.documentElement.scrollWidth; o.innerW = innerWidth; o.hOverflow = document.documentElement.scrollWidth > innerWidth + 1;
  o.pins = window.__ST ? window.__ST.getAll().filter(t => t.pin).length : 'n/a'; o.triggers = window.__ST ? window.__ST.getAll().length : 'n/a';
  o.pinSpacers = document.querySelectorAll('.pin-spacer').length; o.rcPin = !!document.querySelector('.rc--pin');
  o.rcStepsVisible = [...document.querySelectorAll('.rc__step')].map(s => { const r = s.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  o.svcPanelDisplay = getComputedStyle(document.querySelector('.svc__panel')).display;
  o.svcThumbs = [...document.querySelectorAll('.svc__row img')].filter(i => i.getBoundingClientRect().height > 20).length;
  o.marquee = document.querySelector('.strip')?.classList.contains('is-marquee');
  o.stripAnim = document.querySelector('.strip__track')?.getAnimations().length;
  o.fabPos = getComputedStyle(document.querySelector('[data-fab]')).position;
  o.splitLeft = document.querySelectorAll('.split-line, .split-word, .lit-word').length; return o; })()`;
const rep = { device, mode, env: await info(S) };
rep.structTop = await S.eval(STRUCT);
rep.auditTop = await S.eval(AUDIT);
console.log(`[${device}/${mode}] env`, JSON.stringify(rep.env.mq), rep.env.cls, 'lenis', rep.env.lenis);
console.log('struct@top', JSON.stringify(rep.structTop));
console.log('audit@top (hidden/transformed elements right after load, includes below-fold):', rep.auditTop.length);
rep.auditTop.slice(0, 15).forEach((b) => console.log('   ', JSON.stringify(b)));

// ---- scroll through the page with real input
const maxY = () => S.eval('document.documentElement.scrollHeight - innerHeight');
const T0 = Date.now();
const audits = [];
let guard = 0;
const step = async () => {
  if (touch) { await touchScroll(S, { dist: 420, speed: 700, fling: false }); await sleep(180); }
  else { for (let i = 0; i < 6; i++) { await wheel(S, { dy: 100 }); await sleep(18 + (i % 3) * 8); } await sleep(260); }
};
while (guard++ < 400) {
  const y = await S.eval('scrollY'); if (y >= (await maxY()) - 2) break;
  await step();
  if (guard % 12 === 0) audits.push({ y: await S.eval('scrollY'), sec: await secAt(S), bad: (await S.eval(AUDIT)).filter((b) => b.top < 1e9).length });
}
await sleep(1500);
await pullRec(S);
const a = analyze(S.rec, { from: T0, minJump: 80 });
rep.scroll = { gestures: guard, ms: Date.now() - T0, dt: a.dt, scrollJumps: a.scrollJumps, docHeightChanges: a.docHeightChanges, sectionShifts: a.sectionShifts.length, clsTotal: a.clsTotal, cls: a.cls.slice(0, 6) };
rep.auditBottom = await S.eval(AUDIT);
rep.structBottom = await S.eval(STRUCT);
console.log(`scroll: ${guard} steps ${rep.scroll.ms}ms  dt med=${a.dt.med} p95=${a.dt.p95} max=${a.dt.max}  jumps(>=80px,4x)=${a.scrollJumps.length} heightChanges=${a.docHeightChanges.length} sectionShifts=${a.sectionShifts.length} CLS=${a.clsTotal}`);
a.scrollJumps.slice(0, 6).forEach((j) => console.log('   JUMP', JSON.stringify(j)));
a.docHeightChanges.slice(0, 6).forEach((j) => console.log('   HEIGHT', JSON.stringify(j)));
a.sectionShifts.slice(0, 6).forEach((j) => console.log('   SHIFT', JSON.stringify(j)));
console.log('audit at bottom (everything has been scrolled past):', rep.auditBottom.length);
rep.auditBottom.slice(0, 25).forEach((b) => console.log('   ', JSON.stringify(b)));
console.log('struct@bottom', JSON.stringify(rep.structBottom));
console.log('audits during the scroll:', JSON.stringify(audits));
console.log('navigations', S.nav.length, 'errors', S.errors.length ? S.errors : 'none');
save(`modes-${device}-${mode}.json`, { ...rep, audits, nav: S.nav, errors: S.errors });
S.close();
