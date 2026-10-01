/*
  #process · The Recipe (components/sections/Recipe.astro). The only pinned scene of the site.
  Desktop gate (env.desktop, and a viewport tall enough for the scene): .rc__stage is pinned for +250 % of the viewport and one scrubbed
  timeline plays on top of it:
    · photos: each next photo wipes in with clip-path (before | after) while a hairline seam rides the edge; the new photo settles from 1.12 to 1
    · copy: the outgoing step fades up, the incoming one rises in (STEP 0N, name, text; RESULT adds the turnaround note)
    · progress 01 · 02 · 03 · R: a bar fills as each step is reached
    · STEP 02: the wireframe over the CAD arch is drawn with DrawSVG once the photo is in
  Everything else (touch, mobile, reduced, no JS) keeps the plain list; the engine's data-reveal / data-draw do the entrances there.
  Only transform, opacity, clip-path and stroke-dashoffset are animated.
*/
import { onPage } from './engine.js';

const WIPE = 1.2; // timeline units; the pin length is spread over the whole timeline
const HOLD = [0.4, 1.5, 1, 1.3]; // dwell before the first wipe, then after each wipe (STEP 02 holds longer: the drawing; the last is RESULT)
const PIN = 2.5; // pin length in viewport heights (max +250 %)

onPage(({ gsap, ScrollTrigger, env }) => {
  const root = document.getElementById('process');
  if (!root || !env.desktop || innerHeight < 520) return;

  const stage = root.querySelector('.rc__stage');
  const steps = [...root.querySelectorAll('.rc__step')];
  const frames = steps.map((s) => s.querySelector('.rc__frame'));
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
  root.classList.add('rc--pin');

  // starting state: step 1 in, the rest waiting
  gsap.set(frames.slice(1), { clipPath: 'inset(0 0 0 100%)' });
  gsap.set(imgs.slice(1), { scale: 1.12 });
  gsap.set(copy.slice(1).flat(), { opacity: 0, y: 28 });
  gsap.set(fills.slice(1), { scaleX: 0 });
  if (wire) { gsap.set(wire, { opacity: 1 }); gsap.set(shapes, { drawSVG: '0%' }); gsap.set(scrim, { opacity: 0 }); }

  const tl = gsap.timeline({ defaults: { ease: 'none' } });
  let t = HOLD[0];
  const at = []; // time each step is "reached" (wipe midpoint), for the active mark
  at[0] = 0;
  for (let i = 1; i < steps.length; i++) {
    tl.to(frames[i], { clipPath: 'inset(0 0 0 0%)', duration: WIPE, ease: 'power2.inOut' }, t)
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

  ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: () => `+=${Math.round(innerHeight * PIN)}`,
    pin: true,
    scrub: 0.8,
    invalidateOnRefresh: true,
    animation: tl,
    onUpdate: (self) => {
      const time = self.progress * tl.duration();
      mark(at.reduce((k, a, j) => (time >= a ? j : k), 0));
    },
  });

  // web fonts and the late image decodes change the heading's height above the pin: measure again once they land
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
});
