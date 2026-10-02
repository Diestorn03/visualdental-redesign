// #digital: the planning window follows the scroll position of the six steps (window sticky in CSS, no ScrollTrigger pin).
//   scroll → target progress (0..1, six equal zones, one per step) → smoothed per frame → scene.setProgress + CBCT slices + wizard + toolbar + callouts.
// The scene (three.js) and the CBCT drawing are separate modules, built early and only in pauses (see "scene build" below). Nothing here changes layout
// after load (P1) and nothing calls ScrollTrigger.refresh (P2: geometry is re-measured in onRefresh).
// Static mode (reduced motion, calm switch, low-power guess; ?digital=3d forces live on a low-power device): the poster stands in for the scene
// (no poster file: one still frame of the scene instead, except on low-power devices).
import { onPage } from './engine.js';

const N = 6;
// cbct.js is optional (glob = a missing file is an empty map, not a build error): the window still works without its slices.
const cbctModule = import.meta.glob('./digital/cbct.js')['./digital/cbct.js'];
const loadCbct = () => (cbctModule ? cbctModule() : Promise.resolve(null)).catch((err) => { console.warn('[digital] CBCT unavailable', err); return null; });

onPage(({ ScrollTrigger, env, lenis, onRefresh }) => {
  const root = document.querySelector('#digital');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const stage = $('.dg__stage'), body = $('.dg__body'), vp = $('.dg__vp'), canvas = $('.dg__canvas');
  const steps = [...root.querySelectorAll('.dg__step')];
  const links = [...root.querySelectorAll('.dg__link')];
  const tools = [...root.querySelectorAll('.dg__tool')].map((el) => ({ el, on: el.dataset.on.split(' ').map(Number) }));
  const calls = [...root.querySelectorAll('.dg__call')].map((el, i) => ({ el, i, t: el.querySelector('.dg__call-t'), anchor: el.dataset.anchor, from: +el.dataset.from, len: +(el.dataset.len || 22), pref: 'below' in el.dataset, left: el.dataset.side === 'l', w: 110, h: 22, vis: false, x: NaN, y: NaN, flip: false, below: false }));
  const panes = [...root.querySelectorAll('.dg__pane')].map((p) => ({ view: p.dataset.view, ctx: p.querySelector('canvas').getContext('2d') }));
  const wizN = $('[data-n]'), wizT = $('[data-t]'), fill = $('[data-fill]'), hint = $('.dg__hint');
  if (!stage || !body || !vp || !canvas || steps.length !== N) return;

  const forced = /[?&]digital=3d(&|$)/.test(location.search);
  const live = !env.reduced && (!env.lite || forced);
  root.dataset.mode = live ? 'live' : 'static';

  /* ---------------- CBCT slices (cbct.js, loaded on its own; the window works without it) ---------------- */
  let cbct = null, lastDraw = -1, lastDrawT = 0;
  function drawPanes(p, force) {
    if (!cbct) return;
    const now = performance.now();
    if (!force && (Math.abs(p - lastDraw) < 0.003 || now - lastDrawT < 30)) return;
    lastDraw = p; lastDrawT = now;
    for (const pn of panes) cbct.drawCbct(pn.ctx, { view: pn.view, progress: p });
  }

  /* ---------------- window UI: everything that depends on the current step ---------------- */
  let step = -1;
  const stepTitles = links.map((a) => a.textContent.trim());
  function setStep(k) {
    const prev = step;
    step = k;
    root.dataset.step = String(k + 1);
    steps.forEach((s, i) => { s.classList.toggle('is-on', i === k); i === k ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current'); });
    tools.forEach((t) => t.el.classList.toggle('is-on', t.on.includes(k)));
    wizN.textContent = String(k + 1);
    wizT.textContent = stepTitles[k];
    fill.style.transform = `scaleX(${(k + 1) / N})`;
    if (prev >= 0 && !env.reduced) wizT.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    hint?.classList.toggle('is-on', k === 0 || k === N - 1); // "Drag to rotate": on the first and the last step, and for a few seconds on the first arrival (goLive)
    vp.classList.toggle('is-drag', live && !env.coarse && k === N - 1);
    for (const c of calls) if (k < c.from && c.vis) { c.vis = false; c.el.classList.remove('is-on'); }
  }

  async function renderStill() {
    const sc = await (await import('./digital/scene.js')).createScene(canvas, { reduced: true, lite: false, dpr: Math.min(devicePixelRatio || 1, 2) });
    const draw = () => { sc.resize(); sc.setProgress(1, true); sc.renderNow(); };
    draw();
    new ResizeObserver(draw).observe(vp);
    root.classList.add('is-still');
  }

  /* ---------------- static mode: finished state from the poster; nothing scrolls ---------------- */
  if (!live) {
    links.forEach((a) => a.replaceWith(...a.childNodes)); // plain headings: there is no scene to scroll to
    // no poster file yet (and not a low-power device): render ONE frame of the finished scene instead (no loop, nothing moves)
    const still = root.dataset.poster === '0' && !env.lite;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      loadCbct().then((m) => { cbct = m; drawPanes(1, true); });
      if (still) renderStill().catch((err) => console.warn('[digital] still frame unavailable', err));
    }, { rootMargin: '100% 0px' });
    io.observe(root);
    return;
  }

  // Live mode: the poster is only a fallback. Taking it out of the DOM keeps the browser from fetching, decoding and uploading a 1600 px image
  // at the very moment the scene starts (A/B on the arrival frame). It goes back in only if the reader gets here before the scene is ready,
  // or the scene cannot start.
  const pic = vp.querySelector('picture');
  const posterHtml = pic ? pic.outerHTML : '';
  pic?.remove();
  let posterIn = false;
  const showPoster = () => { if (!posterIn && posterHtml) { posterIn = true; vp.insertAdjacentHTML('afterbegin', posterHtml); } };

  /* ---------------- scroll → progress ---------------- */
  // Step i is "current" while its centre is near the line `anchor` (the window's middle on wide screens; the middle of the free area under
  // the sticky window on narrow ones). Zone k = from halfway between steps k-1 and k to halfway between k and k+1, so progress is N equal zones.
  const wide = matchMedia('(min-width: 1000px) and (pointer: fine)');
  let geo = null, target = 0, cur = 0;
  function measure() {
    const sy = scrollY;
    const h = stage.offsetHeight;
    const anchor = wide.matches ? parseFloat(getComputedStyle(stage).top) + h / 2 : h + (innerHeight - h) * 0.45;
    const a = steps.map((s) => { const r = s.getBoundingClientRect(); return r.top + sy + r.height / 2 - anchor; }); // scrollY with step i centred
    const b = [a[0] - (a[1] - a[0]) / 2];
    for (let i = 1; i < N; i++) b.push((a[i - 1] + a[i]) / 2);
    b.push(a[N - 1] + (a[N - 1] - a[N - 2]) / 2);
    const bt = body.getBoundingClientRect().top + sy;
    geo = { a, b, s0: bt, s1: bt + body.offsetHeight - h }; // s0..s1: scrollY range in which the sticky window is stuck
  }
  function progressAt(y) {
    const { b } = geo;
    if (y <= b[0]) return 0;
    if (y >= b[N]) return 1;
    let k = 0;
    while (y > b[k + 1]) k++;
    return (k + (y - b[k]) / (b[k + 1] - b[k])) / N;
  }
  // Stacked layout only: while the window is stuck at the top of the screen and the header is showing, CSS slides the window down by the header's height
  // (.dg.is-stuck), so the header never covers the title bar. Transform only: no layout, no layout shift.
  let stuck = false;
  const setStuck = (y) => { const s = !wide.matches && y >= geo.s0 && y <= geo.s1; if (s !== stuck) { stuck = s; root.classList.toggle('is-stuck', s); } };
  ScrollTrigger.create({ trigger: body, start: 'top bottom', end: 'bottom top', onUpdate: (self) => { if (geo) { target = progressAt(self.scroll()); setStuck(self.scroll()); } } });
  onRefresh(() => { measure(); target = progressAt(scrollY); setStuck(scrollY); });

  links.forEach((a, i) => a.addEventListener('click', (e) => {
    if (!geo) return; // not measured yet: the engine's own anchor handling takes it
    e.preventDefault();
    // not scrollToTarget(y): engine.js reads getComputedStyle(y) for a number and throws (reported to the orchestrator)
    if (lenis) lenis.scrollTo(geo.a[i]); else scrollTo({ top: geo.a[i], behavior: 'smooth' });
  }));

  /* ---------------- scene: built early and only in pauses, runs only while the window is on screen ---------------- */
  let scene = null, running = false, raf = 0, last = 0, vpW = vp.clientWidth, visible = false;
  window.__digital = { root, get scene() { return scene; }, get geo() { return geo; }, get progress() { return [cur, target]; } }; // read-only handle for the QA probes
  const tau = env.desktop ? 0.05 : 0.09; // smoothing time constant (s): light, because Lenis eases desktop scroll and the scene smooths p again (~0.14 s)

  /* ---- callouts: HTML labels pinned to 3D points. Side and above/below are decided with a dead band (no flip-flop from frame to frame) and moved with
     transform only (CSS), so a change of side is never a layout shift. ---- */
  const measureCalls = () => { for (const c of calls) { c.w = c.t.offsetWidth; c.h = c.t.offsetHeight; } };
  const shown = [];
  function placeCalls() {
    shown.length = 0;
    for (const c of calls) {
      if (step < c.from) continue;
      const r = scene.project(c.anchor); // shared result object: read it now
      const v = !!r.visible;
      if (v !== c.vis) { c.vis = v; c.el.classList.toggle('is-on', v); }
      if (!v) continue;
      const x = Math.round(r.x * 10) / 10, y = Math.round(r.y * 10) / 10;
      if (x !== c.x || y !== c.y) { c.x = x; c.y = y; c.el.style.transform = `translate3d(${x}px,${y}px,0)`; }
      // the label goes to the left of its dot when it would not fit on the right (on at 6 px short of the edge, off again only once 46 px of room are back);
      // data-side="l" labels prefer the left and go right only when the left has no room. Both have a dead band, so a drifting anchor cannot flip it every frame.
      const o = c.len * 0.7071, roomR = vpW - (x + o + c.w), roomL = x - o - c.w;
      const flip = c.left ? (c.flip ? roomL > -10 : roomL > 30) : (c.flip ? roomR < 46 : roomR < 6);
      if (flip !== c.flip) { c.flip = flip; c.el.classList.toggle('is-flip', flip); }
      shown.push(c);
    }
    // a label goes underneath its dot when it was asked to (data-below), when it would sit on top of another label (the lower anchor yields; enter at 30 px
    // apart, leave at 44), or when there is no room above it (the window's top edge cuts it off: enter at 4 px short, leave once 30 px of room are back)
    for (const c of shown) {
      const clash = (lim, lx) => shown.some((o) => o !== c && (o.y < c.y || (o.y === c.y && o.i < c.i)) && c.y - o.y < lim && Math.abs(o.x - c.x) < lx);
      const up = c.y - c.len * 0.7071 - c.h;
      const below = c.pref || (c.below ? clash(44, 170) || up < 30 : clash(30, 150) || up < 4);
      if (below !== c.below) { c.below = below; c.el.classList.toggle('is-below', below); }
    }
  }
  function tick(t) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (t - last) / 1000) || 0.016;
    last = t;
    if (scene) placeCalls(); // before setProgress: project() describes the frame that was just drawn
    if (cur !== target) {
      cur = Math.abs(target - cur) < 4e-4 ? target : cur + (target - cur) * (1 - Math.exp(-dt / tau));
      scene?.setProgress(cur);
    }
    const k = Math.min(N - 1, Math.floor(cur * N));
    if (k !== step) setStep(k);
    drawPanes(cur, cur === target && lastDraw !== cur); // settled: one last exact draw, then nothing until it moves again
  }
  // First arrival: say that the model can be turned (fine pointers only; CSS hides the hint on touch). The last step keeps it on for good.
  let hinted = false;
  const showHint = () => {
    if (hinted || !hint || env.coarse) return;
    hinted = true; hint.classList.add('is-intro');
    const off = () => hint.classList.remove('is-intro');
    setTimeout(off, 5000); vp.addEventListener('pointerdown', off, { once: true });
  };
  const goLive = () => requestAnimationFrame(() => requestAnimationFrame(() => { root.classList.add('is-live'); showHint(); })); // after the first frame is on screen
  function sync() {
    const run = visible && !document.hidden;
    if (run === running) return;
    running = run;
    if (run) {
      cur = target; // arriving: no replay of the progress that happened while it was off screen
      scene?.setProgress(cur, true);
      if (scene) { scene.start(); goLive(); } else showPoster();
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
      scene?.stop();
    }
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { rootMargin: '60px 0px' }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  new ResizeObserver(() => { vpW = vp.clientWidth; measureCalls(); scene?.resize(); }).observe(vp);
  document.fonts?.ready.then(measureCalls);
  measureCalls();
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
  canvas.addEventListener('webglcontextrestored', () => root.classList.add('is-live'));

  setStep(0); // the server markup is the finished state (step 6/6)

  /* ---------------- scene build: early, in pauses, one small step at a time ----------------
     What the main thread pays (measured, d2/v1/v2): each new material compiles its shader on first use (0.1-0.8 s on a cold GPU shader cache), the environment
     map ~0.9 s, createScene ~0.6 s. None of that may land inside a reader's scroll, so:
       1. the build starts by itself ~1 s after load (first idle slice), while the hero is still, long before anyone gets to #digital;
       2. every step of it (the CBCT bake, each module, each createScene phase via opts.gate, each warm-up render) first waits for a real pause: no wheel, touch,
          key or scroll event for PAUSE ms (Lenis keeps emitting scroll for ~1 s after the last notch, so "no scroll event for 400 ms" is not a pause);
       3. a reader who gets here first sees the poster (sync -> showPoster); the build carries on at their first pause and the scene fades in when it is done. */
  const PAUSE = 1000;
  let lastInput = -1e9;
  const stamp = () => { lastInput = performance.now(); };
  for (const t of ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown', 'scroll']) addEventListener(t, stamp, { passive: true, capture: true });
  const pause = (ms = PAUSE) => new Promise((resolve) => {
    const check = () => {
      const left = ms - (performance.now() - lastInput);
      if (!document.hidden && left <= 0) resolve(); else setTimeout(check, document.hidden ? 500 : Math.max(50, left));
    };
    check();
  });
  const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 500 }) : setTimeout(r, 30)));
  const gate = async () => { await pause(); await idle(); }; // also what createScene awaits between its phases

  // createScene resolves with the scene built, compiled and drawn once at every step (scene.js builds in a worker; its main-thread fallback builds in slices
  // and awaits opts.gate between them). Handles that still need a warm-up (sc.warm) get one step per pause.
  async function warm(sc) { if (typeof sc.warm === 'function') await sc.warm({ gate }); }

  async function load() {
    performance.mark('dg:near'); // QA: start of the build
    await gate();
    const cb = await loadCbct();
    if (cb) { // first bake, one pane per task (each ~30-60 ms; all three together were a ~90 ms hitch)
      for (const pn of panes) { await gate(); cb.drawCbct(pn.ctx, { view: pn.view, progress: cur }); }
      cbct = cb; lastDraw = cur; lastDrawT = performance.now();
    }
    await gate(); const { createScene } = await import('./digital/scene.js'); // the page-side handle only: three.js lives in a worker (scene.worker.js)
    performance.mark('dg:modules');
    await gate();
    const sc = await createScene(canvas, { reduced: false, lite: env.lite, dpr: Math.min(devicePixelRatio || 1, 2), coarse: env.coarse, gate });
    performance.mark('dg:created'); // QA: performance.measure('c', 'dg:modules', 'dg:created') = createScene() alone
    sc.resize();
    sc.setProgress(cur, true);
    await warm(sc);
    scene = sc; // only now: sync() and tick() never touch a scene that is still being walked through
    performance.mark('dg:ready');
    root.dataset.ready = '1';
    if (running) { sc.setProgress(cur, true); sc.start(); goLive(); }
  }
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    load().catch((err) => {
      console.warn('[digital] 3D scene unavailable, showing the poster', err);
      root.classList.remove('is-live');
      showPoster();
    });
  };
  const boot = () => setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 1500 }) : go()), 1000);
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot, { once: true });
});
