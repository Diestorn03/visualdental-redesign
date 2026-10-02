// v3-19: hover latency (pointer event -> row active -> photo 10/50/100 %) over 12 alternating transitions rows 1<->3, scene already built (idle 12 s).
import { start, sleep, stats, FRAMES, docTop } from './v3-lib.mjs';
const W = 1366, H = 820;
const b = await start({ w: W, h: H, tag: 'lt', wait: 12000 });
const J = (o) => JSON.stringify(o);
await b.evalJs(FRAMES);
await b.evalJs(`window.__pe = []; addEventListener('pointermove', () => window.__pe.push(performance.now()), { capture: true, passive: true });
window.__fr.add('h', () => { const P = document.querySelector('.svc__panel'), rows = [...document.querySelectorAll('.svc__row')], sl = [...P.querySelectorAll('.svc__slide')];
  const vis = sl.map((s, k) => { const cs = getComputedStyle(s); const nums = (cs.clipPath.match(/[\\d.]+/g) || []).map(Number); return { k, v: cs.visibility === 'visible' && cs.display !== 'none', z: +s.style.zIndex || 0, cl: cs.clipPath === 'none' ? 0 : Math.max(0, ...nums) }; }).filter((o) => o.v).sort((a, b) => b.z - a.z);
  return { act: rows.findIndex((x) => x.classList.contains('is-active')), top: vis[0] ? vis[0].k : -1, clip: vis[0] ? vis[0].cl : 100 }; })`);
const listTop = await docTop(b, '.svc__list');
const L = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().left`);
await b.move(20, 30);
await b.wheelTo(listTop - 130, W / 2, H / 2); await sleep(2500);
const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
await b.move(L + 260, rows[0]); await sleep(1500);
const out = [];
for (let k = 0; k < 12; k++) {
  const to = k % 2 === 0 ? 2 : 0;
  await b.evalJs(`window.__pe.length = 0; window.__fr.start('h')`);
  await b.move(L + 260, rows[to]); await sleep(900);
  const S = await b.evalJs(`window.__fr.stop('h')`); const pe = await b.evalJs('window.__pe[0]');
  const iA = S.findIndex((s) => s.act === to), tA = S[iA].t;
  const at = (th) => { const s = S.find((s, i) => i >= iA && s.top === to && s.clip <= th); return s ? Math.round(s.t - tA) : null; };
  out.push({ ptr2row: Math.round(tA - pe), p10: at(90), p50: at(50), p100: at(0.5) });
}
const col = (k) => out.map((o) => o[k]).filter((v) => v != null);
console.log('ptr->row active ms', J(stats(col('ptr2row'))), '| row active->photo 10%', J(stats(col('p10'))), '| 50%', J(stats(col('p50'))), '| 100%', J(stats(col('p100'))));
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
