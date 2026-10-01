/*
  Motion engine: GSAP 3.15 (ScrollTrigger, SplitText, DrawSVG) + Lenis. Single page, no router. Frozen: only the orchestrator edits it.
  Pared down from the author's earlier GSAP + Lenis engine (no tilt / magnetic / glow / MotionPath / loader / View Transitions).

  ── Declarative attributes (any section; the engine finds them, nothing to import) ─────────────────────────────────────
    [data-reveal="up|fade|clip|blur"] [data-delay=".2"] [data-start="top 80%"]
        up = rise 40 px + fade · fade = opacity · clip = clip-path wipe, top to bottom (portraits, photos) · blur = rise + 8 px
        blur-in (the one reveal that animates `filter`; use sparingly). Plays once when it enters the viewport.
    [data-stagger=".08"]            direct children enter in sequence (rise 28 px + fade), once
    [data-split="lines|words"] [data-delay]   SplitText entrance (mask rise) once; the split is reverted when it ends, so text reflows
                                    normally afterwards. Use on headings.
    [data-lit]                      words go from 22 % to 100 % opacity as it scrolls through the viewport (scrubbed). Manifesto only.
    [data-parallax="0.15"]          desktop only: vertical drift of ±(value × 50) % of the element's own height while its parent is in
                                    view. Put it on an element taller than its frame: frame {position:relative; overflow:hidden},
                                    child {position:absolute; inset:-15% 0} (enough for values ≤ 0.2). Don't use margin %: it is width-based.
    [data-draw] / [data-draw="scrub"]   DrawSVG on every path/line/polyline/polygon/circle/rect/ellipse inside (the element itself may be
                                    the <svg>). Once on enter, or scrubbed. Shapes must be stroked (stroke + fill:none).
    [data-count="500"] [data-prefix="$"] [data-suffix="+"] [data-decimals="1"]   count-up once in view (en-US formatting)
    Pre-hiding lives in base.css and only applies under html.js (failsafe: everything shows after 4 s if the engine never boots).
    Don't combine data-reveal / data-parallax on the same element (both write transform).

  ── Sections with their own logic: register from the component <script> ────────────────────────────────────────────────
    import { onPage } from '../../scripts/engine.js';
    onPage(({ gsap, ScrollTrigger, SplitText, DrawSVGPlugin, env, lenis, emit, scrollToTarget, onRefresh }) => {
      const root = document.querySelector('#about'); if (!root) return;   // always bail out when the root is absent
      ...tweens / ScrollTriggers (they live in the engine's gsap.context)...
      return () => { ... };   // optional cleanup; today it is NOT called (see "Mode changes"), keep listeners scoped to `root`
    });
    The callback runs once, at DOMContentLoaded, after every section module has registered. A module that registers later runs at once.
    `lenis` is the Lenis instance (desktop only) or null. `emit(name, detail)` fires a CustomEvent on document; names start with `vd:`.
    `onRefresh(fn)` runs fn after every ScrollTrigger refresh (re-measure pin lengths, etc.).

  ── Gates ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
    env.reduced = (prefers-reduced-motion: reduce) OR html.calm (footer "Reduce motion" switch, persisted in localStorage 'vd-calm')
    env.desktop = (min-width:768px) and (pointer:fine) and !reduced  → also html.is-desktop-fx.  Lenis, pins, parallax: only here.
    env.coarse  = (pointer:coarse)          env.lite = low-power guess (≤4 cores and ≤4 GB, or Save-Data) → html.is-lite
    Lenis starts only when env.desktop. The only pinned scene allowed is Recipe, and only when env.desktop.
    Mode changes: env is constant during a page's life. When the viewport crosses 768 px / pointer type, the OS reduced-motion setting flips,
    or 'vd:calm' fires, the engine saves the scroll position (section id + fraction), reloads, and restores it. So sections only
    ever code for ONE mode at init time (no resize/mode re-init logic needed).

  ── Exports ────────────────────────────────────────────────────────────────────────────────────────────────────────────
    onPage(fn) · env · scrollToTarget(el|selector|y, {offset, immediate}) → Lenis if active, else smooth window scroll (auto with reduced);
    default landing = html scroll-padding-top (header + 16 px) + the target's scroll-margin-top, like a native #hash jump (page sections get -(header + 16 px) in base.css, so they land flush under the header) · setCalm(on) → toggles html.calm, persists it and emits 'vd:calm' (the footer switch calls this)
    · emit · onRefresh · getLenis()
  In-page links (<a href="#id">) are intercepted and routed through scrollToTarget with the header offset.
  Events (fired on document, they bubble to window): 'vd:ready' (engine booted) · 'vd:calm' {on}.
*/
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);
ScrollTrigger.config({ ignoreMobileResize: true });

const root = document.documentElement;
const mqWide = window.matchMedia('(min-width: 768px) and (pointer: fine)');
const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const mqCoarse = window.matchMedia('(pointer: coarse)');
const nav = navigator;
const lite = (nav.hardwareConcurrency || 8) <= 4 && (nav.deviceMemory || 8) <= 4 || !!nav.connection?.saveData;

export const env = {
  get reduced() { return mqReduced.matches || root.classList.contains('calm'); },
  get desktop() { return mqWide.matches && !this.reduced; },
  get coarse() { return mqCoarse.matches; },
  lite,
};

// Pinned scenes must not initialise mid-scroll after a reload: scroll is restored by hand (restore()).
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

let lenis = null;
let ctx = null;
let booted = false;
const registry = [];

export const getLenis = () => lenis;
export const onRefresh = (fn) => ScrollTrigger.addEventListener('refresh', fn);
export const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true })); // bubbles: window listeners hear it too
export function setCalm(on) {
  saveScroll(); // before the class flips the layout (Services strips, pins): the reload then puts the reader back where they were
  root.classList.toggle('calm', on);
  try { on ? localStorage.setItem('vd-calm', '1') : localStorage.removeItem('vd-calm'); } catch (e) { /* storage blocked */ }
  emit('vd:calm', { on });
}
export function scrollToTarget(target, opts = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  const isY = typeof target === 'number';
  if (!el && !isY) return;
  // Default landing = html scroll-padding-top + the target's scroll-margin-top, same as a native #hash jump (page sections cancel the padding in
  // base.css and land flush, so the header takes their theme). Lenis already subtracts both itself.
  const gap = (parseFloat(getComputedStyle(root).scrollPaddingTop) || 0) + (el ? parseFloat(getComputedStyle(el).scrollMarginTop) || 0 : 0);
  const offset = opts.offset ?? (lenis ? 0 : -gap);
  const immediate = opts.immediate || env.reduced;
  if (lenis) return lenis.scrollTo(isY ? target : el, { offset: isY ? 0 : offset, immediate });
  const y = isY ? target : el.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top: Math.max(0, y), behavior: immediate ? 'auto' : 'smooth' });
}

const fontsReady = () => Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 900))]);
const api = () => ({ gsap, ScrollTrigger, SplitText, DrawSVGPlugin, env, lenis, emit, scrollToTarget, onRefresh });

/** Register a section initialiser (see header). Return value (cleanup) is optional. */
export function onPage(fn) {
  registry.push(fn);
  if (booted) runInit(fn); // module evaluated after boot
}
function runInit(fn) {
  try { ctx.add(() => { fn(api()); }); } catch (e) { console.error('[engine] section init failed', e); }
  queueRefresh();
}
let refreshQueued = false;
function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => { refreshQueued = false; ScrollTrigger.sort(); ScrollTrigger.refresh(); });
}

/* ---------------- Lenis (desktop gate only) ---------------- */
function startLenis() {
  if (!env.desktop) return;
  lenis = new Lenis({ lerp: 0.12, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
// in-page anchors go through scrollToTarget (Lenis / smooth scroll with the header offset)
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href*="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const url = new URL(a.href, location.href);
  if (url.pathname !== location.pathname || !url.hash || a.target === '_blank') return;
  const el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if (!el) return;
  e.preventDefault();
  scrollToTarget(el);
  history.replaceState(history.state, '', url.hash);
});

/* ---------------- Reveals ---------------- */
const REVEALS = {
  up: [{ y: 40, opacity: 0 }, {}],
  fade: [{ opacity: 0 }, {}],
  blur: [{ y: 24, opacity: 0, filter: 'blur(8px)' }, { filter: 'blur(0px)' }],
  clip: [{ clipPath: 'inset(0 0 100% 0)', opacity: 1 }, { clipPath: 'inset(0 0 0% 0)', duration: 1.3, ease: 'expo.inOut' }],
};
function initReveals() {
  gsap.utils.toArray('[data-reveal]').forEach((el) => {
    if (env.reduced) { gsap.set(el, { opacity: 1 }); return; }
    const [from, to] = REVEALS[el.dataset.reveal] || REVEALS.up;
    // opacity is never cleared: the pre-hide rule in base.css would hide the element again
    gsap.fromTo(el, from, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', delay: +(el.dataset.delay || 0), clearProps: 'transform,filter,clipPath', ...to,
      scrollTrigger: { trigger: el, start: el.dataset.start || 'top 88%', once: true, onEnter: () => el.classList.add('is-inview') } });
  });
  gsap.utils.toArray('[data-stagger]').forEach((group) => {
    const kids = [...group.children];
    if (env.reduced || !kids.length) { gsap.set(kids, { opacity: 1 }); return; }
    gsap.fromTo(kids, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: +group.dataset.stagger || 0.08, clearProps: 'transform',
      scrollTrigger: { trigger: group, start: group.dataset.start || 'top 85%', once: true } });
  });
}

/* ---------------- Text (after fonts, so line breaks are final) ---------------- */
function initSplits() {
  gsap.utils.toArray('[data-split]').forEach((el) => {
    el.style.visibility = 'visible';
    if (env.reduced) return;
    const words = el.dataset.split === 'words';
    const split = SplitText.create(el, { type: words ? 'words' : 'lines', mask: words ? 'words' : 'lines', linesClass: 'split-line', wordsClass: 'split-word' });
    gsap.from(words ? split.words : split.lines, { yPercent: 110, duration: 1, ease: 'expo.out', stagger: words ? 0.05 : 0.1, delay: +(el.dataset.delay || 0),
      scrollTrigger: { trigger: el, start: el.dataset.start || 'top 90%', once: true, onEnter: () => el.classList.add('is-inview') },
      onComplete: () => split.revert() }); // back to plain text: reflows on resize, no leftover wrappers
  });
}
function initLit() {
  gsap.utils.toArray('[data-lit]').forEach((el) => {
    el.style.visibility = 'visible';
    if (env.reduced) return;
    const split = SplitText.create(el, { type: 'words', wordsClass: 'lit-word' });
    gsap.fromTo(split.words, { opacity: 0.22 }, { opacity: 1, stagger: 0.05, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true } });
  });
}

/* ---------------- Parallax (desktop gate only) ---------------- */
function initParallax() {
  if (!env.desktop) return;
  gsap.utils.toArray('[data-parallax]').forEach((el) => {
    const amt = parseFloat(el.dataset.parallax) || 0.15;
    gsap.fromTo(el, { yPercent: amt * 50 }, { yPercent: -amt * 50, ease: 'none', scrollTrigger: { trigger: el.parentElement || el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

/* ---------------- Counters ---------------- */
function initCounters() {
  gsap.utils.toArray('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const dec = +(el.dataset.decimals || 0);
    const fmt = (v) => `${el.dataset.prefix || ''}${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${el.dataset.suffix || ''}`;
    if (env.reduced) { el.textContent = fmt(target); return; }
    el.textContent = fmt(0);
    const obj = { v: 0 };
    gsap.to(obj, { v: target, duration: 2, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true }, onUpdate: () => { el.textContent = fmt(obj.v); } });
  });
}

/* ---------------- SVG drawing ---------------- */
function initDraw() {
  gsap.utils.toArray('[data-draw]').forEach((el) => {
    const shapes = el.querySelectorAll('path, line, polyline, polygon, circle, rect, ellipse');
    gsap.set(el, { opacity: 1 }); // base.css pre-hides [data-draw] so the strokes never flash fully drawn
    if (!shapes.length || env.reduced) return;
    const scrub = el.dataset.draw === 'scrub';
    gsap.fromTo(shapes, { drawSVG: '0%' }, { drawSVG: '100%', stagger: 0.08, ...(scrub ? { ease: 'none' } : { duration: 1.2, ease: 'power2.inOut', delay: +(el.dataset.delay || 0) }),
      scrollTrigger: scrub ? { trigger: el, start: 'top 80%', end: 'bottom 60%', scrub: true } : { trigger: el, start: 'top 88%', once: true } });
  });
}

/* ---------------- Offscreen sections: pause their CSS animations ---------------- */
function initOffscreen() {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.toggleAttribute('data-offscreen', !e.isIntersecting)), { rootMargin: '100% 0px' });
  document.querySelectorAll('main > section, body > footer').forEach((s) => io.observe(s));
}

/* ---------------- Scroll restore across the mode reload / #hash ---------------- */
const KEY = 'vd-restore';
function saveScroll() {
  try {
    const secs = [...document.querySelectorAll('main > section[id]')];
    const cur = secs.filter((s) => s.getBoundingClientRect().top <= 1).pop();
    if (cur) sessionStorage.setItem(KEY, JSON.stringify({ id: cur.id, f: -cur.getBoundingClientRect().top / cur.offsetHeight }));
  } catch (e) { /* storage blocked: the page just reloads at the top */ }
}
function restore() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  const sec = saved && document.getElementById(saved.id);
  const hashEl = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  let place = sec ? () => {
    const y = sec.getBoundingClientRect().top + window.scrollY + saved.f * sec.offsetHeight;
    window.scrollTo(0, y); lenis?.scrollTo(y, { immediate: true, force: true });
  } : hashEl ? () => scrollToTarget(hashEl, { immediate: true }) : null;
  if (!place) return;
  place();
  // pins, images and the font swap move things below them: re-aim on every height change until the reader touches the page (max 4 s)
  const ro = new ResizeObserver(() => place?.());
  ro.observe(document.body);
  const stop = () => { place = null; ro.disconnect(); };
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => addEventListener(ev, stop, { once: true, passive: true }));
  setTimeout(stop, 4000);
}

/* ---------------- Boot ---------------- */
function boot() {
  if (booted) return;
  booted = true;
  startLenis();
  root.classList.toggle('is-desktop-fx', env.desktop);
  root.classList.toggle('is-lite', env.lite);
  ctx = gsap.context(() => {});
  registry.forEach(runInit); // sections first (they create the pin), then the declarative built-ins; sort() fixes creation order
  ctx.add(() => { initReveals(); initParallax(); initCounters(); initDraw(); });
  initOffscreen();
  fontsReady().then(() => {
    try { ctx.add(() => { initSplits(); initLit(); }); }
    finally { document.querySelectorAll('[data-split], [data-lit]').forEach((el) => { el.style.visibility = 'visible'; }); queueRefresh(); }
  });
  root.classList.add('fx-booted');
  requestAnimationFrame(() => { ScrollTrigger.refresh(); restore(); emit('vd:ready'); });
}

// All section modules are deferred: they have registered by DOMContentLoaded.
if (document.readyState === 'complete') boot(); else document.addEventListener('DOMContentLoaded', boot, { once: true });

// Mode changes (breakpoint / pointer / OS reduced-motion / footer switch): reload and put the reader back where they were.
let rt;
const reflow = (save = true) => { clearTimeout(rt); rt = setTimeout(() => { if (save) saveScroll(); location.reload(); }, 200); };
mqWide.addEventListener('change', () => reflow());
mqReduced.addEventListener('change', () => reflow());
window.addEventListener('vd:calm', () => reflow(false)); // setCalm() emits on document (it bubbles up to window) and has already saved the scroll
