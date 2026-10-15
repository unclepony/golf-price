// site/ 안의 모든 HTML에서 내부 링크(href·src)를 모아, 실제 파일이나 _redirects 규칙으로 이어지는지 검사한다 (node src/linkcheck.mjs)
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './lib.mjs';

const SITE = join(ROOT, 'site');
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk(SITE);
const redirects = new Map(
  readFileSync(join(SITE, '_redirects'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
    .map(([from, to]) => [from, to]),
);
const exists = (path) => {
  const p = decodeURIComponent(path.split('#')[0].split('?')[0]);
  if (p === '/' || p === '') return existsSync(join(SITE, 'index.html'));
  if (existsSync(join(SITE, p)) && statSync(join(SITE, p)).isFile()) return true;
  return existsSync(join(SITE, p + '.html'));
};
const bad = new Map();
const goTable = existsSync(join(SITE, 'assets', 'go.json')) ? JSON.parse(readFileSync(join(SITE, 'assets', 'go.json'), 'utf8')) : {};
const ids = new Map(); // 페이지별 id (앵커 검사)
for (const f of files.filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8');
  const page = '/' + relative(SITE, f).replace(/\\/g, '/').replace(/\.html$/, '').replace(/^index$/, '');
  ids.set(page, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  for (const m of html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
    const url = m[1];
    if (url.startsWith('//')) continue;
    // 클릭 추적 이동 주소: 이동 표(assets/go.json)에 상품이 있어야 한다
    if (url.startsWith('/go/')) {
      if (!goTable[decodeURIComponent(url.slice(4).split(/[?#]/)[0])]) bad.set(url, [...(bad.get(url) ?? []), page]);
      continue;
    }
    const path = url.split('#')[0].split('?')[0];
    if (!exists(path) && !redirects.has(path)) bad.set(url, [...(bad.get(url) ?? []), page]);
  }
}
// 리다이렉트 대상도 실제로 있어야 한다
for (const [from, to] of redirects) if (!exists(to)) bad.set(`${from} → ${to}`, ['_redirects']);
// 리다이렉트되는 주소로 내부 링크를 걸지 않는다 (사이트맵 포함)
const sitemap = readFileSync(join(SITE, 'sitemap.xml'), 'utf8');
for (const from of redirects.keys()) if (sitemap.includes(`${from}</loc>`)) bad.set(`sitemap: ${from}`, ['sitemap.xml']);
console.log(`HTML ${files.filter((f) => f.endsWith('.html')).length}개 검사, 리다이렉트 ${redirects.size}개`);
if (bad.size) {
  for (const [u, pages] of bad) console.log(`✗ ${u}  ← ${pages.slice(0, 3).join(', ')}${pages.length > 3 ? ` 외 ${pages.length - 3}곳` : ''}`);
  process.exit(1);
}
console.log('✓ 깨진 내부 링크 없음');
