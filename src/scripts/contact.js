// Simulated contact form (docs/CONTENT.md §8): validates, fakes ~900 ms of sending, then shows the thank-you. No fetch, nothing stored.
// Also preselects Topic from any [data-topic] link in the document and from ?topic= in the URL. The form itself is independent of the motion engine on purpose;
// only the studio-photo wipe at the bottom registers with it (and the photo is simply visible when the engine is absent).
import { onPage } from './engine.js';
const SENDING_MS = 900;
const TOPICS = ['new-case', 'support', 'consultation', 'education', 'other'];
const THANKS = 'Thank you — we\'ll be in touch shortly.';

function init() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const fields = [...form.querySelectorAll('input, select, textarea')];
  const submit = form.querySelector('[data-submit]');
  const label = submit.querySelector('.btn__label');
  const idleLabel = label.textContent;
  const status = form.querySelector('[data-status]');
  const msg = status.querySelector('[data-msg]');
  const topic = form.elements.topic;

  const setState = (state, text = '') => {
    form.dataset.state = state;
    if (msg.textContent !== text) msg.textContent = text; // an identical rewrite would be announced again
  };
  const summary = (n) => (n === 1 ? '1 field needs your attention.' : `${n} fields need your attention.`);

  // '' when fine, else the message to show (required + format problems; whitespace-only counts as empty)
  const problem = (el) => {
    if (el.required && !el.value.trim()) return el.dataset.msg;
    return el.validity.valid ? '' : el.dataset.invalid || el.dataset.msg;
  };
  // paints the field's state; returns true when valid
  const check = (el) => {
    const text = problem(el);
    if (text) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    document.getElementById(el.getAttribute('aria-describedby')).textContent = text;
    return !text;
  };

  // once a field has been flagged it re-checks as you type, so the message goes away the moment it is fixed
  form.addEventListener('input', (e) => {
    if (!e.target.hasAttribute('aria-invalid')) return;
    check(e.target);
    const left = form.querySelectorAll('[aria-invalid]').length;
    if (form.dataset.state === 'error') setState(left ? 'error' : 'idle', left ? summary(left) : '');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.dataset.state === 'sending') return;
    const bad = fields.filter((el) => !check(el));
    if (bad.length) {
      setState('error', summary(bad.length));
      bad[0].focus();
      return;
    }
    setState('sending', 'Sending…');
    form.setAttribute('aria-busy', 'true');
    submit.disabled = true;
    label.textContent = 'Sending…';
    setTimeout(() => {
      form.style.minHeight = form.offsetHeight + 'px'; // the thank-you takes the form's place without shifting what is below
      form.removeAttribute('aria-busy');
      setState('sent', THANKS);
      status.focus({ preventScroll: true }); // keyboard focus must not fall back to <body>
    }, SENDING_MS);
  });

  const reset = () => {
    form.reset();
    fields.forEach((el) => { el.removeAttribute('aria-invalid'); document.getElementById(el.getAttribute('aria-describedby')).textContent = ''; });
    form.style.minHeight = '';
    submit.disabled = false;
    label.textContent = idleLabel;
    setState('idle');
  };
  form.querySelector('[data-again]').addEventListener('click', () => { reset(); fields[0].focus(); });

  // ---- topic preselection ----
  const setTopic = (value) => {
    if (!TOPICS.includes(value)) return false;
    if (form.dataset.state === 'sent') reset();
    topic.value = value;
    if (topic.hasAttribute('aria-invalid')) check(topic);
    return true;
  };
  setTopic(new URLSearchParams(location.search).get('topic'));

  // resolves when the page has stopped scrolling (Lenis, native smooth scroll or an instant jump), max 3 s
  const whenSettled = (done) => {
    const t0 = performance.now();
    let last = -1, still = 0;
    (function tick() {
      const y = scrollY, elapsed = performance.now() - t0;
      still = Math.abs(y - last) < 1 && elapsed > 100 ? still + 1 : 0;
      last = y;
      if (still >= 8 || elapsed > 3000) done(); else requestAnimationFrame(tick);
    })();
  };
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('[data-topic]');
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (setTopic(link.dataset.topic)) whenSettled(() => fields[0].focus());
  });

  // enable the (simulated) submit: it stays disabled without JS so nothing can ever be posted or put in the URL
  submit.disabled = false;
}

init();

// Studio photo wipe, top to bottom: the sheet slides in from above while the picture inside counter-slides, so the picture stays put and the
// visible part grows. Transform only (both are compositor layers, see Contact.astro): animating clip-path from JS repainted the photo every frame.
onPage(({ gsap, env }) => {
  const fig = document.querySelector('.studio__photo[data-wipe]');
  const sheet = fig?.querySelector('.studio__wipe'), pic = fig?.querySelector('.studio__fill');
  if (!sheet || env.reduced) return;
  gsap.timeline({ defaults: { duration: 1.3, ease: 'expo.inOut' }, scrollTrigger: { trigger: fig, start: 'top 88%', once: true } })
    .fromTo(sheet, { yPercent: -100 }, { yPercent: 0 }, 0)
    .fromTo(pic, { yPercent: 100 }, { yPercent: 0 }, 0);
});
