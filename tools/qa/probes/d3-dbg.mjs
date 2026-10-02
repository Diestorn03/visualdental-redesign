import { launch, sleep } from './d3-lib.mjs';
const b = await launch({ url: 'http://127.0.0.1:4403/' });
await sleep(3500);
console.log(JSON.stringify(await b.ev(`(() => { const l = window.__lenis; return { ok: !!l, opts: l && {lerp:l.options.lerp, duration:l.options.duration, wheelMultiplier:l.options.wheelMultiplier, smoothWheel:l.options.smoothWheel, syncTouch:l.options.syncTouch, autoRaf:l.options.autoRaf, easing: String(l.options.easing).slice(0,50)}, scroll: l?.scroll, limit: l?.limit, anim: l?.animatedScroll, target: l?.targetScroll, vel: l?.velocity, v: l?.constructor?.name } })()`)));
await b.close();
