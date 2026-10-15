// 쿠팡 파트너스 상품 검색 API로 상품별 최저가를 수집해 data/history/{id}.json 에 하루 1건씩 기록한다.
// API 키는 쿠팡 파트너스 최종 승인 후 발급된다. 키가 없으면 아무것도 하지 않고 끝난다(가이드 모드).
// 호출 한도를 넘지 않도록 한 번 실행에 COUPANG_MAX_PER_RUN 개까지만 수집하고, 오늘 이미 수집한 상품은 건너뛴다.
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { loadConfig, historyDir, readJson, writeJson, todayKst, normalize } from './lib.mjs';

const HOST = 'https://api-gateway.coupang.com';
const SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
const { COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY } = process.env;
const MAX_PER_RUN = Number(process.env.COUPANG_MAX_PER_RUN) || 8;
const DELAY_MS = (Number(process.env.COUPANG_DELAY_SEC) || 5) * 1000;

if (!COUPANG_ACCESS_KEY || !COUPANG_SECRET_KEY) {
  console.log('쿠팡 파트너스 API 키가 없어 가격 수집을 건너뜁니다 (가이드 모드).');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authorization(method, path, query) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').slice(2); // yyMMddTHHmmssZ
  const signature = createHmac('sha256', COUPANG_SECRET_KEY).update(signedDate + method + path + query).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${signature}`;
}

async function search(keyword) {
  const query = new URLSearchParams({ keyword, limit: '10' }).toString();
  const res = await fetch(`${HOST}${SEARCH_PATH}?${query}`, {
    headers: { Authorization: authorization('GET', SEARCH_PATH, query), 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (body.rCode && body.rCode !== '0')) {
    throw new Error(`쿠팡 API ${res.status} ${body.rCode ?? ''} ${body.rMessage ?? body.message ?? ''}`.trim());
  }
  return body.data?.productData ?? [];
}

function matches(item, product, globalExclude) {
  const t = normalize(item.productName);
  const price = Number(item.productPrice);
  if (!price || price < (product.min ?? 0) || price > (product.max ?? Infinity)) return false;
  if ((product.must ?? []).some((w) => !t.includes(normalize(w)))) return false;
  if (product.mustAny && !product.mustAny.some((w) => t.includes(normalize(w)))) return false;
  if ([...globalExclude, ...(product.exclude ?? [])].some((w) => t.includes(normalize(w)))) return false;
  return true;
}

const config = loadConfig();
const dir = historyDir(false);
const today = todayKst();
const todo = config.products.filter((p) => !p.external && !readJson(join(dir, `${p.id}.json`))?.points?.some((pt) => pt.d === today));
let ok = 0;

for (const product of todo.slice(0, MAX_PER_RUN)) {
  try {
    const items = (await search(product.query)).filter((it) => matches(it, product, config.globalExclude ?? []));
    if (items.length === 0) {
      console.warn(`[건너뜀] ${product.name}: 조건에 맞는 상품 없음`);
    } else {
      items.sort((a, b) => Number(a.productPrice) - Number(b.productPrice));
      const best = items[0];
      const file = join(dir, `${product.id}.json`);
      const hist = readJson(file, { id: product.id, points: [] });
      hist.points = hist.points
        .filter((p) => p.d !== today)
        .concat({ d: today, low: Number(best.productPrice), n: items.length })
        .sort((a, b) => a.d.localeCompare(b.d));
      hist.latest = {
        at: new Date().toISOString(),
        title: best.productName,
        image: best.productImage,
        link: best.productUrl, // 파트너스 링크
        rocket: Boolean(best.isRocket),
      };
      writeJson(file, hist);
      ok++;
      console.log(`[수집] ${product.name}: ${Number(best.productPrice).toLocaleString('ko-KR')}원 (후보 ${items.length}개)`);
    }
  } catch (e) {
    console.error(`[오류] ${product.name}: ${e.message}`);
  }
  await sleep(DELAY_MS);
}

console.log(`완료: 이번 실행 ${ok}개 수집, 오늘 남은 상품 ${Math.max(todo.length - MAX_PER_RUN, 0)}개 (${today})`);
