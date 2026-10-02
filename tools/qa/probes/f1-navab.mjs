// f1-navab: cold nav jump services -> faq with a fresh Chrome profile (no GPU shader cache), optionally with parts of the page hidden (A/B).
// node tools/qa/probes/f1-navab.mjs [--hide=#contact,footer] [--css="..."] [--idle=12000] [--from=services] [--to=faq] [--runs=1] [--base=URL] [--noskip=1 (engine without the long-jump skip: A/B baseline)]
// Prints per run: motion frames, >33, >50, worst frame, and the slow frames (t:dt:y).
process.env.SHOTS_DIR ||= 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f1/nav/';
import { rmSync } from 'node:fs';
import { VITE_STUB } from './f1-lib.mjs';
const d4 = await import('./d4-lib.mjs');
const { sleep, OUT } = d4;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:4411/'), PORT = +(process.env.F1_CDP || 9411), IDLE = +arg('idle', 12000), HIDE = arg('hide', ''), CSS = arg('css', ''), FROM = arg('from', 'services'), TO = arg('to', 'faq'), RUNS = +arg('runs', 1), TAG = arg('tag', 'ab'), NOSKIP = !!arg('noskip', ''), SETTLE = +arg('settle', 0), LEADV = +arg('lead', 0);
const W = 1366, H = 820;
for (let run = 0; run < RUNS; run++) {
  const tag = TAG + '-' + run;
  try { rmSync(OUT + 'profile-' + tag, { recursive: true, force: true }); } catch {}
  const b = await d4.launch({ port: PORT, w: W, h: H, tag });
  b.ws.addEventListener('message', async (e) => { const m = JSON.parse(e.data); if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    try {
      let body = VITE_STUB;
      if (!request.url.includes('/@vite/client')) { body = await (await fetch(request.url)).text(); if (NOSKIP) body = body.replace(/const LONG_JUMP = [^,]+,/, 'const LONG_JUMP = 1e9,'); if (SETTLE) body = body.replace(/SETTLE = d+;/, 'SETTLE = ' + SETTLE + ';'); if (LEADV) body = body.replace(/LEAD = [\d.]+,/, 'LEAD = ' + LEADV + ','); }
      await b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(body).toString('base64') });
    } catch { try { await b.send('Fetch.continueRequest', { requestId }); } catch {} } });
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/@vite/client*', requestStage: 'Request' }, ...(NOSKIP || SETTLE || LEADV ? [{ urlPattern: '*/src/scripts/engine.js*', requestStage: 'Request' }] : [])] });
  await b.open(BASE, IDLE);
  const css = (HIDE ? HIDE.split(',').map((s) => s + '{visibility:hidden !important}').join('') : '') + CSS;
  if (css) await b.evalJs(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); })()`);
  await b.evalJs(`window.__t = []; (() => { const tick = (t) => { window.__t.push([+t.toFixed(1), Math.round(scrollY)]); requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
  const click = async (id) => {
    const hb = await b.evalJs(`document.querySelector('[data-header]').getBoundingClientRect().bottom`);
    if (hb <= 0) { await b.wheel(W / 2, H / 2, -100); await sleep(900); }
    const n = await b.evalJs(`(() => { const a = document.querySelector('.hdr__nav a[data-nav="${id}"]'); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.move(n[0], n[1]); await sleep(250); await b.down(n[0], n[1]); await sleep(30); await b.up(n[0], n[1]);
    return b.evalJs('performance.now()'); // ~ mouse-up time
  };
  const out = {};
  for (const [id, label] of [[FROM, 'a'], [TO, 'b']]) {
    const t0 = await b.evalJs('performance.now()');
    const tUp = await click(id); await sleep(4200);
    const T = (await b.evalJs('window.__t')).filter((r) => r[0] >= t0);
    const all = T.filter((r) => r[0] >= tUp - 20), gaps = all.map((r, i) => i ? r[0] - all[i - 1][0] : 0);
    const first = all.find((r, i) => i && r[1] !== all[i - 1][1]);
    const mv = T.filter((r, i) => i && r[1] !== T[i - 1][1]), dts = mv.map((r) => r[0] - T[T.indexOf(r) - 1][0]);
    out[label] = { dist: Math.abs(T.at(-1)[1] - T[0][1]), latency: first ? Math.round(first[0] - tUp) : null, worstAny: Math.round(Math.max(...gaps)), frames: mv.length, o33: dts.filter((d) => d > 33).length, o50: dts.filter((d) => d > 50).length, worst: Math.round(Math.max(...dts)), slow: mv.map((r, i) => [Math.round(r[0] - t0), Math.round(dts[i]), r[1]]).filter((r) => r[1] > 33).map((r) => r.join(':')).join(' ') };
  }
  console.log(`run ${run} ${NOSKIP ? 'noskip ' : ''}${SETTLE ? 'settle=' + SETTLE + ' ' : ''}${LEADV ? 'lead=' + LEADV + ' ' : ''}${HIDE || CSS || 'default'}`, `${FROM}:`, JSON.stringify(out.a), `${TO}:`, JSON.stringify(out.b));
  await b.close(); await sleep(500);
  try { rmSync(OUT + 'profile-' + tag, { recursive: true, force: true }); } catch {}
}
process.exit(0);
