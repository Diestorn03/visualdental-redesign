// f1-at: what is on the page at document y (default 6461 = the cold raster hitch at the bottom edge of the viewport): elements overlapping the band with paint-heavy styles.
// node tools/qa/probes/f1-at.mjs [y0=6300] [y1=6500]
process.env.SHOTS_DIR ||= 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f1/nav/';
const d4 = await import('./d4-lib.mjs');
const Y0 = +(process.argv[2] || 6300), Y1 = +(process.argv[3] || 6500);
const b = await d4.launch({ port: 9411, w: 1366, h: 820, tag: 'at' });
await b.open('http://127.0.0.1:4411/', 5000);
console.log(JSON.stringify(await b.evalJs(`(() => { const out = [];
  for (const el of document.querySelectorAll('main *')) { const r = el.getBoundingClientRect(); const t = r.top + scrollY, bt = t + r.height; if (bt < ${Y0} || t > ${Y1} || r.width < 4) continue;
    const c = getComputedStyle(el); const f = [];
    if (c.mixBlendMode !== 'normal') f.push('blend:' + c.mixBlendMode); if (c.filter !== 'none') f.push('filter'); if (c.backdropFilter !== 'none') f.push('backdrop'); if (c.maskImage !== 'none') f.push('mask'); if (c.clipPath !== 'none') f.push('clip');
    if (c.willChange !== 'auto') f.push('wc:' + c.willChange); if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS' || el.tagName === 'SVG') f.push(el.tagName + (el.currentSrc ? ':' + el.currentSrc.split('/').pop() : '') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); if (c.boxShadow !== 'none') f.push('shadow'); if (c.backgroundImage !== 'none') f.push('bgimg');
    if (f.length) out.push([el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], Math.round(t), Math.round(r.height), f.join(' ')]); }
  return out; })()`)));
await b.close(); process.exit(0);
