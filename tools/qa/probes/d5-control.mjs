// d5-control: same touch drags on a trivial tall page (no site code) to separate harness artefacts from the site's own jank.
// node tools/qa/probes/d5-control.mjs [mobile|tablet] [gestures=40]
import { launch, touchScroll, analyze, pullRec, sleep } from './d5-lib.mjs';
const device = process.argv[2] || 'mobile', n = +(process.argv[3] || 40);
const S = await launch('ctl-' + device, { device, noNav: true, lite: true });
const html = '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0"><div style="height:30000px;background:repeating-linear-gradient(#222,#222 300px,#c84 300px,#c84 600px)"><p style="font:40px sans-serif;color:#fff">control</p></div>';
await S.send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') });
await sleep(1500);
const T0 = Date.now();
for (let i = 0; i < n; i++) { await touchScroll(S, { dist: 420, speed: 600, fling: false }); await sleep(200); }
await sleep(500); await pullRec(S);
const a = analyze(S.rec, { from: T0 });
console.log(device, 'control drags:', n, 'frames', a.frames, 'dt', JSON.stringify(a.dt), 'endY', await S.eval('scrollY'));
S.close();
