process.env.SHOTS_DIR ||= 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f1/nav/';
const d4 = await import('./d4-lib.mjs');
const b = await d4.launch({ port: 9411, w: 1366, h: 820, tag: 'tops' });
await b.open('http://127.0.0.1:4411/', 5000);
console.log(JSON.stringify(await b.evalJs(`[...document.querySelectorAll('main > section, body > footer')].map(s => [s.id || s.tagName, Math.round(s.getBoundingClientRect().top + scrollY), Math.round(s.getBoundingClientRect().height)])`)), await b.evalJs('document.documentElement.scrollHeight'));
await b.close(); process.exit(0);
