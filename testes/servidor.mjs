// ================================================================
//  Servidor estático mínimo para os testes (e para ver o app local):
//    node testes/servidor.mjs [porta]
//  Módulos ES não abrem direto do disco (file://), por isso o HTTP.
// ================================================================

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const PORTA = Number(process.argv[2] ?? process.env.PORTA ?? 4173);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let arquivo = normalize(join(RAIZ, caminho.endsWith('/') ? caminho + 'index.html' : caminho));
  if (!arquivo.startsWith(RAIZ.replace(/[\\/]$/, '') + sep) && arquivo !== RAIZ) { res.writeHead(403).end(); return; }
  let status = 200;
  try { if (!(await stat(arquivo)).isFile()) throw new Error(); }
  catch { arquivo = join(RAIZ, '404.html'); status = 404; }   // como o GitHub Pages
  try {
    const corpo = await readFile(arquivo);
    res.writeHead(status, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(corpo);
  } catch { res.writeHead(500).end(); }
}).listen(PORTA, () => console.log(`AudiStock em http://localhost:${PORTA}/  (demonstração: /app.html?demo=1)`));
