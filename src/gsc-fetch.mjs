// Google Search Console 지난 7일 데이터 (node src/gsc-fetch.mjs)
// 서비스 계정으로 Search Analytics API 를 읽는다(읽기 전용). 필요한 환경변수(.env 또는 GitHub Secrets):
//   GSC_SERVICE_ACCOUNT  서비스 계정 JSON 키 전체(문자열)
//   GSC_SITE             서치콘솔 속성 주소 (예: https://golf-price.pages.dev/  또는  sc-domain:example.com)
// 서치콘솔 데이터는 2~3일 늦게 집계되므로 '3일 전까지의 7일'을 가져온다.
// 결과: reports/gsc/{오늘}.json  { range, pages: [...], queries: [...] }
import { createSign } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, writeJson, todayKst } from './lib.mjs';

const { GSC_SERVICE_ACCOUNT, GSC_SITE } = process.env;
if (!GSC_SERVICE_ACCOUNT || !GSC_SITE) {
  console.log('서치콘솔 수집 건너뜀: GSC_SERVICE_ACCOUNT, GSC_SITE 가 필요합니다.');
  process.exit(0);
}
const sa = JSON.parse(GSC_SERVICE_ACCOUNT);
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`서치콘솔 인증 실패: ${JSON.stringify(body)}`);
  return body.access_token;
}

const endDate = todayKst(-3);
const startDate = todayKst(-9);
const at = await token();
async function query(dimensions, rowLimit) {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`서치콘솔 조회 실패 ${res.status}: ${JSON.stringify(body.error ?? body)}`);
  return (body.rows ?? []).map((r) => ({ ...Object.fromEntries(dimensions.map((d, i) => [d, r.keys[i]])), clicks: r.clicks, impressions: r.impressions, ctr: +r.ctr.toFixed(4), position: +r.position.toFixed(1) }));
}
const pages = await query(['page'], 500);
const queries = await query(['page', 'query'], 2000);
writeJson(join(ROOT, 'reports', 'gsc', `${todayKst()}.json`), { range: { startDate, endDate }, pages, queries });
console.log(`서치콘솔 ${startDate}~${endDate}: 페이지 ${pages.length}개, 검색어 ${queries.length}개 → reports/gsc/${todayKst()}.json`);
