// d4-01: environment + #services geometry at a given viewport, plus the first-glance screenshot (no pointer).
// node tools/qa/probes/d4-01-geometry.mjs [w] [h] [port]
import { launch, sleep, RECORDER } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `g${W}` });
await b.open('http://127.0.0.1:4404/');
console.log('env', JSON.stringify(await b.evalJs(`({ iw: innerWidth, ih: innerHeight, cw: document.documentElement.clientWidth, cls: document.documentElement.className, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory, fine: matchMedia('(pointer: fine)').matches, lenis: !!document.querySelector('html.lenis') })`)));
await b.evalJs(RECORDER);
const geo = await b.evalJs(`(() => {
  const q = (s) => document.querySelector(s); const R = (e) => { const r = e.getBoundingClientRect(); return { l: +r.left.toFixed(1), t: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), r: +r.right.toFixed(1) }; };
  const list = q('.svc__list'), lane = q('.svc__lane'), panel = q('.svc__panel'), hint = q('.svc__hint');
  const rows = [...document.querySelectorAll('.svc__row')].map(R);
  return { section: R(q('#services')), list: R(list), lane: R(lane), panelBox: { w: panel.offsetWidth, h: panel.offsetHeight, display: getComputedStyle(panel).display, pos: getComputedStyle(panel).position }, hint: R(hint), hintVis: getComputedStyle(hint).display, rows, headerH: q('[data-header]').offsetHeight, text: [...document.querySelectorAll('.svc__text')].map(R)[0], num: R(q('.svc__num')) };
})()`);
console.log(JSON.stringify(geo, null, 1));
// first-glance: wheel to the section top - 0 (so the header + hint + first rows are visible) and shoot
await b.wheelTo(geo.section.t - 10, W / 2, H / 2);
await sleep(1500);
console.log('scrollY', await b.evalJs('scrollY'));
console.log('shot', await b.shot(`01-first-glance-${W}`));
await b.wheelTo(geo.list.t - 140, W / 2, H / 2);
await sleep(1500);
console.log('shot', await b.shot(`01-list-top-${W}`));
console.log('errors', b.errors);
await b.close();
process.exit(0);
