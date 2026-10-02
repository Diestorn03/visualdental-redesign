// Production-bundle smoke test (the worker as Vite emits it): serve a vite build of scene.js (see README/notes) and create the scene.
//   node tools/digital/prod-check.mjs --port=9416 --url=http://127.0.0.1:4417/
import { launch, sleep, arg, ROOT } from './v/v2-lib.mjs';
const c = await launch({ port: +arg('port', 9416), w: 900, h: 600, profileDir: ROOT + '.shots/d1/v/prof-shot', recorder: false });
await c.send('Page.navigate', { url: arg('url', 'http://127.0.0.1:4417/') }); await sleep(1500);
const r = await c.ev(`(async () => { const cv = document.getElementById('c'); cv.style.width = '600px'; cv.style.height = '380px'; const t0 = performance.now(); const s = await window.__t(); const t1 = performance.now(); s.setProgress(0.5, true); s.start(); await new Promise((r) => setTimeout(r, 1200)); return { buildMs: Math.round(t1 - t0), info: s.info(), st: s.state(), pj: s.project('implantBody') && { ...s.project('implantBody') } }; })()`);
console.log(JSON.stringify(r), 'errors', c.errors.slice(0, 4));
await c.close();
