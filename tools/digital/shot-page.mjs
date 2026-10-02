// Screenshots of the Digital planning window on the REAL page (GPU Chrome over CDP), at the centre of each step or at explicit progress values.
//   node tools/digital/shot-page.mjs --port=9416 --url=http://127.0.0.1:4416/ [--w=1366 --h=820 --dpr=1] [--steps=1,2,3,4,5,6] [--p=0.84,0.9] [--out=name] [--palette=mono] [--switch=mono] [--main] [--hold=1500]
// Output: .shots/d1/<out>/<tag>.png (the .dg__win box), report.json with the canvas buffer size and the scene info. Git Bash: MSYS_NO_PATHCONV=1.
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, goto, geom, sleep, arg, ROOT } from './v/v2-lib.mjs';

const PORT = +arg('port', 9416), W = +arg('w', 1366), H = +arg('h', 820), DPR = +arg('dpr', 1), OUT = ROOT + '.shots/d1/' + arg('out', 'shots') + '/';
const q = [arg('palette', '') && 'palette=' + arg('palette', ''), arg('main', false) && 'digital=main'].filter(Boolean).join('&');
const URL = arg('url', 'http://127.0.0.1:4416/') + (q ? '?' + q : '');
mkdirSync(OUT, { recursive: true });
const c = await launch({ port: PORT, w: W, h: H, dpr: DPR, profileDir: ROOT + '.shots/d1/v/prof-shot', fresh: false, recorder: false });
await goto(c, URL, { settle: 1500 });
const g = await geom(c); const dg = g.secs.find((s) => s.id === 'digital');
await c.ev(`scrollTo(0, ${dg.top - Math.round(g.vh * 1.2)}); 1`);
for (let i = 0; i < 200; i++) { if (await c.ev(`document.querySelector('#digital')?.dataset.ready === '1'`)) break; await sleep(250); }
if (arg('switch', '')) { await c.ev(`document.documentElement.dataset.palette = '${arg('switch', '')}'; 1`); await sleep(800); } // live palette switch after the scene exists
const geo = await c.ev(`JSON.parse(JSON.stringify(window.__digital.geo))`);
const rect = await c.ev(`(() => { const r = document.querySelector('.dg__win').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
const steps = String(arg('steps', '1,2,3,4,5,6')).split(',').filter(Boolean).map(Number), ps = String(arg('p', '')).split(',').filter(Boolean).map(Number);
const report = [];
const shot = async (tag) => {
  await sleep(+arg('hold', 1500));
  const r = await c.ev(`(() => { const cv = document.querySelector('.dg__canvas'), s = window.__digital.scene; return { buf: [cv.width, cv.height], css: [cv.clientWidth, cv.clientHeight], live: document.querySelector('#digital').classList.contains('is-live'), info: s && s.info && s.info(), st: s && s.state && s.state() }; })()`);
  const sc = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + tag + '.png', Buffer.from(sc.data, 'base64')); report.push({ tag, ...r });
};
for (const s of steps) { await c.ev(`scrollTo(0, ${Math.round(geo.a[s - 1])}); 1`); await shot('s' + s); }
for (const p of ps) { // explicit progress: scroll to the step it belongs to, then override the scene
  const k = Math.min(5, Math.floor(p * 6)); await c.ev(`scrollTo(0, ${Math.round(geo.a[k])}); 1`); await sleep(900);
  await c.ev(`window.__digital.scene.setProgress(${p}, true); 1`); await shot('p' + String(p).replace('.', '_'));
}
writeFileSync(OUT + 'report.json', JSON.stringify({ errors: c.errors.slice(0, 12), report }, null, 1));
console.log(JSON.stringify(report.map((r) => [r.tag, r.buf.join('x'), r.info?.pr, r.info?.mode, r.live])), '\nerrors:', c.errors.slice(0, 6));
await c.close();
