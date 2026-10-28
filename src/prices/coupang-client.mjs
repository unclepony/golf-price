// 쿠팡 파트너스 공식 Open API 클라이언트 (검색만). unclepony-ops/scripts/coupang-api.mjs 의 최소판.
// 키: 환경 변수 COUPANG_PT_API_KEY · COUPANG_PT_API_SECRET_KEY (GitHub Secrets / 내 PC는 node --env-file).
// 키 값은 화면·커밋·로그에 쓰지 않는다. 쿠팡 쇼핑몰 페이지는 열거나 긁지 않는다 — 공식 API 만 쓴다.
import { createHmac } from 'node:crypto';

const HOST = 'https://api-gateway.coupang.com';
const BASE = '/v2/providers/affiliate_open_api/apis/openapi/v1';

export const hasKeys = () => !!(process.env.COUPANG_PT_API_KEY && process.env.COUPANG_PT_API_SECRET_KEY);

function auth(method, path, query) {
  const { COUPANG_PT_API_KEY: AK, COUPANG_PT_API_SECRET_KEY: SK } = process.env;
  if (!AK || !SK) throw new Error('쿠팡 API 키가 없습니다 (COUPANG_PT_API_KEY / COUPANG_PT_API_SECRET_KEY)');
  const d = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').slice(2); // yyMMddTHHmmssZ
  const sig = createHmac('sha256', SK).update(d + method + path + query).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${AK}, signed-date=${d}, signature=${sig}`;
}

// 상품 검색 (limit 최대 10, 사진 크기 imageSize 기본 512x512): [{ id, name, price, rocket, image, url }]
// 문서상 한도: 1분당 최대 50번(넘으면 24시간 제한) — 호출하는 쪽에서 4초 간격을 둔다.
export async function search(keyword, limit = 10, imageSize = '512x512') {
  const path = `${BASE}/products/search`;
  const query = new URLSearchParams({ keyword, limit: String(Math.min(limit, 10)), imageSize }).toString();
  const r = await fetch(`${HOST}${path}?${query}`, { headers: { Authorization: auth('GET', path, query), 'Content-Type': 'application/json;charset=UTF-8' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.rCode && j.rCode !== '0')) throw new Error(`쿠팡 API ${r.status} ${j.rCode ?? ''} ${j.rMessage ?? j.message ?? ''}`.trim());
  return (j.data?.productData ?? []).map((p) => ({ id: String(p.productId), name: p.productName, price: p.productPrice, rocket: !!p.isRocket, image: p.productImage, url: p.productUrl }));
}

// 딥링크(공식 API, POST /deeplink): 쿠팡 주소 → 파트너스 링크. subId 를 주면 본문에 같이 보낸다(실적 리포트에서 사이트별로 나눠 보는 이름).
// unclepony-ops/scripts/coupang-api.mjs deeplink(urls, subId) 와 같은 요청. 반환 [{ from, short, landing }]
export async function deeplink(urls, subId) {
  const path = `${BASE}/deeplink`;
  const r = await fetch(`${HOST}${path}`, {
    method: 'POST',
    headers: { Authorization: auth('POST', path, ''), 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ coupangUrls: [].concat(urls), ...(subId ? { subId } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.rCode && j.rCode !== '0')) throw new Error(`쿠팡 API ${r.status} ${j.rCode ?? ''} ${j.rMessage ?? j.message ?? ''}`.trim());
  return (j.data ?? []).map((x) => ({ from: x.originalUrl, short: x.shortenUrl, landing: x.landingUrl }));
}
