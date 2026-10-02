// d5-env: sanity check of the emulation (pointer/hover media, classes, gsap exposure, section geometry) per device+mode.
// node tools/qa/probes/d5-env.mjs [mobile|tablet|desktop] [normal|reduced|calm]
import { launch, info, save, sleep } from './d5-lib.mjs';
const device = process.argv[2] || 'mobile', mode = process.argv[3] || 'normal';
const S = await launch(`env-${device}-${mode}`, { device, mode, wait: 3500 });
try {
  const i = await info(S);
  console.log(JSON.stringify(i));
  const geo = await S.eval(`(() => { const o = {}; for (const id of ['top','about','services','process','education','stories','faq','contact']) { const s = document.getElementById(id); if (s) { const r = s.getBoundingClientRect(); o[id] = [Math.round(r.top + scrollY), Math.round(r.height)]; } } const f = document.querySelector('body > footer'); if (f) { const r = f.getBoundingClientRect(); o.footer = [Math.round(r.top + scrollY), Math.round(r.height)]; } return o; })()`);
  console.log(JSON.stringify(geo));
  const g = await S.eval(`(() => { const ST = window.__ST; if (!ST) return null; return { n: ST.getAll().length, pins: ST.getAll().filter(t => t.pin).length, isTouch: ST.isTouch, scrubs: ST.getAll().filter(t => t.vars.scrub).length, once: ST.getAll().filter(t => t.vars.once).length } })()`);
  console.log('gsap', JSON.stringify(g));
  const split = await S.eval(`[...document.querySelectorAll('[data-split]')].map(e => ({ t: e.tagName + '.' + (e.className||'').toString().slice(0,30), mode: e.dataset.split, h: Math.round(e.getBoundingClientRect().height), top: Math.round(e.getBoundingClientRect().top + scrollY), txt: e.textContent.trim().slice(0, 30), split: !!e.querySelector('.split-line,.split-word') }))`);
  console.log(JSON.stringify(split));
  console.log('errors', S.errors);
} finally { S.close(); }
