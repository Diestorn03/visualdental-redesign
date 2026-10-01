// Checks that every file media.js references exists and prints the weights.  node tools/media/verify.mjs
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { media } from '../../src/data/media.js';
const pub = fileURLToPath(new URL('../../public/', import.meta.url));
const missing = [], seen = new Set();
const need = (p) => { if (seen.has(p)) return; seen.add(p); if (!existsSync(pub + p)) missing.push(p); };
const walk = (o, path) => {
  if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${path}[${i}]`));
  if (o && typeof o === 'object') {
    if (o.base && o.widths) for (const w of o.widths) for (const e of ['avif', 'webp', 'jpg']) need(`${o.base}-${w}.${e}`);
    if (o.base && o.video) { need(`${o.base}.mp4`); need(`${o.base}.webm`); }
    if (o.src) need(o.src);
    if (o.png) need(o.png);
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') walk(v, `${path}.${k}`);
    if (o.base && o.widths) { // contract fields
      for (const f of ['w', 'h', 'alt', 'position']) if (o[f] == null && !(o.poster && f == 'position')) console.log('field missing', path, f);
      if (o.w !== o.widths.at(-1)) console.log('w != last width', path);
    }
  }
};
walk(media, 'media');
const keys = { brand: ['markDark', 'markLight'], hero: ['arch'], about: ['ola', 'jack', 'studio1', 'studio2', 'studio3', 'craft'],
  services: ['dsd', 'printing', 'shade', 'implant', 'ceramic', 'education'], recipe: ['consult', 'digital', 'finishing', 'result'],
  anatomy: ['arch'], stories: ['GuTcOzEswHo', 'wHwWyR-Vsfk', 'tbf0E3Yq3Qs', 'At9KcdW1_Cg', 'cpuyUuM52s8', '4_Bn42aDvnQ'] };
for (const [g, ks] of Object.entries(keys)) for (const k of ks) if (!media[g]?.[k]) console.log('MISSING KEY', g, k);
if (!(media.ig.length >= 8 && media.ig.every((e) => e.href?.startsWith('https://www.instagram.com/reel/')))) console.log('ig problem');
for (const f of ['brand/favicon-32.png', 'brand/favicon-192.png', 'brand/apple-touch-icon.png', 'brand/og.jpg']) need(f);
let bytes = 0; for (const p of seen) if (existsSync(pub + p)) bytes += statSync(pub + p).size;
console.log(`${seen.size} files referenced, ${missing.length} missing`, missing, `${(bytes / 1048576).toFixed(2)} MB referenced`);
