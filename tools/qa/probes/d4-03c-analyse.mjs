// d4-03c: summarise a d4-03b JSON: how often does the visible photo match the highlighted row while wheel-scrolling over the list?
// node tools/qa/probes/d4-03c-analyse.mjs <json>
import { readFileSync } from 'node:fs';
const S = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const clip = (s) => { const m = /inset\(([\d.]+)%/.exec(s.topCp || ''); return m ? +m[1] : 0; };
const scroll = S.filter((s, i) => i && s.y !== S[i - 1].y);
const inList = scroll.filter((s) => s.act >= 0 || /^row|svc__list/.test(s.hit));
let match = 0, lag = 0, none = 0;
for (const s of inList) { if (s.act < 0) { none++; continue; } if (s.top === s.act && clip(s) <= 10) match++; else lag++; }
const blinks = []; S.forEach((s, i) => { if (i && S[i - 1].act >= 0 && s.act < 0 && /^row|svc__list/.test(S[i - 1].hit + s.hit) || (s.hit === 'svc__list is-active' || s.hit === 'svc__list')) blinks.push(i); });
const minOp = Math.min(...S.filter((s) => s.act >= 0 || s.op < 1).map((s) => s.op));
console.log(JSON.stringify({ framesScrolling: scroll.length, framesOverList: inList.length, photoMatchesRow: match, photoStillOldRow: lag, panelHidden: none, pctPhotoMismatch: +(100 * lag / Math.max(1, match + lag)).toFixed(0), hitIsListNotRow: S.filter((s) => s.hit.startsWith('svc__list')).length, rowActiveDropped: S.filter((s, i) => i && s.act < 0 && S[i - 1].act >= 0).length }));
