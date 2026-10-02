// Hero #top: draws the molar mesh with DrawSVG, then leaves it as a faint blueprint that drifts with the scroll (desktop only).
// Copy and photo enter with CSS (Hero.astro), so this file only owns the mesh. Reduced motion: CSS shows the full mesh, nothing runs here.
import { onPage } from './engine.js';

onPage(({ gsap, env }) => {
  const root = document.querySelector('#top');
  const wrap = root?.querySelector('.hero__mesh-wrap');
  if (!wrap) return;
  if (env.reduced) return;

  // the bloom mask ends fully opaque (its last stop is past the farthest corner): drop it so the photo is not rendered through a mask surface
  // for the rest of the visit, and the drift below is a plain texture move
  const photo = root.querySelector('.hero__photo');
  photo?.addEventListener('animationend', (e) => { if (e.target === photo) photo.style.maskImage = photo.style.webkitMaskImage = 'none'; });

  const rest = parseFloat(getComputedStyle(root).getPropertyValue('--mesh-o')) || 0.6;
  const rim = wrap.querySelector('[data-outline]');
  const bands = wrap.querySelectorAll('[data-band]');
  const dots = wrap.querySelector('[data-dots]');
  const facets = wrap.querySelector('.hero__facets');

  // ~1.7 s: the outline opens from the cervical line both ways, the bands sweep top to bottom, vertices and facets settle in,
  // while the photo blooms under it (CSS, from 0.9 s); then the whole mesh relaxes to the resting blueprint opacity.
  gsap.set(wrap, { opacity: 1 });
  gsap.set([dots, facets], { opacity: 0 });
  gsap.timeline({ delay: 0.12, defaults: { ease: 'power2.inOut' } })
    .fromTo(rim, { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 1.1 }, 0)
    .fromTo(bands, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.85, stagger: 0.07 }, 0.22)
    .to(dots, { opacity: 1, duration: 0.8, ease: 'power1.out' }, 0.9)
    .to(facets, { opacity: 1, duration: 1.1, ease: 'power1.out' }, 1.0)
    .to(wrap, { opacity: rest, duration: 1.6, ease: 'power2.inOut' }, 1.8);

  if (!env.desktop) return;
  const drift = { trigger: root, start: 'top top', end: 'bottom top', scrub: true };
  gsap.to(wrap, { yPercent: -12, ease: 'none', scrollTrigger: drift });
  gsap.to(root.querySelector('.hero__photo'), { yPercent: 5, ease: 'none', scrollTrigger: drift });
});
