// d4-proto-shots: screenshots of the prototype at a given viewport (list top, hover row 3, mid-list) + preview/lane geometry.
// node tools/qa/probes/d4-proto-shots.mjs w h port
import { launch, sleep } from './d4-lib.mjs';
import { PROTO_JS } from './d4-proto-services.mjs';
const W = +(process.argv[2] || 1024), H = +(process.argv[3] || 700), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `ps${W}` });
await b.open('http://127.0.0.1:4404/');
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop + 1700, W / 2, H / 2); await sleep(1200); await b.wheelTo(listTop - 120, W / 2, H / 2); await sleep(2200);
await b.evalJs(PROTO_JS); await sleep(600);
console.log(await b.shot(`proto-shots-list-top-${W}`));
const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
const lb = await b.evalJs('document.querySelector(".svc__list").getBoundingClientRect().left');
await b.move(lb + 200, Math.min(H - 60, rows[2])); await sleep(1400);
console.log(await b.shot(`proto-shots-hover3-${W}`));
console.log(JSON.stringify(await b.evalJs(`(() => { const r = document.querySelector('.svc__preview').getBoundingClientRect(), l = document.querySelector('.svc__lane').getBoundingClientRect(), t = document.querySelector('.svc__text').getBoundingClientRect(); return { preview: [r.left, r.top, r.width, r.height].map(Math.round), lane: [l.left, l.width].map(Math.round), textRight: Math.round(t.right) }; })()`)));
await b.close(); process.exit(0);
