// 자동 가격 수집 (GitHub Actions 매일 실행): 쓸 수 있는 자동 공급자가 있을 때만 동작한다.
// 지금은 쿠팡 파트너스 API 공급자가 빈 껍데기라서 아무것도 하지 않는다. API 승인 후 providers/coupang-api.mjs 를 구현하면 켜진다.
import { loadConfig } from '../lib.mjs';
import * as coupangApi from './providers/coupang-api.mjs';
import { appendPoints } from './store.mjs';

const providers = [coupangApi];
const p = providers.find((x) => x.available());
if (!p) {
  console.log('자동 가격 공급자 없음 (쿠팡 파트너스 API 승인 전). 가격은 prices.csv → node src/prices/import.mjs 로 입력합니다.');
  process.exit(0);
}
const { products } = loadConfig();
const rows = await p.fetchPrices(products.filter((x) => !x.external));
const r = appendPoints(rows);
console.log(`${p.name}: ${rows.length}건 수집 (새 기록 ${r.added}, 변경 ${r.replaced})`);
