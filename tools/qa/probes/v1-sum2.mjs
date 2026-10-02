// v1-sum2: reads .shots/v1-r2/*.summary.json and lists, per file, only the position/layout invariants (I1-I7); I8 (stalls) is v2's. Native-scroll legs (pgdn, scrollbar, reduced) skip I6/I7: Lenis model does not apply.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../../../.shots/v1-r2/', import.meta.url));
const only = process.argv[2];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.summary.json') && (!only || x.includes(only))).sort()) {
  const s = JSON.parse(readFileSync(dir + f, 'utf8')); const lines = [];
  for (const [k, l] of Object.entries(s.legs || {})) {
    const native = /pgdn|scrollbar/.test(k) || /reduced/.test(f);
    for (const x of l.fails || []) { if (/^I8/.test(x)) continue; if (native && /^I[67]/.test(x)) continue; lines.push(`[${k}] ${x.slice(0, 260)}`); }
  }
  if (s.hash) lines.push(`hash ${s.hash.target}: yChanges=${s.hash.nYChanges} final=${JSON.stringify(s.hash.final)} clsBad=${(s.hash.clsBad || []).map((c) => c.v.toFixed(4)).join(',')} sh=${JSON.stringify(s.hash.shChanges)}`);
  if (s.pre) lines.push(`pre-input: ${JSON.stringify(s.pre).slice(0, 300)}`);
  const stall = Object.entries(s.legs || {}).map(([k, l]) => l.dt ? `${k}:max${l.dt.max}/>100:${l.dt.gt100}` : '').filter(Boolean).slice(0, 3).join(' ');
  console.log(`${lines.length ? 'ISSUE' : 'ok   '} ${f.replace('.summary.json', '')}  ${stall}${lines.length ? '\n    ' + lines.join('\n    ') : ''}`);
}
