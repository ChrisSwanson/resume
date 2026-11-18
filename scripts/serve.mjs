// Zero-dependency static server for previewing on the LAN.
//   node scripts/serve.mjs [--port 8080] [--host 0.0.0.0]
// Serves only files inside the repo; refuses dotfiles and path traversal. Not for production.
import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt; };
const port = Number(arg('port', process.env.PORT ?? 8080));
const host = arg('host', '0.0.0.0');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root + sep) || path.split('/').some((p) => p.startsWith('.')) || file.includes(`${sep}node_modules${sep}`)) {
      res.writeHead(404).end('not found'); return;
    }
    const real = await realpath(file); // refuse symlinks that point outside the repo
    if (!real.startsWith(root + sep) || !(await stat(real)).isFile()) throw new Error('not servable');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(real));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
  console.log(new Date().toISOString(), req.method, req.url, res.statusCode);
}).listen(port, host, () => {
  console.log(`serving ${root} on http://${host}:${port}/`);
  for (const addrs of Object.values(networkInterfaces())) for (const a of addrs ?? []) {
    if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${port}/`);
  }
});
