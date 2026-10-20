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

// 상품 검색 (limit 최대 10): [{ id, name, price, rocket, image, url }]
export async function search(keyword, limit = 10) {
  const path = `${BASE}/products/search`;
  const query = new URLSearchParams({ keyword, limit: String(Math.min(limit, 10)) }).toString();
  const r = await fetch(`${HOST}${path}?${query}`, { headers: { Authorization: auth('GET', path, query), 'Content-Type': 'application/json;charset=UTF-8' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.rCode && j.rCode !== '0')) throw new Error(`쿠팡 API ${r.status} ${j.rCode ?? ''} ${j.rMessage ?? j.message ?? ''}`.trim());
  return (j.data?.productData ?? []).map((p) => ({ id: String(p.productId), name: p.productName, price: p.productPrice, rocket: !!p.isRocket, image: p.productImage, url: p.productUrl }));
}
