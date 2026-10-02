// A/B conditions injected through CDP (no source file is modified). `css` is added after DOMContentLoaded, `pre` runs before any page script.
const NO = (sel, decl) => `${sel}{${decl}!important}`;
export const CONDS = {
  base: {},
  // 1. every backdrop-filter off (header glass .hdr::after, FAB, palette switch)
  noblur: { css: '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' },
  // header only
  nohdrblur: { css: '.hdr::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' },
  nofabblur: { css: '.fab,.pal{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' },
  // 2. every CSS mask (hero photo bloom, plate photo, marquee edges)
  nomask: { css: '*,*::before,*::after{mask-image:none!important;-webkit-mask-image:none!important}' },
  // blend + filter
  noblend: { css: '*{mix-blend-mode:normal!important;filter:none!important}' },
  // marquee off
  nomarquee: { css: '.strip__track{animation:none!important}' },
  // hero svg mesh hidden / hero css animations off
  nomesh: { css: '.hero__mesh-wrap{display:none!important}' },
  // page gets `contain: paint` on sections (isolates repaint)
  contain: { css: 'main>section{contain:layout paint}' },
  // content-visibility auto on sections (skip offscreen rendering)
  cv: { css: 'main>section:not(#process){content-visibility:auto;contain-intrinsic-size:auto 2000px}' },
  // will-change: transform promoted images
  hdroff: { css: '.hdr{display:none!important}' },
  nosticky: { css: '.faq__head{position:static!important}' },
  nofab: { css: '.fab,.pal{display:none!important}' },
  noanim: { css: '*,*::before,*::after{animation:none!important;transition:none!important}' },
  everything: { css: '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;mask-image:none!important;-webkit-mask-image:none!important;mix-blend-mode:normal!important}' },
};
