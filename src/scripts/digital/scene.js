/*
  Digital · 3D implant-planning scene: the page-side handle. The scene itself (three.js, fully procedural) lives in scene.engine.js and runs in a Web Worker
  on an OffscreenCanvas, so its build (PMREM, shader compiles that wait for the GPU compiler, 1-2.5 s on a cold shader cache) and every first render
  happen off the main thread and cannot hitch a scroll. Browsers without OffscreenCanvas WebGL run the same engine on the main thread (build in slices).
  ?digital=main forces that path (A/B for QA).

    const sc = await createScene(canvas, { reduced, lite, dpr, gizmo });   resolves when the scene is built, compiled and warmed (every step drawn once)
    sc.setProgress(p [, immediate])   0→1 over the six wizard steps (each is 1/6). The scene smooths p itself (≈ 0.14 s) unless `reduced`.
    sc.resize()                       reads canvas.clientWidth/Height (CSS size the page gave the canvas)
    sc.start() / sc.stop()            the rAF loop; nothing renders outside it (renderNow() draws one frame, for static use)
    sc.project(name) → {x, y, visible}  CSS px relative to the canvas; the anchors computed with the last frame the scene drew (a frame old at most).
        ONE shared object per call: read it right away. names: crown · implantTip · implantBody · axisTop · abutment · angle · sleeve · plane
        `visible` is false when the thing is not on screen at the current progress (not built yet / faded / off frustum).
    sc.dispose() · sc.info() (renderer.info.render + pr + mode) · sc.state() (smoothed progress + step amounts, for probes) · sc.warm() (no-op: warmed already)

  Drag to rotate (fine pointers only; wheel is never captured, touch keeps scrolling): own pointer handler (forwarded to the engine), no OrbitControls.
  The scene follows the page accent (--stroke: amber / mono) and updates when html[data-palette] changes. If createScene throws (no WebGL) the page shows the poster.
*/
import { cssAccent } from './cbct.js';

const NAMES = ['crown', 'implantTip', 'implantBody', 'axisTop', 'abutment', 'angle', 'sleeve', 'plane']; // same order as scene.engine.js
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// A worker that is up and can create WebGL2 on an OffscreenCanvas, or null (then the canvas is still untouched and the page builds the scene itself).
function spawn(canvas) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || !('transferControlToOffscreen' in canvas) || /[?&]digital=main(&|$)/.test(location.search)) return Promise.resolve(null);
  return new Promise((res) => {
    let w;
    try { w = new Worker(new URL('./scene.worker.js', import.meta.url), { type: 'module', name: 'digital-scene' }); } catch { res(null); return; }
    const done = (v) => { clearTimeout(t); w.onmessage = w.onerror = null; if (!v) w.terminate(); res(v); };
    const t = setTimeout(() => done(null), 12000);
    w.onerror = () => done(null);
    w.onmessage = (e) => done(e.data.hello && e.data.gl ? w : null);
  });
}

export async function createScene(canvas, { reduced = false, lite = false, dpr = 1, gizmo = true } = {}) {
  const opts = { reduced, lite, dpr, gizmo, accent: cssAccent(), w: canvas.clientWidth || 800, h: canvas.clientHeight || 500 };
  const last = { pj: new Array(NAMES.length * 3).fill(0), info: {}, st: {} };
  const onMsg = (m) => {
    if (m.pj) { last.pj = m.pj; last.info = m.info; last.st = m.st; }
    else if (m.ev) canvas.dispatchEvent(new Event(m.ev === 'lost' ? 'webglcontextlost' : 'webglcontextrestored', { cancelable: true })); // the real events fire in the worker
    else if (m.error) console.warn('[digital] scene:', m.error);
  };
  canvas.style.touchAction = 'pan-y';

  let call, worker = await spawn(canvas), eng = null;
  if (worker) {
    const off = canvas.transferControlToOffscreen();
    await new Promise((res, rej) => {
      worker.onmessage = (e) => (e.data.ready ? res() : e.data.error ? rej(new Error(e.data.error)) : onMsg(e.data));
      worker.onerror = (e) => rej(new Error(e.message || 'scene worker failed'));
      worker.postMessage({ init: opts, canvas: off }, [off]);
    }).catch((err) => { worker.terminate(); throw err; });
    worker.onmessage = (e) => onMsg(e.data); worker.onerror = (e) => console.warn('[digital] scene worker:', e.message);
    call = (m, ...a) => worker.postMessage({ m, a });
  } else {
    eng = await (await import('./scene.engine.js')).createEngine(canvas, opts, onMsg);
    call = (m, ...a) => eng[m](...a);
  }

  // palette: the scene follows --stroke
  let acc = opts.accent;
  const mo = new MutationObserver(() => { const a = cssAccent(); if (a !== acc) { acc = a; call('setAccent', a); } });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette'] });

  // drag to rotate: deltas are batched to one message per frame
  const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  let ax = 0, ay = 0, queued = 0, dragging = false, lx = 0, ly = 0;
  const flush = () => { queued = 0; if (ax || ay) { call('drag', 'move', ax, ay); ax = ay = 0; } };
  const onDown = (e) => { if (e.button !== 0 || (e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return; dragging = true; lx = e.clientX; ly = e.clientY; call('drag', 'down'); canvas.setPointerCapture?.(e.pointerId); canvas.style.cursor = 'grabbing'; };
  const onMove = (e) => { if (!dragging) return; ax += e.clientX - lx; ay += e.clientY - ly; lx = e.clientX; ly = e.clientY; if (!queued) queued = requestAnimationFrame(flush); };
  const onUp = (e) => { if (!dragging) return; dragging = false; cancelAnimationFrame(queued); flush(); call('drag', 'up'); canvas.releasePointerCapture?.(e.pointerId); canvas.style.cursor = 'grab'; };
  if (fine) { canvas.style.cursor = 'grab'; canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); }

  let lp = -1, lw = opts.w, lh = opts.h; const out = { x: 0, y: 0, visible: false };
  return {
    setProgress(x, immediate) { const v = clamp01(+x || 0); if (v !== lp || immediate) { lp = v; call('setProgress', v, !!immediate); } },
    resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h && (w !== lw || h !== lh)) { lw = w; lh = h; call('resize', w, h); } },
    start() { call('start'); },
    stop() { call('stop'); },
    renderNow() { call('renderNow'); },
    warm: () => Promise.resolve(), // the scene is warmed before createScene resolves
    project(name) {
      const i = NAMES.indexOf(name); out.visible = false; if (i < 0) return out;
      out.x = last.pj[i * 3]; out.y = last.pj[i * 3 + 1]; out.visible = !!last.pj[i * 3 + 2]; return out;
    },
    info: () => ({ ...last.info, mode: worker ? 'worker' : 'main' }), state: () => last.st,
    _dbg: eng?._dbg, // probes only (main-thread path)
    dispose() {
      mo.disconnect(); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      call('dispose'); if (worker) setTimeout(() => worker.terminate(), 100);
    },
  };
}
