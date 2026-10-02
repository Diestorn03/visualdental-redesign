// v2: tiny static server over a FROZEN copy of dist (so a rebuild mid-measurement cannot mix versions). Same behaviour as `astro preview` for this site
// (trailingSlash, no compression, no cache headers). Usage: node tools/qa/probes/v2-serve.mjs <dir> <port>
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
const dir = process.argv[2], port = +process.argv[3] || 4422;
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.ico': 'image/x-icon', '.mp4': 'video/mp4', ".webm": "video/webm" };
createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(dir, p));
  if (!f.startsWith(normalize(dir)) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': T[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
}).listen(port, '127.0.0.1', () => console.log('serving', dir, 'on', port));
