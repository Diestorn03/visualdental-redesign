/*
  Chrome behaviour: header (glass, hides on scroll down, theme of the block under it, active section, mobile menu <dialog>),
  floating contact (ContactFab), palette switch (demo only) and footer (giant wordmark, "Reduce motion" switch).
  Every chrome component imports this module, so there is one instance; each block bails out when its markup is absent.
  Scroll work is rAF-throttled; theme and section tracking are IntersectionObserver bands (no layout reads per frame).
*/
import { onPage, getLenis, setCalm } from './engine.js';

const root = document.documentElement;
const raf = (fn) => { let id = 0; return () => { if (!id) id = requestAnimationFrame(() => { id = 0; fn(); }); }; };
const later = (fn, ms = 150) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

/* Theme of the DEEPEST [data-theme] block crossing a 2 px band `y()` px from the top: the last in document order among the blocks
   that intersect it (nested blocks come after their parents). The band is rebuilt on resize. */
function followTheme(y, apply) {
  const zones = [...document.querySelectorAll('main [data-theme], body > footer[data-theme]')];
  if (!zones.length) return;
  const hit = new Set();
  let io;
  const build = () => {
    io?.disconnect(); hit.clear();
    const top = Math.max(0, Math.round(y()));
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? hit.add(e.target) : hit.delete(e.target)));
      const cur = zones.filter((z) => hit.has(z)).pop();
      if (cur) apply(cur.dataset.theme);
    }, { rootMargin: `${-top}px 0px ${-(innerHeight - top - 2)}px 0px` });
    zones.forEach((z) => io.observe(z));
  };
  build();
  addEventListener('resize', later(build));
}

/* ---------- Header ---------- */
onPage(({ env }) => {
  const hdr = document.querySelector('[data-header]');
  if (!hdr) return;
  const menu = hdr.querySelector('#vd-menu');
  const burger = hdr.querySelector('[data-menu-open]');

  followTheme(() => hdr.offsetHeight / 2, (t) => { hdr.dataset.theme = t; });

  // glass after 24 px; hides on scroll down, returns on scroll up. Hiding waits for the reader's first input, so a restored scroll
  // position or a #hash landing never starts with a hidden header.
  // a nav click keeps it visible while the page glides to the section (until the reader scrolls by hand, or 3 s)
  // `run` = distance travelled in the current direction; it restarts when the direction flips, so a trackpad's rubber-band or Lenis' tail never
  // flicks the bar: it hides after 80 px down and returns after 40 px up (the old rule flipped on a single 6 px frame delta).
  let lastY = scrollY, run = 0, armed = false, pinned = false, unpin;
  const onScroll = raf(() => {
    const y = scrollY, d = y - lastY;
    lastY = y;
    hdr.classList.toggle('is-scrolled', y > 24);
    if (y < 120) { run = 0; hdr.classList.remove('is-hidden'); return; }
    run = d * run < 0 ? d : run + d;
    if (run < -40) hdr.classList.remove('is-hidden');
    else if (run > 80 && armed && !pinned && !menu?.open) hdr.classList.add('is-hidden');
  });
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => addEventListener(ev, () => { armed = true; }, { once: true, passive: true }));
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, () => { pinned = false; }, { passive: true }));
  hdr.addEventListener('click', (e) => {
    if (!e.target.closest('a[data-nav]')) return;
    pinned = true;
    clearTimeout(unpin);
    unpin = setTimeout(() => { pinned = false; }, 3000);
  });
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // aria-current on the link of the section crossing a band at 40% of the viewport (none over the hero or the contact section)
  const links = [...hdr.querySelectorAll('a[data-nav]')];
  const secs = ['top', ...new Set(links.map((a) => a.dataset.nav)), 'contact'].map((id) => document.getElementById(id)).filter(Boolean);
  const on = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? on.add(e.target) : on.delete(e.target)));
    const cur = secs.filter((s) => on.has(s)).pop();
    links.forEach((a) => (cur && a.dataset.nav === cur.id ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
  }, { rootMargin: '-40% 0px -59% 0px' });
  secs.forEach((s) => io.observe(s));

  if (!menu || !burger) return;
  // mobile menu: showModal() makes the rest of the page inert and traps focus; Esc and any link close it with the wipe played back
  const open = () => {
    if (menu.open) return;
    menu.showModal();
    root.classList.add('menu-open');
    getLenis()?.stop();
    burger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
  };
  const close = (now = false) => {
    if (!menu.open) return;
    menu.classList.remove('is-open');
    root.classList.remove('menu-open'); // before the engine's anchor handler runs, so Lenis can scroll to the link's target
    getLenis()?.start();
    burger.setAttribute('aria-expanded', 'false');
    if (now || env.reduced) menu.close(); else setTimeout(() => menu.close(), 520); // close() hands focus back to the burger
  };
  burger.addEventListener('click', open);
  menu.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  menu.addEventListener('click', (e) => { if (e.target.closest('[data-menu-close], a[href]')) close(); });
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...menu.querySelectorAll('a[href], button:not([disabled])')];
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  });
  matchMedia('(min-width: 1100px)').addEventListener('change', (m) => { if (m.matches) close(true); });
});

/* ---------- Floating contact: after the hero, away from #contact / the footer / #digital (wide) / [data-fab-hide] ---------- */
onPage(() => {
  const fab = document.querySelector('[data-fab]');
  if (!fab) return;
  const hero = document.getElementById('top');
  const hold = new Set();
  let past = !hero;
  const update = () => {
    const show = past && !hold.size;
    fab.classList.toggle('is-shown', show);
    root.classList.toggle('has-bar', show); // PaletteSwitch lifts itself above the mobile bar
    root.classList.toggle('past-hero', past); // PaletteSwitch stays out of the phone's first screen (it would cover the hero CTA)
  };
  if (hero) new IntersectionObserver(([e]) => { past = !e.isIntersecting; update(); }, { rootMargin: '-55% 0px 0px 0px' }).observe(hero);
  const contact = document.getElementById('contact');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? hold.add(e.target) : hold.delete(e.target)));
    root.classList.toggle('in-contact', hold.has(contact)); // PaletteSwitch steps aside too: it sat on top of the channel / link lines
    update();
  }, { rootMargin: '-12% 0px -12% 0px' });
  // #digital on wide screens: the pill sat on top of the next step's title in the right column (phones keep the bar: it has its own strip)
  const wide = matchMedia('(min-width: 768px)').matches;
  document.querySelectorAll(`#contact, body > footer, [data-fab-hide]${wide ? ', #digital' : ''}`).forEach((el) => io.observe(el));
  followTheme(() => innerHeight - 44, (t) => { fab.dataset.theme = t; });
  update();
});

/* ---------- Palette switch (proposal only): html[data-palette], ?palette= and localStorage 'vd-palette' ---------- */
onPage(() => {
  const pal = document.querySelector('[data-pal]');
  if (!pal) return;
  const opts = [...pal.querySelectorAll('[data-pal-opt]')];
  const sync = () => opts.forEach((o) => {
    const sel = o.dataset.palOpt === (root.dataset.palette || 'amber');
    o.setAttribute('aria-checked', sel);
    o.tabIndex = sel ? 0 : -1;
  });
  const pick = (i) => {
    const p = opts[i].dataset.palOpt;
    root.dataset.palette = p;
    try { localStorage.setItem('vd-palette', p); } catch (e) { /* storage blocked */ }
    const u = new URL(location.href);
    u.searchParams.set('palette', p);
    history.replaceState(history.state, '', u);
    sync();
    opts[i].focus();
  };
  opts.forEach((o, i) => o.addEventListener('click', () => pick(i)));
  pal.addEventListener('keydown', (e) => {
    const i = opts.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: opts.length - 1 }[e.key];
    if (i < 0 || to === undefined) return;
    e.preventDefault();
    pick((to + opts.length) % opts.length);
  });
  sync();
});

/* ---------- Footer: giant wordmark wipe + "Reduce motion" switch ---------- */
onPage(({ gsap, env }) => {
  const f = document.querySelector('footer.ftr');
  if (!f) return;

  const sw = f.querySelector('[data-calm]');
  if (sw) {
    sw.setAttribute('aria-pressed', env.reduced);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { // the system already asks for it: nothing to toggle
      sw.disabled = true;
      sw.querySelector('.calm__note').hidden = false;
    } else {
      // setCalm toggles html.calm, stores 'vd-calm' and emits 'vd:calm'; the engine then reloads the page in the new mode
      sw.addEventListener('click', () => { const next = sw.getAttribute('aria-pressed') !== 'true'; sw.setAttribute('aria-pressed', next); setCalm(next); });
    }
  }

  // wordmark wipe, left to right: the sheet ([data-fill]) slides in while the lettering inside slides back (both compositor layers, transform only;
  // a scrubbed clip-path re-rasterised the type every frame). Reduced motion / no engine: the lettering is simply fully drawn.
  const sheet = f.querySelector('[data-fill]');
  const ink = sheet?.firstElementChild;
  if (!ink || env.reduced) return;
  const trigger = sheet.parentElement;
  const [to, st] = env.desktop
    ? [{ ease: 'none' }, { trigger, start: 'top 96%', endTrigger: f, end: 'bottom bottom', scrub: true }] // desktop = Lenis is on: it already smooths, no second lag layer
    : [{ duration: 1.8, ease: 'power2.inOut' }, { trigger, start: 'top 92%', once: true }];
  gsap.timeline({ scrollTrigger: st })
    .fromTo(sheet, { xPercent: -100 }, { xPercent: 0, ...to }, 0)
    .fromTo(ink, { xPercent: 100 }, { xPercent: 0, ...to }, 0);
});
