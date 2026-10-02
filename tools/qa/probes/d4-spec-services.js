/*
  #services index. env.desktop only (wide + fine pointer + motion allowed). The photo of the active row sits in a preview that is ANCHORED
  (position: sticky) in the empty lane at the right of the list: it never chases the pointer. The active row is the last one chosen by
    pointer  → the row under a real pointermove (ignored for 160 ms after a scroll, so hand jitter does not fight the wheel)
    scroll   → the row crossing the reading line (vertical centre of the viewport), measured with layout offsets (no hit-testing)
    keyboard → the focused row (:focus-visible only); while it keeps focus, scroll does not override it
  Row change → the new photo wipes in over the old one (clip-path, up or down with the direction of travel). A wipe never restarts or
  snaps another one: finished slides are hidden, so at most 3 layers exist. Other modes get static thumbnails from CSS and run nothing here.
  (d4 reference implementation, validated by tools/qa/probes/d4-spec-run.mjs; to be ported to src/scripts/services.js)
*/
import { onPage } from './engine.js';

onPage(({ gsap, env }) => {
  const root = document.querySelector('#services');
  if (!root || !env.desktop) return;
  const list = root.querySelector('.svc__list');
  const panel = root.querySelector('.svc__panel');
  if (!list || !panel) return;
  const rows = [...list.children];
  const slides = [...panel.querySelectorAll('.svc__slide')];
  const capN = panel.querySelector('[data-cap-n]');
  const capT = panel.querySelector('[data-cap-t]');
  const titles = rows.map((r) => r.querySelector('.svc__title').textContent.trim());
  const two = (n) => String(n + 1).padStart(2, '0');
  const WIPE = { duration: 0.5, ease: 'expo.out' }; // ease OUT: the photo starts moving at once (in-out waited ~170 ms before showing 10 %)

  // rows with no link of their own become focusable so the keyboard can reach the preview too
  rows.forEach((r) => { if (!r.querySelector('a')) r.tabIndex = 0; });

  // load the photos only when the list is about to be seen (slides are display:none until then)
  new IntersectionObserver((entries, io) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    panel.querySelectorAll('video[data-poster]').forEach((v) => { v.poster = v.dataset.poster; });
    panel.classList.add('is-warm');
  }, { rootMargin: '600px 0px' }).observe(list);

  // row tops from LAYOUT offsets, not getBoundingClientRect: a row mid-reveal carries a translateY that would skew them
  let tops = [];
  const measure = () => { tops = rows.map((r) => r.offsetTop); };
  new ResizeObserver(measure).observe(list);
  measure();

  let shown = -1, z = 1, focused = -1, lastScroll = 0;
  const live = new Set(); // slides that are visible: the one on top, plus whatever still shows beneath a running wipe

  function select(i) {
    if (i === shown || i < 0) return;
    const prev = shown;
    shown = i;
    rows.forEach((r, k) => r.classList.toggle('is-active', k === i));
    list.classList.add('is-active');
    capN.textContent = two(i);
    capT.textContent = titles[i];
    const s = slides[i];
    s.style.zIndex = ++z;
    if (prev < 0) { // first paint: the photo is simply there, no wipe
      gsap.set(s, { visibility: 'visible', clipPath: 'inset(0% 0% 0% 0%)' });
      live.add(i);
    } else if (!live.has(i)) { // hidden slide: wipe it in from the side the new row lies on
      live.add(i);
      gsap.fromTo(s, { visibility: 'visible', clipPath: i > prev ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', ...WIPE,
        onComplete: () => slides.forEach((o, k) => { if (k !== i && live.has(k) && +o.style.zIndex < +s.style.zIndex) { live.delete(k); gsap.set(o, { visibility: 'hidden' }); } }),
      });
      const img = s.querySelector('img');
      if (img) gsap.fromTo(img, { scale: 1.12 }, { scale: 1, duration: 0.9, ease: 'expo.out', overwrite: true });
    } // else: already visible (wiping in, or open beneath the stack): raising its z-index is enough
    slides.forEach((sl, k) => { const v = sl.querySelector('video'); if (v) (k === i && !env.lite ? v.play().catch(() => {}) : v.pause()); });
  }

  const rowOf = (el) => rows.indexOf(el?.closest?.('.svc__row'));

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || performance.now() - lastScroll < 160) return;
    focused = -1; // the mouse takes over from the keyboard
    const i = rowOf(e.target);
    if (i >= 0) select(i);
  }, { passive: true });

  let raf = 0;
  const byScroll = () => {
    raf = 0;
    if (focused >= 0) return;
    const top = list.getBoundingClientRect().top;
    if (top > innerHeight || top + list.offsetHeight < 0) return; // list off screen: nothing to follow
    const y = innerHeight * 0.5 - top; // reading line in list coordinates
    let i = 0;
    while (i + 1 < tops.length && tops[i + 1] <= y) i++;
    select(i);
  };
  addEventListener('scroll', () => { lastScroll = performance.now(); if (!raf) raf = requestAnimationFrame(byScroll); }, { passive: true });

  list.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { focused = rowOf(e.target); select(focused); } });
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) focused = -1; });

  select(0); // there is always a photo: row 01 until the reader picks another
  byScroll();
});
