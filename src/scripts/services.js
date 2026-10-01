/*
  #services index. env.desktop only (wide + fine pointer + motion allowed): hovering or focusing a row shows its photo in a panel that
  trails the pointer inside the empty lane at the right of the list. Other modes get static thumbnails from CSS and run nothing here.
    pointer  → panel y follows the pointer, x drifts across the lane with the pointer's position over the list (gsap.quickTo)
    keyboard → panel anchors beside the focused row (only for :focus-visible focus, so a mouse click does not leave a ghost)
    row change → the new photo wipes in over the old one (clip-path), up or down depending on the direction of travel
*/
import { onPage } from './engine.js';

onPage(({ gsap, env }) => {
  const root = document.querySelector('#services');
  if (!root || !env.desktop) return;
  const list = root.querySelector('.svc__list');
  const lane = root.querySelector('.svc__lane');
  const panel = root.querySelector('.svc__panel');
  if (!list || !lane || !panel) return;
  const rows = [...list.children];
  const slides = [...panel.children];
  const clamp = gsap.utils.clamp;
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;

  // geometry that only changes with the layout: panel size and the horizontal range it travels in
  let minX = 0, maxX = 0, left = 0, width = 1, h = 0;
  const measure = () => {
    const L = list.getBoundingClientRect(), A = lane.getBoundingClientRect(), w = panel.offsetWidth;
    h = panel.offsetHeight; left = L.left; width = L.width || 1;
    minX = A.left - 16; maxX = Math.max(minX, A.right + 16 - w);
  };
  new ResizeObserver(measure).observe(list);
  addEventListener('resize', measure);
  measure();

  // rows with no link of their own become focusable so the keyboard can reach the panel too
  rows.forEach((r) => { if (!r.querySelector('a')) r.tabIndex = 0; });

  // load the photos only when the list is about to be seen (slides are display:none until then)
  new IntersectionObserver((entries, io) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    panel.querySelectorAll('video[data-poster]').forEach((v) => { v.poster = v.dataset.poster; });
    panel.classList.add('is-warm');
    measure();
  }, { rootMargin: '600px 0px' }).observe(list);

  gsap.set(panel, { x: 0, y: 0, scale: 0.94, opacity: 0 });
  const xTo = gsap.quickTo(panel, 'x', { duration: 0.9, ease: 'power3.out' });
  const yTo = gsap.quickTo(panel, 'y', { duration: 0.9, ease: 'power3.out' });

  const ptr = { has: false, x: 0, y: 0, row: -1 }; // last pointer position (viewport px) and the row under it, -1 off the list
  let focused = -1, shown = -1, visible = false, z = 1;
  const rowOf = (el) => rows.indexOf(el?.closest?.('.svc__row'));

  // where the panel should be, and for which row: the pointer wins while it is over the list, else the focused row
  function aim() {
    const i = ptr.row >= 0 ? ptr.row : focused;
    if (i < 0) return null;
    let x, y;
    if (ptr.row >= 0) {
      x = minX + (maxX - minX) * clamp(0, 1, (ptr.x - left) / width);
      y = ptr.y - h / 2;
    } else {
      // layout offsets, not getBoundingClientRect: a row mid-reveal carries a transform that would skew the anchor
      x = (minX + maxX) / 2;
      y = list.getBoundingClientRect().top + rows[i].offsetTop - list.offsetTop + rows[i].offsetHeight / 2 - h / 2;
    }
    const top = header + 12;
    return { i, x, y: clamp(top, Math.max(top, innerHeight - h - 12), y) };
  }

  function show(i) {
    const first = !visible;
    if (!first && i === shown) return;
    const from = first ? -1 : shown;
    shown = i;
    rows.forEach((r, k) => r.classList.toggle('is-active', k === i));
    list.classList.add('is-active');
    const s = slides[i], img = s.querySelector('img');
    gsap.killTweensOf(s.children);
    gsap.killTweensOf(s);
    s.style.zIndex = ++z;
    if (from < 0) gsap.set(s, { clipPath: 'inset(0% 0% 0% 0%)' });
    else {
      gsap.fromTo(s, { clipPath: i > from ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'expo.inOut' });
      if (img) gsap.fromTo(img, { scale: 1.16 }, { scale: 1, duration: 1.4, ease: 'expo.out' });
    }
    slides.forEach((sl, k) => { const v = sl.querySelector('video'); if (v) (k === i && !env.lite ? v.play().catch(() => {}) : v.pause()); });
    if (first) { visible = true; gsap.to(panel, { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out', overwrite: 'auto' }); }
  }

  function hide() {
    if (!visible) return;
    visible = false;
    list.classList.remove('is-active');
    rows.forEach((r) => r.classList.remove('is-active'));
    panel.querySelectorAll('video').forEach((v) => v.pause());
    gsap.to(panel, { opacity: 0, scale: 0.96, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
  }

  function sync() {
    const a = aim();
    if (!a) return hide();
    if (visible) { xTo(a.x); yTo(a.y); } else { xTo(a.x, a.x); yTo(a.y, a.y); } // first show: appear in place (start = end), do not fly in from the corner
    show(a.i);
  }

  // the pointer is tracked page-wide so a wheel scroll that slides the list under a still pointer also picks up a row
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    ptr.has = true; ptr.x = e.clientX; ptr.y = e.clientY;
    if (list.contains(e.target)) { ptr.row = rowOf(e.target); sync(); }
  }, { passive: true });
  list.addEventListener('pointerleave', () => { ptr.row = -1; sync(); });
  document.addEventListener('mouseleave', () => { ptr.has = false; ptr.row = -1; sync(); }); // pointer left the window

  list.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { focused = rowOf(e.target); sync(); } });
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) { focused = -1; sync(); } });

  // Lenis / wheel scroll moves rows under a still pointer: re-pick the row and keep the panel with it (only while the list is on screen)
  let near = false, raf = 0;
  new IntersectionObserver(([e]) => { near = e.isIntersecting; if (!near) { ptr.row = -1; sync(); } }).observe(list);
  addEventListener('scroll', () => {
    if (raf || !near || !(ptr.has || focused >= 0)) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (ptr.has) ptr.row = rowOf(document.elementFromPoint(ptr.x, ptr.y));
      sync();
    });
  }, { passive: true });
});
