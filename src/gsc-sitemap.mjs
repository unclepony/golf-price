// 서치콘솔에 사이트맵 제출 + 주요 페이지 색인 상태 확인 (node src/gsc-sitemap.mjs [--inspect N])
// 서비스 계정으로 동작한다(src/gsc-auth.mjs). 필요: GSC_SERVICE_ACCOUNT, GSC_SITE (예: https://golfprice.unclepony.com/)
// 서비스 계정은 서치콘솔 설정 → 사용자 및 권한에서 '전체' 권한으로 추가해야 사이트맵을 제출할 수 있다(읽기만 하려면 '제한').
// 참고: 구글은 일반 사이트의 '색인 생성 요청'을 API 로 제공하지 않는다. 여기서는 사이트맵 제출과 색인 상태 확인만 한다.
import { join } from 'node:path';
import { ROOT, readJson, writeJson, todayKst } from './lib.mjs';
import { serviceAccount, accessToken, FULL } from './gsc-auth.mjs';

const sa = serviceAccount();
if (!sa) {
  console.log('서치콘솔 사이트맵 제출 건너뜀: GSC_SERVICE_ACCOUNT, GSC_SITE 가 필요합니다.');
  process.exit(0);
}
const SITE = process.env.GSC_SITE;
const SITE_URL = (process.env.SITE_URL || 'https://golfprice.unclepony.com').replace(/\/$/, '');
const at = await accessToken(sa, FULL);
const api = (path, init = {}) => fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}${path}`, { ...init, headers: { Authorization: `Bearer ${at}`, ...(init.headers ?? {}) } });

// 1) 사이트맵 제출 (이미 있으면 다시 읽어 가라고 알리는 효과)
const feed = `${SITE_URL}/sitemap.xml`;
const put = await api(`/sitemaps/${encodeURIComponent(feed)}`, { method: 'PUT' });
console.log(put.ok ? `사이트맵 제출 완료: ${feed}` : `사이트맵 제출 실패 ${put.status} (서비스 계정 권한이 '전체'인지 확인)`);

// 2) 주요 페이지 색인 상태 확인 (하루 한도 안에서 상위 N개)
const n = process.argv.includes('--inspect') ? Number(process.argv[process.argv.indexOf('--inspect') + 1]) || 10 : 0;
if (n) {
  const guides = readJson(join(ROOT, 'config', 'guides.json')).guides.filter((g) => !g.mergeInto);
  const urls = ['/', ...guides.map((g) => `/g/${g.slug}`)].slice(0, n).map((u) => SITE_URL + u);
  const rows = [];
  for (const u of urls) {
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: u, siteUrl: SITE, languageCode: 'ko' }),
    });
    const r = (await res.json()).inspectionResult?.indexStatusResult;
    rows.push({ url: u, verdict: r?.verdict ?? `조회 실패 ${res.status}`, coverage: r?.coverageState ?? '', lastCrawl: r?.lastCrawlTime ?? '' });
  }
  writeJson(join(ROOT, 'reports', 'gsc', `index-${todayKst()}.json`), rows);
  for (const r of rows) console.log(`${r.verdict === 'PASS' ? '✓' : '·'} ${r.url.replace(SITE_URL, '') || '/'} — ${r.coverage || r.verdict}${r.lastCrawl ? ` (마지막 크롤링 ${r.lastCrawl.slice(0, 10)})` : ''}`);
}
