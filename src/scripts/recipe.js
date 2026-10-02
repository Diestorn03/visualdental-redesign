/*
  #process · The Recipe (components/sections/Recipe.astro). The only pinned scene of the site.
  Desktop gate (env.desktop, and a viewport tall enough for the scene): .rc__stage is pinned for +250 % of the viewport and one scrubbed
  timeline plays on top of it:
    · photos: each next photo wipes in (before | after) while a hairline seam rides the edge; the new photo settles from 1.12 to 1
    · copy: the outgoing step fades up, the incoming one rises in (STEP 0N, name, text; RESULT adds the turnaround note)
    · progress 01 · 02 · 03 · R: a bar fills as each step is reached
    · STEP 02: the wireframe over the CAD arch is drawn with DrawSVG once the photo is in
  Everything else (touch, mobile, reduced, no JS) keeps the plain list; the engine's data-reveal / data-draw do the entrances there.
  Cost per scrubbed frame: transform and opacity only, on elements that own a compositor layer (will-change in Recipe.astro), so scrolling inside the
  pin repaints nothing but the wireframe strokes (own layer). The wipe is a curtain: .rc__frame (overflow hidden, clipped by .rc__fig) slides in
  from the right while .rc__in (its photo) slides the other way by the same amount, so the photo stays still and only the edge moves; same picture
  as clip-path: inset(0 0 0 p %), without re-rasterising the photo on every frame. The pin length never changes after load (P1) and nothing here
  calls ScrollTrigger.refresh (P2): the engine measures after fonts / load and invalidateOnRefresh re-reads the viewport-based end.
  The pinned LAYOUT is not decided here: an inline script in Recipe.astro sets .rc--pin before first paint and holds the pin run as padding (.rc--hold);
  this file drops .rc--hold right before creating the pin, so the ScrollTrigger spacer replaces it with the same px and scrollHeight never moves.
*/
import { onPage } from './engine.js';

const WIPE = 1.2; // timeline units; the pin length is spread over the whole timeline
const HOLD = [0.4, 1.5, 1, 1.3]; // dwell before the first wipe, then after each wipe (STEP 02 holds longer: the drawing; the last is RESULT)
const PIN = 2.5; // pin length in viewport heights (max +250 %)

onPage(({ gsap, ScrollTrigger, env }) => {
  const root = document.getElementById('process');
  if (!root) return;
  if (!env.desktop || innerHeight < 520) { root.classList.remove('rc--pin', 'rc--hold'); return; } // the inline script in Recipe.astro guessed otherwise: back to the list

  const stage = root.querySelector('.rc__stage');
  const steps = [...root.querySelectorAll('.rc__step')];
  const frames = steps.map((s) => s.querySelector('.rc__frame'));
  const ins = steps.map((s) => s.querySelector('.rc__in'));
  const imgs = steps.map((s) => s.querySelector('img'));
  const seams = steps.map((s) => s.querySelector('.rc__seam'));
  const copy = steps.map((s) => [...s.querySelector('.rc__txt').children]);
  const segs = [...root.querySelectorAll('.rc__seg')];
  const fills = segs.map((s) => s.querySelector('.rc__bar i'));
  const wire = root.querySelector('.rc__wire');
  const scrim = root.querySelector('.rc__scrim'); // darkens the CAD photo so the thin lines read; fades in with the drawing
  const shapes = wire ? [...wire.querySelectorAll('path, circle')] : [];

  // the scene writes these properties itself: take the list-mode hooks away so the engine does not also animate them
  root.querySelectorAll('.rc__stage [data-reveal], .rc__stage [data-draw]').forEach((el) => { el.removeAttribute('data-reveal'); el.removeAttribute('data-draw'); });
  root.classList.add('rc--pin'); // already there: Recipe.astro's inline script sets it before first paint (this only covers a late-sized viewport)

  // starting state: step 1 in, the rest waiting off to the right (frame) with their photo counter-shifted (in)
  gsap.set(frames.slice(1), { xPercent: 100 });
  gsap.set(ins.slice(1), { xPercent: -100 });
  gsap.set(imgs.slice(1), { scale: 1.12 });
  gsap.set(copy.slice(1).flat(), { opacity: 0, y: 28 });
  gsap.set(fills.slice(1), { scaleX: 0 });
  if (wire) { gsap.set(wire, { opacity: 1 }); gsap.set(shapes, { drawSVG: '0%' }); gsap.set(scrim, { opacity: 0 }); }

  const tl = gsap.timeline({ defaults: { ease: 'none' } });
  let t = HOLD[0];
  const at = []; // time each step is "reached" (wipe midpoint), for the active mark
  at[0] = 0;
  for (let i = 1; i < steps.length; i++) {
    tl.to(frames[i], { xPercent: 0, duration: WIPE, ease: 'power2.inOut' }, t)
      .to(ins[i], { xPercent: 0, duration: WIPE, ease: 'power2.inOut' }, t) // same ease and duration as the frame: the two shifts cancel exactly
      .to(imgs[i], { scale: 1, duration: WIPE, ease: 'power2.out' }, t)
      .fromTo(seams[i], { xPercent: 100 }, { xPercent: 0, duration: WIPE, ease: 'power2.inOut', immediateRender: false }, t)
      .fromTo(seams[i], { opacity: 0 }, { opacity: 1, duration: 0.15, immediateRender: false }, t)
      .to(seams[i], { opacity: 0, duration: 0.25 }, t + WIPE - 0.25)
      .to(copy[i - 1], { opacity: 0, y: -24, duration: 0.5, ease: 'power2.in', stagger: 0.05 }, t)
      .to(copy[i], { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', stagger: 0.08 }, t + WIPE * 0.45)
      .to(fills[i], { scaleX: 1, duration: WIPE, ease: 'power2.inOut' }, t);
    if (frames[i].contains(wire)) tl.to(scrim, { opacity: 1, duration: 0.7, ease: 'power1.inOut' }, t + WIPE).to(shapes, { drawSVG: '100%', duration: 0.8, ease: 'power1.inOut', stagger: { each: 0.035 } }, t + WIPE + 0.1);
    at[i] = t + WIPE / 2;
    t += WIPE + HOLD[i];
  }
  tl.to({}, { duration: 0.001 }, t); // pad the end so the final dwell has its share of the scroll

  let cur = -1;
  const mark = (i) => { if (i !== cur) { cur = i; segs.forEach((s, k) => s.classList.toggle('is-on', k <= i)); } };
  mark(0);

  // The pin spacer takes over the run that .rc--hold was reserving (same px), before anything measures: the page height is the same on both sides.
  root.classList.remove('rc--hold');

  // scrub: true on purpose: this scene only exists with Lenis (env.desktop), which already eases the wheel; a numeric scrub on top is a second lag
  // layer that keeps animating after the scroll has stopped.
  ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: () => `+=${Math.round(innerHeight * PIN)}`,
    pin: true,
    scrub: true,
    invalidateOnRefresh: true,
    animation: tl,
    onUpdate: (self) => {
      const time = self.progress * tl.duration();
      mark(at.reduce((k, a, j) => (time >= a ? j : k), 0));
    },
  });
});
