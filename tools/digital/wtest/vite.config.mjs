// npx vite build --config tools/digital/wtest/vite.config.mjs   → .shots/d1/wtest-out (then serve it: node tools/qa/probes/v2-serve.mjs .shots/d1/wtest-out <port>)
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default { root, base: '/', build: { outDir: root + '../../../.shots/d1/wtest-out', emptyOutDir: true, chunkSizeWarningLimit: 2000 } };
