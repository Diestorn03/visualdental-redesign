// d1-explore: load the production build, wait for the engine, print the layout map (sections, heights, pin) and engine state.
// node tools/qa/probes/d1-explore.mjs [--w=1366 --h=820] [--base=http://127.0.0.1:4401]
import { launch, install, engineUrlOf, sleep, OUT } from './d1-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const W = +arg('w', 1366), H = +arg('h', 820), BASE = arg('base', 'http://127.0.0.1:4401');
const dir = OUT('d1');
const c = await launch({ port: 9401, w: W, h: H, profile: `${dir}/profile` });
await install(c, await engineUrlOf(BASE));
await c.send('Page.navigate', { url: BASE + '/' });
await sleep(6000);
console.log(JSON.stringify(await c.ev(`(() => {
  const l = __d1.getLenis?.();
  const secs = [...document.querySelectorAll('main > section[id], body > footer')].map((s) => { const r = s.getBoundingClientRect(); return { id: s.id || s.tagName, top: Math.round(r.top + scrollY), h: Math.round(r.height), theme: s.dataset.theme }; });
  const ST = __d1.api?.ScrollTrigger;
  const trig = ST ? ST.getAll().map((t) => ({ id: t.vars.id, trig: __d1.desc(t.trigger), start: Math.round(t.start), end: Math.round(t.end), pin: !!t.pin, scrub: t.vars.scrub ?? null, once: !!t.vars.once })) : null;
  return { dpr: devicePixelRatio, inner: [innerWidth, innerHeight], scrollHeight: document.documentElement.scrollHeight, lenis: !!l, lenisOpts: l ? { lerp: l.options.lerp, duration: l.options.duration, smoothWheel: l.options.smoothWheel, wheelMultiplier: l.options.wheelMultiplier, syncTouch: l.options.syncTouch } : null, env: { desktop: __d1.env?.desktop, reduced: __d1.env?.reduced, lite: __d1.env?.lite }, hw: [navigator.hardwareConcurrency, navigator.deviceMemory], secs, nTrig: trig?.length, trig, htmlClass: document.documentElement.className, notes: __d1.notes, fonts: [...document.fonts].map((f) => f.family + ' ' + f.status).join(' | ') };
})()`), null, 1));
console.log('errors', c.errors);
await c.close();
