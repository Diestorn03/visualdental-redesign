// v1-tenpx: who changes height between first layout and the end of boot? Snapshots every element under <main> (+ body) at DOMContentLoaded, fx-booted, fonts.ready,
// load and +3.5 s after navigation (empty cache, 1366x820 unless --w/--h), then diffs consecutive snapshots.
//   node tools/qa/probes/v1-tenpx.mjs [--w=1366 --h=820] [--base=http://127.0.0.1:4421] [--port=9421]
import { launch, sleep, arg, OUT } from './v1-lib.mjs';
import { writeFileSync } from 'node:fs';
const MOB = !!arg('mobile', false);
const W = +arg('w', MOB ? 390 : 1366), H = +arg('h', MOB ? 844 : 820), BASE = arg('base', 'http://127.0.0.1:4421'), PORT = +arg('port', 9421);
const dir = OUT();
const c = await launch({ port: PORT, w: W, h: H, dpr: MOB ? 3 : 1, mobile: MOB, profile: `${dir}/profile-${PORT}-tenpx`, fresh: true });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const S = window.__snaps = [];
  const path = (e) => { const p = []; for (let n = e; n && n !== document.body && p.length < 5; n = n.parentElement) p.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : '')); return p.join(' > '); };
  const snap = (tag) => { const m = {}; document.querySelectorAll('main *, body > footer, body > footer *').forEach((e) => { const r = e.getBoundingClientRect(); const k = path(e); m[k] = (m[k] || '') + (m[k] ? ',' : '') + Math.round(r.height * 10) / 10; });
    S.push({ tag, t: Math.round(performance.now()), sh: document.documentElement.scrollHeight, y: scrollY, m, secs: Object.fromEntries([...document.querySelectorAll('main > section[id], body > footer')].map((e) => [e.id || 'footer', Math.round((e.getBoundingClientRect().top + scrollY) * 10) / 10])) }); };
  document.addEventListener('DOMContentLoaded', () => snap('dcl'));
  new MutationObserver(() => { if (document.documentElement.classList.contains('fx-booted') && !S.some((s) => s.tag === 'booted')) snap('booted'); }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
  document.fonts && document.fonts.ready.then(() => snap('fonts'));
  addEventListener('load', () => { snap('load'); setTimeout(() => snap('load+1s'), 1000); setTimeout(() => snap('load+3s'), 3000); });
})();` });
await c.send('Page.navigate', { url: BASE + '/' });
await sleep(7000);
const snaps = JSON.parse(await c.ev(`JSON.stringify(window.__snaps)`));
console.log('errors', JSON.stringify(c.errors.slice(0,5)), 'n', snaps.length, await c.ev('document.readyState+" "+document.documentElement.className'));
const out = { tags: snaps.map((s) => ({ tag: s.tag, t: s.t, sh: s.sh })), diffs: [] };
for (let i = 1; i < snaps.length; i++) {
  const a = snaps[i - 1], b = snaps[i]; const d = [];
  for (const k of Object.keys(b.m)) if (a.m[k] !== b.m[k]) { const x = (a.m[k] ?? '').split(',').map(Number), y = (b.m[k] ?? '').split(',').map(Number); if (x.length !== y.length || x.some((v, j) => Math.abs(v - y[j]) > 0.5)) d.push(`${k}: ${a.m[k]} -> ${b.m[k]}`); }
  const secs = Object.keys(b.secs).filter((s) => Math.abs((a.secs[s] ?? b.secs[s]) - b.secs[s]) > 0.5).map((s) => `${s} top ${a.secs[s]} -> ${b.secs[s]}`);
  out.diffs.push({ from: a.tag, to: b.tag, sh: `${a.sh} -> ${b.sh}`, sectionTops: secs, changed: d.slice(0, 200), nChanged: d.length });
}
writeFileSync(`${dir}/tenpx${MOB ? '-mobile' : ''}.json`, JSON.stringify(out, null, 1));
for (const d of out.diffs) console.log(`${d.from} -> ${d.to}: sh ${d.sh}; tops: ${d.sectionTops.join(' | ') || '-'}; ${d.nChanged} elements changed height`, d.changed.slice(0, 12).join('\n    '));
await c.close(); process.exit(0);
