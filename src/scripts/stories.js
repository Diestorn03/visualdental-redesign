// #stories: YouTube facade (the iframe exists only after a click) and the "Behind the scenes" marquee.
import { onPage } from './engine.js';

const EMBED = 'https://www.youtube-nocookie.com/embed/';

// First hover / focus / touch on a facade: open the connections the player needs, so the click starts sooner.
let warmed = false;
function warm() {
  if (warmed) return;
  warmed = true;
  for (const href of ['https://www.youtube-nocookie.com', 'https://i.ytimg.com']) document.head.append(Object.assign(document.createElement('link'), { rel: 'preconnect', href }));
}

// Click a thumbnail → a youtube-nocookie iframe replaces it; starting another video puts the previous facade back.
function facades(root) {
  let playing = null; // { frame, saved }
  for (const t of ['pointerover', 'focusin']) root.addEventListener(t, (e) => { if (e.target.closest('.vid__btn')) warm(); }, { passive: true });
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
// Pause/resume goes through the Web Animations API, not `animation-play-state`: measured in Chrome, a CSS play-state change on this
// compositor-driven animation was ignored in 5 of 13 attempts (computed style said "paused", the track kept moving), so the Pause button
// (WCAG 2.2.2) and the off-screen pause failed at random. With anim.pause(): 0 failures in 14 fresh loads (run / pause / resume / scroll away).
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

  // The loop runs only while nothing holds it: the strip is on screen (the engine's [data-offscreen] pause is per section, so it keeps this
  // one ticking for ~2 screens either side), the reader has not pressed Pause, and the pointer / keyboard focus is not inside the strip.
  const hold = { off: true, user: false, hover: false, focus: false };
  const anim = () => track.getAnimations()[0];
  const sync = () => {
    const a = anim();
    if (!a) return;
    if (hold.off || hold.user || hold.hover || hold.focus) a.pause(); else a.play();
  };
  sync();
  new IntersectionObserver(([e]) => { hold.off = !e.isIntersecting; sync(); }).observe(view);
  view.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hold.hover = true; sync(); } });
  view.addEventListener('pointerleave', () => { hold.hover = false; sync(); });
  view.addEventListener('focusout', (e) => { if (!view.contains(e.relatedTarget)) { hold.focus = false; sync(); } });

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      hold.user = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(hold.user));
      sync();
    });
  }

  // Keyboard focus only (:focus-visible): a card focused by a mouse click must not freeze the loop for good (the click opens a new tab, the
  // pointer leaves, and the link would keep focus). Tabbing to a card that is off screen: seek the loop so the card sits near the left edge.
  view.addEventListener('focusin', (e) => {
    hold.focus = e.target.matches(':focus-visible');
    sync();
    const card = hold.focus && e.target.closest('.strip__item');
    const a = anim();
    if (!card || !a) return;
    const v = view.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const m = v.width * 0.1;
    if (c.left >= v.left + m * 0.8 && c.right <= v.right - m * 0.8) return;
    const dur = a.effect.getComputedTiming().duration;
    const loop = clone.offsetLeft; // width of one set = the distance the track travels per cycle
    const at = ((a.currentTime % dur) / dur) * loop;
    a.currentTime = (Math.min(Math.max(0, at + c.left - v.left - m), loop) / loop) * dur;
  });
}

onPage(({ env }) => {
  const root = document.querySelector('#stories');
  if (!root) return;
  root.classList.add('is-js'); // swaps the no-JS YouTube links for the play buttons
  facades(root);
  if (!env.reduced) marquee(root.querySelector('[data-strip]'));
});
