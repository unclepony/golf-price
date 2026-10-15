// site/ 폴더를 로컬에서 미리 보기 위한 간단한 서버 (배포에는 쓰이지 않음)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { ROOT } from './lib.mjs';

const SITE = join(ROOT, 'site');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path === '' || path.endsWith('\\') || path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(SITE, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`미리보기: http://localhost:${PORT}`));
