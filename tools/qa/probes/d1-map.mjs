// d1-map: document-space map of images / svgs / videos / big blocks (to relate scroll hotspots to content).  node tools/qa/probes/d1-map.mjs [--w=1366 --h=820]
import { launch, install, engineUrlOf, sleep, OUT } from './d1-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const W = +arg('w', 1366), H = +arg('h', 820), BASE = arg('base', 'http://127.0.0.1:4401');
const dir = OUT('d1');
const c = await launch({ port: 9401, w: W, h: H, profile: `${dir}/profile-map` });
await install(c, await engineUrlOf(BASE));
await c.send('Page.navigate', { url: BASE + '/' });
await sleep(5000);
const rows = await c.ev(`(() => { const out = []; const d = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  document.querySelectorAll('img, svg, video, iframe, canvas').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 24) return; const cs = getComputedStyle(e); out.push({ k: e.tagName.toLowerCase(), n: d(e), top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width), src: (e.currentSrc || '').split('/').pop(), nat: e.naturalWidth ? e.naturalWidth + 'x' + e.naturalHeight : '', lazy: e.loading, blend: cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : '', filt: cs.filter !== 'none' ? cs.filter : '', mask: (cs.maskImage || cs.webkitMaskImage) !== 'none' ? 'mask' : '' }); });
  return out.sort((a, b) => a.top - b.top); })()`);
for (const r of rows) console.log(`${String(r.top).padStart(6)} h${String(r.h).padStart(5)} w${String(r.w).padStart(5)} ${r.k.padEnd(6)} ${r.n.padEnd(46)} ${r.src.padEnd(34)} ${r.nat.padEnd(10)} ${r.lazy} ${r.blend} ${r.filt} ${r.mask}`);
await c.close(); process.exit(0);
