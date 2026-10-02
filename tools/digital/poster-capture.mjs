// Step-6 poster capture: the scene on the main thread (?digital=main), 1600x1000, reduced, no gizmo, progress 1 → .shots/d1/poster-p1.png; then python tools/digital/export-poster.py
//   MSYS_NO_PATHCONV=1 node tools/digital/poster-capture.mjs --port=9416 --url=http://127.0.0.1:4486/   (the wtest build served there, see wtest/vite.config.mjs)
import { writeFileSync } from 'node:fs';
import { launch, sleep, arg, ROOT } from './v/v2-lib.mjs';
const c = await launch({ port: +arg('port', 9416), w: 1600, h: 1000, profileDir: ROOT + '.shots/d1/v/prof-shot', recorder: false });
await c.send('Page.navigate', { url: arg('url', 'http://127.0.0.1:4486/') + '?digital=main' }); await sleep(1500);
const png = await c.ev(`(async () => { const cv = document.getElementById('c'); cv.style.width = '1600px'; cv.style.height = '1000px'; const s = await window.__t({ reduced: true, gizmo: false, dpr: 1 }); s.resize(); s.setProgress(+${arg('p', 1)}, true); await new Promise((r) => setTimeout(r, 300)); s.renderNow(); return cv.toDataURL('image/png'); })()`);
writeFileSync(ROOT + '.shots/d1/poster-p1.png', Buffer.from(png.split(',')[1], 'base64'));
console.log('poster-p1.png', png.length, 'errors', c.errors.slice(0, 3));
await c.close();
