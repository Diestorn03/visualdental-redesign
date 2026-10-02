import { launch, sleep } from './d3-lib.mjs';
const b = await launch({ url: 'http://127.0.0.1:4403/', wait: 4000 });
console.log(JSON.stringify(await b.ev(`(() => ({ gsap: typeof window.__gsap, ST: typeof window.__ST, n: window.__ST?.getAll().length, lenis: typeof window.lenis, cls: document.documentElement.className }))()`)));
await b.close();
