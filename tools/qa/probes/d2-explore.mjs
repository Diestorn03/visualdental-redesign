// d2-explore: sanity + geometry + idle cadence + wheel actually moves the page.
import { launch, goto, frames, frameStats, playWheel, profiles, sleep, save, arg } from './d2-lib.mjs';
const PORT = +arg('port', 9402), URL = arg('url', 'http://127.0.0.1:4402/');
const c = await launch({ port: PORT, w: +arg('w', 1366), h: +arg('h', 820), dpr: +arg('dpr', 1) });
console.log(await c.send('Browser.getVersion').catch(() => '?'));
await goto(c, URL);
const info = await c.ev(`(() => { const secs = [...document.querySelectorAll('main > section[id], body > footer')].map((s) => { const r = s.getBoundingClientRect(); return { id: s.id || 'footer', top: Math.round(r.top + scrollY), h: Math.round(r.height) }; });
  return { docH: document.documentElement.scrollHeight, vh: innerHeight, vw: innerWidth, dpr: devicePixelRatio, secs, fx: document.documentElement.className, hc: navigator.hardwareConcurrency, mem: navigator.deviceMemory, mm: matchMedia('(pointer:fine)').matches, pin: [...document.querySelectorAll('.pin-spacer')].map((p) => ({ cls: p.firstElementChild?.className, h: p.offsetHeight })) }; })()`);
console.log(JSON.stringify(info, null, 1));
// idle cadence (nothing scrolling) for 3 s
await c.ev('__d2.reset(); __d2.rec = true; 1'); await sleep(3000); await c.ev('__d2.rec = false; 1');
let f = await frames(c); console.log('idle', JSON.stringify(frameStats(f.f)));
// wheel moves the page?
await c.ev('__d2.reset(); __d2.rec = true; 1');
const took = await playWheel(c, profiles.steady(1500, 40));
await sleep(1500); await c.ev('__d2.rec = false; 1');
f = await frames(c); console.log('wheel 1500px steady', took.toFixed(0) + 'ms', JSON.stringify(frameStats(f.f)), 'scrollY', await c.ev('scrollY'));
console.log('loaf', f.loaf.length, 'lt', f.lt.length, 'ls', JSON.stringify(f.ls));
await c.close();
