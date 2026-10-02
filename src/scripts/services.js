/*
  #services index. env.desktop only (wide + fine pointer + motion allowed). The photo of the active row sits in a preview that is ANCHORED
  (position: sticky, pure CSS) in the empty lane at the right of the list: it never chases the pointer, so there is nothing to track per frame.
  The active row is the last one chosen by
    pointer  → the row under a REAL pointermove (moved by ≥ 1 px, and ignored for 160 ms after a scroll, so the synthetic move Chrome sends
               under a parked pointer and hand jitter do not fight the wheel)
    scroll   → the row crossing the reading line (vertical middle of the viewport). One IntersectionObserver with a zero-height band at the
               middle: no scroll handler, no getBoundingClientRect, no hit-testing, and it needs no ScrollTrigger.refresh (policy P2)
    keyboard → the focused row (:focus-visible only); while it keeps focus, scroll does not override it
  Row change → the new photo wipes in over the old one (clip-path, up or down with the direction of travel). A wipe never restarts or
  snaps another one: finished slides are hidden, so at most 3 layers exist. Other modes get static thumbnails from CSS and run nothing here.
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
  const lane = root.querySelector('.svc__lane');
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
    panel.querySelectorAll('img').forEach((im) => { im.loading = 'eager'; }); // stacked in one box: lazy would wait until the lane is on screen
    panel.classList.add('is-warm');
  }, { rootMargin: '600px 0px' }).observe(list);

  let shown = -1, z = 1, focused = -1, lastScroll = 0, onScreen = false;
  const live = new Set(); // slides that are visible: the one on top, plus whatever still shows beneath a running wipe
  let wiping = 0;
  const settle = () => { // no wipe running: only the photo shown stays visible (also cleans a slide that was raised back over a finished one)
    if (wiping) return;
    live.forEach((k) => { if (k !== shown) { live.delete(k); gsap.set(slides[k], { visibility: 'hidden' }); } });
  };

  // the loop video plays only while it is the photo shown AND the list is on screen
  const playing = () => slides.forEach((sl, k) => { const v = sl.querySelector('video'); if (v) (k === shown && onScreen && !env.lite ? v.play().catch(() => {}) : v.pause()); });
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; playing(); }).observe(list);

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
      wiping++;
      gsap.fromTo(s, { visibility: 'visible', clipPath: i > prev ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', ...WIPE,
        onComplete: () => { // fully open: whatever lies beneath it is covered, hide it now (keeps chained wipes at 2-3 layers)
          wiping--;
          slides.forEach((o, k) => { if (k !== i && live.has(k) && +o.style.zIndex < +s.style.zIndex) { live.delete(k); gsap.set(o, { visibility: 'hidden' }); } });
          settle();
        },
      });
      const img = s.querySelector('img');
      if (img) gsap.fromTo(img, { scale: 1.12 }, { scale: 1, duration: 0.9, ease: 'expo.out', overwrite: true });
    } else settle(); // already visible (wiping in, or open beneath the stack): raising its z-index is enough
    playing();
  }

  const rowOf = (el) => rows.indexOf(el?.closest?.('.svc__row'));

  // The lane (right column) is only the preview's track: the row "under" a pointer there is just whichever row the photo lies over.
  // Moving onto the photo (or the empty lane) must keep the current photo, so only the text side of a row selects it.
  let px = -1, py = -1, laneL = -1;
  addEventListener('resize', () => { laneL = -1; }, { passive: true });
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const moved = Math.abs(e.clientX - px) >= 1 || Math.abs(e.clientY - py) >= 1;
    px = e.clientX; py = e.clientY;
    if (!moved || e.timeStamp - lastScroll < 160) return;
    if (laneL < 0) laneL = lane.getBoundingClientRect().left; // measured once per resize, not per move
    if (e.clientX >= laneL) return;
    focused = -1; // the mouse takes over from the keyboard
    const i = rowOf(e.target);
    if (i >= 0) select(i);
  }, { passive: true });
  addEventListener('scroll', (e) => { lastScroll = e.timeStamp; }, { passive: true }); // a timestamp, nothing else

  // reading line: a row is "current" while it crosses the vertical middle of the viewport
  const reading = new IntersectionObserver((entries) => {
    if (focused >= 0) return;
    for (const e of entries) if (e.isIntersecting) select(rows.indexOf(e.target));
  }, { rootMargin: '-50% 0px -50% 0px' });
  rows.forEach((r) => reading.observe(r));

  list.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { focused = rowOf(e.target); select(focused); } });
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) focused = -1; });

  select(0); // there is always a photo: row 01 until the reader picks another
});
