// v1-reanalyse: re-run the invariant analysis on a saved data/<tag>.json (legs recovered from the *-s / *-e marks). node v1-reanalyse.mjs <tag> [tag...]
import { readFileSync } from 'node:fs';
import { analyse, verdict, OUT } from './v1-lib.mjs';
for (const tag of process.argv.slice(2)) {
  const D = JSON.parse(readFileSync(`${OUT()}/data/${tag}.json`, 'utf8'));
  const names = [...new Set(D.marks.filter((m) => m.n.endsWith('-s')).map((m) => m.n.slice(0, -2)))];
  console.log('==', tag);
  for (const n of names) {
    if (!D.marks.find((m) => m.n === n + '-e')) continue;
    const down = /up/.test(n) ? false : /down/.test(n) ? true : null;
    const a = analyse(D, { fromMark: n + '-s', toMark: n + '-e', down });
    if (/^click-|^nav-/.test(n)) { a.scrollJumps = []; a.scrollReversals = []; }
    console.log(`  ${n}: frames=${a.frames} dt=${JSON.stringify(a.dt)} lenisDiv=${JSON.stringify(a.lenisDivergence?.max)} jumps=${a.scrollJumps?.length} fails=${verdict(a).length}`);
    if (a.stalls?.length) console.log('     stalls>60ms: ' + a.stalls.map((x) => `${x.gap}ms@y${Math.round(x.y)}(${x.sec})`).join(' '));
    for (const f of verdict(a)) console.log('     ' + f.slice(0, 500));
  }
}
