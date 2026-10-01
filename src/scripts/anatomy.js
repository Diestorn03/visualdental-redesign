// #education: the six notes draw themselves in order while the macro photo scrolls through (scrubbed, no pin).
// Reduced / calm / no JS: nothing is hidden in CSS, so the whole plate is already visible.
import { onPage } from './engine.js';

onPage(({ gsap, env }) => {
  const root = document.querySelector('#education');
  const stage = root?.querySelector('.plate__stage');
  if (!stage || env.reduced) return;

  const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: stage, start: 'top 70%', end: 'bottom 55%', scrub: 0.7 } });
  try {
    root.querySelectorAll('.plate__svg [data-g]').forEach((g, i) => {
      const at = i; // one unit of timeline per note
      const dot = g.querySelectorAll('.dot circle');
      const guide = g.querySelectorAll('.guide path');
      const label = root.querySelector(`.anno[data-i="${i}"]`);
      const mark = root.querySelector(`.mark[data-i="${i}"]`);
      const left = label.classList.contains('anno--l');
      // zero-length round caps would leave a dot at 0%, so opacity comes in with the stroke
      const draw = (els, pos, dur) => tl.fromTo(els, { drawSVG: '0%', opacity: 0 }, { drawSVG: '100%', opacity: 1, duration: dur, ease: 'power1.inOut' }, pos);

      tl.fromTo(dot, { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.2, ease: 'power2.out' }, at)
        .fromTo(mark, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: 'back.out(2)' }, at);
      draw(guide, at + 0.1, 0.5);
      g.querySelectorAll('.ill .s').forEach((s, j) => draw(s.children, at + 0.3 + j * 0.05, 0.45));
      tl.fromTo(label.querySelector('.anno__in'), { opacity: 0, x: left ? 12 : -12 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }, at + 0.55)
        .fromTo(label.querySelector('.hand'), { clipPath: 'inset(-25% 100% -25% -10%)' }, { clipPath: 'inset(-25% -10% -25% -10%)', duration: 0.35 }, at + 0.55);
    });
    tl.to({}, { duration: 0.3 }); // hold: everything stays drawn for a moment before the photo leaves
  } catch (e) {
    console.error('[anatomy]', e);
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(root.querySelectorAll('.plate__svg *, .anno__in, .anno .hand, .mark'), { clearProps: 'all' });
  }
});
