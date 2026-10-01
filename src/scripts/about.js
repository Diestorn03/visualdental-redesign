// #about motion that the engine's data-* hooks do not cover: the ruler wipe, photo zoom-settle and the manifesto track.
import { onPage } from './engine.js';

onPage(({ gsap, env }) => {
  const root = document.querySelector('#about');
  if (!root || env.reduced) return; // reduced / calm: static and fully visible (CSS already shows everything)

  // the measuring rule under the headline wipes in from the left
  const rule = root.querySelector('.story__rule');
  if (rule) {
    gsap.fromTo(rule, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.8, ease: 'power2.inOut', clearProps: 'clipPath',
      scrollTrigger: { trigger: rule, start: 'top 88%', once: true } });
  }

  // portraits and studio photos settle from a slight zoom while their clip wipe plays
  root.querySelectorAll('.portrait, .shot').forEach((fig) => {
    gsap.from(fig.querySelector('img'), {
      scale: 1.16, duration: 2.2, ease: 'expo.out', delay: +(fig.dataset.delay || 0),
      scrollTrigger: { trigger: fig, start: fig.dataset.start || 'top 88%', once: true },
    });
  });

  // the hairline under the manifesto fills with the same scroll window as the words lighting up
  const text = root.querySelector('.manifesto');
  const fill = root.querySelector('.manifesto__track i');
  if (text && fill) {
    gsap.fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: text, start: 'top 80%', end: 'bottom 45%', scrub: true } });
  }
});
