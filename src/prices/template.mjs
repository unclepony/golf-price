// 이번 주 가격을 확인할 상품 줄을 prices.csv 에 추가 (node src/prices/template.mjs [개수=20])
// 우선순위: 최근 7일 클릭이 많은 상품(reports/clicks 최신 파일이 있으면) → 확인한 지 오래된 상품
// 각 줄 위에 쿠팡 파트너스 사이트에서 찾기 쉬운 상품명(쿠팡 상품명)을 주석으로 붙인다. 가격·확인일은 직접 채운다.
import { join } from 'node:path';
import { readFileSync, appendFileSync, existsSync, readdirSync } from 'node:fs';
import { ROOT, readJson, loadLinks, historyDir, todayKst } from '../lib.mjs';

const limit = Number(process.argv[2]) || 20;
const file = join(ROOT, 'prices.csv');
const products = readJson(join(ROOT, 'config', 'products.json')).products;
const picks = readJson(join(ROOT, 'config', 'picks.json'), {});
const links = loadLinks();
const stale = readJson(join(ROOT, 'config', 'notices.json'), {}).priceStaleDays ?? 14;
const lastCheck = (id) => [readJson(join(historyDir(false), `${id}.json`), null)?.points?.at(-1)?.d, picks[id]?.checked].filter(Boolean).sort().at(-1) ?? '';
const clicksDir = join(ROOT, 'reports', 'clicks');
const latestClicks = existsSync(clicksDir) ? readdirSync(clicksDir).filter((f) => f.endsWith('.json')).sort().at(-1) : null;
const clicks = Object.fromEntries((latestClicks ? readJson(join(clicksDir, latestClicks), {}).products ?? [] : []).map((r) => [r.pid, r.clicks]));
const already = existsSync(file) ? new Set(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.split(',')[0].trim())) : new Set();
const today = todayKst();
const due = (id) => !lastCheck(id) || Math.round((Date.parse(today) - Date.parse(lastCheck(id))) / 864e5) > stale - 3; // 숨겨지기 3일 전부터

const list = products
  .filter((p) => links[p.id] && !already.has(p.id) && due(p.id))
  .sort((a, b) => (clicks[b.id] ?? 0) - (clicks[a.id] ?? 0) || lastCheck(a.id).localeCompare(lastCheck(b.id)))
  .slice(0, limit);
if (!list.length) {
  console.log('지금 확인할 상품이 없습니다.');
  process.exit(0);
}
const lines = [`# ── ${today} 확인할 상품 ${list.length}개 (클릭 많은 순 → 오래된 순). 가격·확인일을 채우세요 ──`];
for (const p of list) {
  lines.push(`# ${p.name} | 쿠팡 상품명: ${picks[p.id]?.title ?? p.query}${clicks[p.id] ? ` | 최근 클릭 ${clicks[p.id]}회` : ''}`);
  lines.push(`${p.id},,`);
}
appendFileSync(file, lines.join('\n') + '\n');
console.log(`prices.csv 에 ${list.length}개 상품 줄을 추가했습니다. 가격·확인일(YYYY-MM-DD)을 채운 뒤 node src/prices/import.mjs 를 실행하세요.`);
