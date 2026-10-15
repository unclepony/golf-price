// 가격 반영 (명령 한 줄): node src/prices/import.mjs [prices.csv] [--dry-run]
// 1) CSV 공급자로 읽고  2) 오류가 하나라도 있으면 아무것도 반영하지 않고 알려 주고  3) 이력(data/history)에 쌓는다.
// 같은 상품·같은 날짜를 다시 넣으면 그 값으로 바뀔 뿐 이력이 중복되지 않는다.
import { join, isAbsolute } from 'node:path';
import { ROOT, loadConfig } from '../lib.mjs';
import * as csv from './providers/csv.mjs';
import { appendPoints } from './store.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const arg = args.find((a) => !a.startsWith('--')) ?? 'prices.csv';
const path = isAbsolute(arg) ? arg : join(ROOT, arg);
const { products } = loadConfig();
const { rows, errors } = csv.read(path, products);
if (errors.length) {
  console.error(`반영하지 않았습니다. 오류 ${errors.length}건을 고친 뒤 다시 실행하세요:\n${errors.map((e) => '  - ' + e).join('\n')}`);
  process.exit(1);
}
if (!rows.length) {
  console.log('반영할 가격이 없습니다 (가격·확인일을 채운 줄이 없음).');
  process.exit(0);
}
if (dry) {
  console.log(`확인만 했습니다 (--dry-run): ${rows.length}건 형식 정상`);
  process.exit(0);
}
const { added, replaced } = appendPoints(rows);
console.log(`가격 반영: ${rows.length}건 (새 기록 ${added}, 같은 날짜 값 변경 ${replaced}) → data/history/
다음: npm run build 로 확인한 뒤 커밋·푸시하면 사이트에 반영됩니다. 기준가(순위·가격대)는 10% 이상 변했을 때나 주간 재계산 때만 바뀝니다.`);
