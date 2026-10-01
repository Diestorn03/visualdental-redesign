// #stories: YouTube facade (the iframe exists only after a click) and the "Behind the scenes" marquee.
import { onPage } from './engine.js';

const EMBED = 'https://www.youtube-nocookie.com/embed/';

// Click a thumbnail → a youtube-nocookie iframe replaces it; starting another video puts the previous facade back.
function facades(root) {
  let playing = null; // { frame, saved }
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.vid__btn');
    if (!btn) return;
    const frame = btn.closest('.vid__frame');
    if (playing) { playing.frame.replaceChildren(...playing.saved); playing.frame.classList.remove('is-playing'); }
    playing = { frame, saved: [...frame.childNodes] };
    const f = document.createElement('iframe');
    f.src = `${EMBED}${btn.dataset.id}?autoplay=1&rel=0&playsinline=1`;
    f.title = btn.dataset.title;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.replaceChildren(f);
    frame.classList.add('is-playing');
    f.focus(); // the button is gone: keep keyboard users inside the player
  });
}

// Native scroll row → slow CSS marquee: clone the set (inert, so no duplicate tab stops), pause toggle, focus keeps the card on screen.
function marquee(strip) {
  const view = strip.querySelector('.strip__view');
  const track = strip.querySelector('.strip__track');
  const set = track?.firstElementChild;
  const toggle = strip.querySelector('.strip__toggle');
  if (!view || !set) return;
  const clone = set.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  track.append(clone);
  strip.classList.add('is-marquee');

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const on = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(on));
      strip.toggleAttribute('data-paused', on);
    });
  }

  // Tabbing to a card that is off screen: seek the loop so the card sits near the left edge (the marquee is paused by :focus-within).
  view.addEventListener('focusin', (e) => {
    const card = e.target.closest('.strip__item');
    const anim = track.getAnimations()[0];
    if (!card || !anim) return;
    const v = view.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const m = v.width * 0.1;
    if (c.left >= v.left + m * 0.8 && c.right <= v.right - m * 0.8) return;
    const dur = anim.effect.getComputedTiming().duration;
    const loop = clone.offsetLeft; // width of one set = the distance the track travels per cycle
    const at = ((anim.currentTime % dur) / dur) * loop;
    anim.currentTime = (Math.min(Math.max(0, at + c.left - v.left - m), loop) / loop) * dur;
  });
}

onPage(({ env }) => {
  const root = document.querySelector('#stories');
  if (!root) return;
  root.classList.add('is-js'); // swaps the no-JS YouTube links for the play buttons
  facades(root);
  if (!env.reduced) marquee(root.querySelector('[data-strip]'));
});
