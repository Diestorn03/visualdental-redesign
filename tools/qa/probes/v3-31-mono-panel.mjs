// v3-31 (r2): Services panel opaque background vs the section background in both palettes (a visible box would mean a mismatch) + screenshot in mono.
import { start, sleep, OUT, docTop } from './v3-lib.mjs';
const b = await start({ w: 1366, h: 820, tag: 'mp', wait: 3500 });
const J = (o) => JSON.stringify(o);
await b.move(683, 400); await b.wheelTo((await docTop(b, '.svc__list')) - 160, 683, 400); await sleep(1800);
for (const pal of ['amber', 'mono']) {
  await b.evalJs(`(() => { const o = [...document.querySelectorAll('.pal button')].find((x) => x.dataset.palOpt === ${J(pal)}); o && o.click(); return 0; })()`); await sleep(900);
  const c = await b.evalJs(`(() => { const P = document.querySelector('.svc__panel'); const sec = document.querySelector('#services'); const px = (e) => getComputedStyle(e).backgroundColor; return { palette: document.documentElement.dataset.palette || 'amber', panelBg: px(P), sectionBg: px(sec), bodyBg: px(document.body), capColor: getComputedStyle(P.querySelector('.svc__cap')).color }; })()`);
  console.log(pal, J(c));
  await b.shot(`mp-services-${pal}`);
}
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
