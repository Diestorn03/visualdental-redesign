// v3-16: screenshots of nav hover (with a current item), palette hover/expand and header CTA hover. Header is brought back with a wheel-up notch like a user.
import { start, sleep, OUT, docTop } from './v3-lib.mjs';
const W = 1366, H = 820;
const b = await start({ w: W, h: H, tag: 'np', wait: 3500 });
const J = (o) => JSON.stringify(o);
const top = await docTop(b, '#about');
await b.move(W / 2, H / 2);
await b.wheelTo(top + 300, W / 2, H / 2); await sleep(1200);
await b.wheel(W / 2, H / 2, -100); await sleep(1300);
const pos = await b.evalJs(`Object.fromEntries([...document.querySelectorAll('.hdr__nav a, .hdr__cta, .hdr .btn')].map((a) => { const r = a.getBoundingClientRect(); return [a.dataset.nav || a.textContent.trim(), [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(r.width)]]; }))`);
console.log('header items', J(pos));
await b.shot('70-header-idle');
const p = pos.process; await b.move(p[0], p[1]); await sleep(900); await b.shot('71-header-hover-process');
const cta = pos['Send a case']; if (cta) { await b.move(cta[0], cta[1]); await sleep(900); await b.shot('72-header-hover-cta'); }
await b.move(W / 2, H / 2); await sleep(400);
const pal = await b.evalJs(`(() => { const r = document.querySelector('.pal').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width]; })()`);
await b.shot('73-palette-idle');
await b.move(pal[0], pal[1]); await sleep(900); await b.shot('74-palette-hover');
const pw = await b.evalJs(`(() => { const r = document.querySelector('.pal').getBoundingClientRect(); return { w: r.width, labels: [...document.querySelectorAll('.pal button, .pal [role=radio], .pal label')].map((x) => (x.getAttribute('aria-label') || x.textContent).trim().slice(0, 30)) }; })()`);
console.log('palette after hover', J(pw));
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
