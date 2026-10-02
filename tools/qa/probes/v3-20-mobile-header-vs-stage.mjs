// v3-20: mobile: after a real touch scroll UP inside #digital the header comes back; does it cover the sticky 3D window (top: 0)?
process.env.D5_CDP ||= '9423';
process.env.D5_URL ||= 'http://127.0.0.1:4423/';
const { launch, touchScroll, waitSettled, sleep } = await import('./d5-lib.mjs');
import { writeFileSync } from 'node:fs';
const J = (o) => JSON.stringify(o);
const S = await launch('v3-mob-hdr', { device: 'mobile', wait: 4000 });
const OUTD = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v3-r2/';
const top = await S.eval(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
await S.eval(`document.documentElement.style.scrollBehavior='auto'; scrollTo(0, ${Math.round(top - 400)}); 0`); await sleep(600);
const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await S.eval(`!!(window.__digital && window.__digital.scene)`))) await sleep(500);
await S.eval(`scrollTo(0, ${Math.round(await S.eval('window.__digital.geo.a[2]'))}); 0`); await sleep(1500);
// scroll DOWN a bit (header hides), then UP a bit (header returns), like a reader
await touchScroll(S, { dist: 200, speed: 500, fling: false, dir: 'down' }); await waitSettled(S, { quiet: 300, max: 3000 });
await touchScroll(S, { dist: 120, speed: 500, fling: false, dir: 'up' }); await waitSettled(S, { quiet: 300, max: 3000 }); await sleep(1000);
const g = await S.eval(`(() => { const h = document.querySelector('[data-header]').getBoundingClientRect(), s = document.querySelector('.dg__stage').getBoundingClientRect(), w = document.querySelector('.dg__win').getBoundingClientRect(); return { hdrBottom: Math.round(h.bottom), hdrHidden: document.querySelector('[data-header]').classList.contains('is-hidden'), stageTop: Math.round(s.top), winTop: Math.round(w.top), titleBarCovered: h.bottom > w.top + 1, coveredPx: Math.max(0, Math.round(h.bottom - w.top)), coveredCanvasPx: Math.max(0, Math.round(h.bottom - document.querySelector('.dg__canvas').getBoundingClientRect().top)) }; })()`);
console.log('MOBILE header vs stage', J(g));
const r = await S.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(OUTD + '90-mobile-header-over-stage.png', Buffer.from(r.data, 'base64'));
S.close(); process.exit(0);
