// v3-27 (r2): phone pass (390x844 touch, DPR3) on the production build: screenshots of the main screens + overlaps between bottom bar / palette / content, services list thumbs, tap on a Services row, palette tap.
process.env.D5_CDP ||= '9423';
process.env.D5_URL ||= 'http://127.0.0.1:4423/';
const { launch, sleep } = await import('./d5-lib.mjs');
import { writeFileSync } from 'node:fs';
const OUTD = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v3-r2/';
const S = await launch('v3-mob2', { device: 'mobile', url: process.env.D5_URL, wait: 4500 });
const J = (o) => JSON.stringify(o);
const shot = async (n) => { const r = await S.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); writeFileSync(OUTD + n + '.jpg', Buffer.from(r.data, 'base64')); };
const jump = async (y) => { await S.eval(`document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, ${Math.round(y)}); 0`); await sleep(1400); };
const top = (sel) => S.eval(`document.querySelector(${J(sel)}).getBoundingClientRect().top + scrollY`);
await shot('m-00-top');
console.log('mode', J(await S.eval(`({ cls: document.documentElement.className, bar: !!document.querySelector('[data-bar], .bar'), pal: !!document.querySelector('.pal') })`)));
const rows = await S.eval(`[...document.querySelectorAll('.svc__row')].length`);
await jump(await top('#services') - 20); await shot('m-01-services-head');
await jump(await top('.svc__list') + 380); await shot('m-02-services-rows');
await jump(await top('#digital') + 60); await shot('m-03-digital-top');
const gy = await S.eval(`window.__digital && window.__digital.geo ? window.__digital.geo.a : null`);
console.log('digital geo.a', J(gy));
if (gy) { await jump(gy[2]); await sleep(1200); await shot('m-04-digital-step3'); }
await jump(await top('.strip') - 120); await shot('m-05-stories-strip');
await jump(await top('#faq') + 40); await shot('m-06-faq');
await jump(await top('#contact') + 20); await shot('m-07-contact');
await jump(await S.eval('document.documentElement.scrollHeight') - 900); await shot('m-08-footer');
// overlap audit at several scroll positions: fixed UI (palette pill, bottom bar / FAB) vs viewport bottom
const fixed = await S.eval(`(() => { const out = []; for (const el of document.querySelectorAll('.pal, [data-fab], .fab, .bar, [data-bar]')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); out.push({ c: String(el.className).split(' ')[0] || el.tagName, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vis: cs.visibility, op: cs.opacity }); } return out; })()`);
console.log('fixed UI now (footer)', J(fixed));
console.log('errors', J(S.errors || []));
try { await S.close?.(); } catch {}
process.exit(0);
