// f4-modes: non-desktop modes of #services keep the inline photos and run nothing (touch phone, reduced motion, 767 px wide). Shots in SHOTS_DIR.
//   MSYS_NO_PATHCONV=1 SHOTS_DIR="C:/.../.shots/f4/" node tools/qa/probes/f4-modes.mjs [cdpPort] [devPort]
import { launch, sleep } from './d4-lib.mjs';
const PORT = +(process.argv[2] || 9414), DEV = +(process.argv[3] || 4414);
const NOHMR = `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; })();`;
const modes = [
  { name: 'phone-390-touch', w: 390, h: 844, touch: true },
  { name: 'narrow-767-mouse', w: 767, h: 900 },
  { name: 'reduced-1366', w: 1366, h: 820, reduced: true },
];
for (const m of modes) {
  const b = await launch({ port: PORT, w: m.w, h: m.h, tag: 'f4m-' + m.name });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: NOHMR });
  if (m.touch) { await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }); await b.send('Emulation.setDeviceMetricsOverride', { width: m.w, height: m.h, deviceScaleFactor: 2, mobile: true }); }
  if (m.reduced) await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.open(`http://127.0.0.1:${DEV}/`);
  await b.evalJs(`document.querySelector('#services').scrollIntoView()`); await sleep(1500);
  await b.evalJs(`window.scrollBy(0, 420)`); await sleep(1200);
  const r = await b.evalJs(`(() => { const q = (s) => document.querySelector(s); const cs = (e, p) => getComputedStyle(e, p); const row = q('.svc__row');
    return { fx: document.documentElement.classList.contains('is-desktop-fx'), thumb: cs(q('.svc__thumb')).display, panel: cs(q('.svc__panel')).display, arrow: cs(row, '::before').content, activeRows: document.querySelectorAll('.svc__row.is-active').length, tabindex: row.getAttribute('tabindex'), thumbW: Math.round(q('.svc__thumb').getBoundingClientRect().width), hScroll: document.documentElement.scrollWidth > innerWidth }; })()`);
  console.log(m.name.padEnd(18), JSON.stringify(r), 'errors', JSON.stringify(b.errors));
  console.log(await b.shot(`f4-mode-${m.name}`));
  await b.close(); await sleep(1500); try { (await import('node:child_process')).execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ' + PORT + ' -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"'); } catch {} await sleep(1000);
}
process.exit(0);
