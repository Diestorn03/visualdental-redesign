// Stand-alone harness for src/scripts/digital/scene.js (built with vite, see vite.config.mjs): window.__t(opts) → the scene on #c.
import { createScene } from '../../../src/scripts/digital/scene.js';
window.__t = (o = {}) => createScene(document.getElementById('c'), o);
