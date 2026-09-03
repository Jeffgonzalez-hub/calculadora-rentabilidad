// Server estático mínimo para previsualizar la UI. Cero dependencias.
//   npm run dev   →   http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const RAIZ = process.cwd();
const PUERTO = Number(process.env.PORT) || 5173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

createServer(async (req, res) => {
  try {
    let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (ruta === '/' || ruta.endsWith('/')) ruta += 'index.html';
    const abs = normalize(join(RAIZ, ruta));
    if (!abs.startsWith(RAIZ)) { res.writeHead(403).end('403'); return; }
    const cuerpo = await readFile(abs);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(abs)] || 'application/octet-stream' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(PUERTO, () => console.log(`UI en  http://localhost:${PUERTO}`));
