// Worker side of the Digital scene (see scene.js and scene.engine.js). Messages in: { init, canvas } once, then { m, a } = call engine[m](...a).
// Messages out: { hello, gl } when the script is up, { ready } / { error } after init, then whatever the engine emits (callout anchors, info, context events).
import { createEngine } from './scene.engine.js';

let eng = null;
const q = [];
const call = (d) => { try { eng[d.m]?.(...(d.a || [])); } catch (err) { postMessage({ error: String((err && err.message) || err) }); } };
onmessage = async (e) => {
  const d = e.data;
  if (d.init) {
    try { eng = await createEngine(d.canvas, d.init, postMessage); postMessage({ ready: 1 }); q.splice(0).forEach(call); }
    catch (err) { postMessage({ error: String((err && err.message) || err) }); }
  } else if (eng) call(d); else q.push(d); // calls that arrive while the scene is still being built run right after
};
let gl = false;
try { const g = new OffscreenCanvas(1, 1).getContext('webgl2'); gl = !!g; g?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* no WebGL in workers: the page builds the scene itself */ }
postMessage({ hello: 1, gl });
