import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.md': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT || 4174);

http.createServer((request, response) => {
  let path;
  try { path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch { response.writeHead(400).end(); return; }
  if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  if (path === root) path = resolve(root, 'index.html');
  try {
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': stat.size });
    createReadStream(path).pipe(response);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Shinomart v2: http://127.0.0.1:${port}`));
