// 주간 클릭 상위 상품 (node src/clicks-report.mjs [일수=7] [개수=20])
// Cloudflare D1(clicks 표)을 Cloudflare API 로 조회한다. 필요한 환경변수(.env 또는 GitHub Secrets):
//   CF_API_TOKEN (권한: D1 읽기), CF_ACCOUNT_ID, CF_D1_DATABASE_ID
// 결과: 화면 출력 + reports/clicks/{오늘}.json (주간 분석에서 사용)
import { join } from 'node:path';
import { ROOT, loadConfig, writeJson, todayKst } from './lib.mjs';

const [days = 7, limit = 20] = process.argv.slice(2).map(Number);
const { CF_API_TOKEN, CF_ACCOUNT_ID, CF_D1_DATABASE_ID } = process.env;
if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_D1_DATABASE_ID) {
  console.log('클릭 리포트 건너뜀: CF_API_TOKEN, CF_ACCOUNT_ID, CF_D1_DATABASE_ID 가 필요합니다.');
  process.exit(0);
}
const from = todayKst(-(days - 1));
async function q(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const body = await res.json();
  if (!body.success) throw new Error(`D1 조회 실패: ${JSON.stringify(body.errors)}`);
  return body.result[0].results;
}
const names = Object.fromEntries(loadConfig().products.map((p) => [p.id, p.name]));
const byProduct = await q('SELECT pid, SUM(n) AS clicks FROM clicks WHERE day >= ?1 GROUP BY pid ORDER BY clicks DESC LIMIT ?2', [from, limit]);
const byPage = await q('SELECT page, SUM(n) AS clicks FROM clicks WHERE day >= ?1 GROUP BY page ORDER BY clicks DESC LIMIT ?2', [from, limit]);
const total = (await q('SELECT COALESCE(SUM(n), 0) AS clicks FROM clicks WHERE day >= ?1', [from]))[0].clicks;
const out = { from, to: todayKst(), total, products: byProduct.map((r) => ({ ...r, name: names[r.pid] ?? r.pid })), pages: byPage };
writeJson(join(ROOT, 'reports', 'clicks', `${todayKst()}.json`), out);
console.log(`최근 ${days}일 쿠팡 이동 클릭 ${total}회 (${from} ~ ${out.to})`);
out.products.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.name} (${r.pid}) — ${r.clicks}회`));
console.log('\n페이지별');
out.pages.forEach((r) => console.log(`  ${r.page || '(알 수 없음)'} — ${r.clicks}회`));
