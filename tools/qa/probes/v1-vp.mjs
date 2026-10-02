// v1-vp: does the emulated viewport apply from the very first layout of a new document? (1920x1080 hash-contact CLS 0.56 looked like a viewport resize 838 -> 1080)
import { launch, sleep, arg, OUT } from './v1-lib.mjs';
const W = +arg('w', 1920), H = +arg('h', 1080);
const c = await launch({ port: 9421, w: W, h: H, profile: `${OUT()}/profile-vp` });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__vp = [[performance.now(), innerWidth, innerHeight]]; addEventListener('resize', () => __vp.push([performance.now(), innerWidth, innerHeight]));` });
await c.send('Page.navigate', { url: 'http://127.0.0.1:4421/' });
await sleep(2500);
console.log(JSON.stringify(await c.ev('__vp')), 'final', await c.ev('[innerWidth, innerHeight, outerHeight]'));
await c.close(); process.exit(0);
