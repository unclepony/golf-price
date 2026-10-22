// Google Search Console 지난 7일 데이터 (node src/gsc-fetch.mjs)
// 서비스 계정으로 Search Analytics API 를 읽는다(읽기 전용). 필요한 환경변수(.env 또는 GitHub Secrets):
//   GSC_SERVICE_ACCOUNT  서비스 계정 JSON 키 전체(문자열)
//   GSC_SITE             서치콘솔 속성 주소 (예: https://choicegolf.unclepony.com/  또는  sc-domain:example.com)
// 서치콘솔 데이터는 2~3일 늦게 집계되므로 '3일 전까지의 7일'을 가져온다.
// 결과: reports/gsc/{오늘}.json  { range, pages: [...], queries: [...] }
import { join } from 'node:path';
import { ROOT, writeJson, todayKst } from './lib.mjs';
import { serviceAccount, accessToken, READONLY } from './gsc-auth.mjs';

const sa = serviceAccount();
if (!sa) {
  console.log('서치콘솔 수집 건너뜀: GSC_SERVICE_ACCOUNT, GSC_SITE 가 필요합니다.');
  process.exit(0);
}
const GSC_SITE = process.env.GSC_SITE;
const HOST = new URL(process.env.SITE_URL || 'https://choicegolf.unclepony.com').host;

const endDate = todayKst(-3);
const startDate = todayKst(-9);
const at = await accessToken(sa, READONLY);
async function query(dimensions, rowLimit) {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    // 도메인 속성(sc-domain:unclepony.com)은 모든 서브도메인을 담으므로 이 사이트 주소만 거른다
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, ...(GSC_SITE.startsWith('sc-domain:') && { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: HOST }] }] }) }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`서치콘솔 조회 실패 ${res.status}: ${JSON.stringify(body.error ?? body)}`);
  return (body.rows ?? []).map((r) => ({ ...Object.fromEntries(dimensions.map((d, i) => [d, r.keys[i]])), clicks: r.clicks, impressions: r.impressions, ctr: +r.ctr.toFixed(4), position: +r.position.toFixed(1) }));
}
const pages = await query(['page'], 500);
const queries = await query(['page', 'query'], 2000);
writeJson(join(ROOT, 'reports', 'gsc', `${todayKst()}.json`), { range: { startDate, endDate }, pages, queries });
console.log(`서치콘솔 ${startDate}~${endDate}: 페이지 ${pages.length}개, 검색어 ${queries.length}개 → reports/gsc/${todayKst()}.json`);
