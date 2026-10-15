// 기준가 재계산 (node src/rebaseline.mjs [--weekly])
// 기준가(picks.json price)는 가격대 단계·동점 순위·예산 추천·제목 가격대에 쓰인다. 매일 바꾸면 순위와 제목이 흔들리므로
// - 평소(매일): 최근 기록 최저가가 기준가와 10% 이상 차이 날 때만 갱신
// - --weekly(주 1회 정기 재계산): 차이가 있으면 모두 갱신
// 쿠팡 API 가격 기록(data/history)이 있는 상품만 대상이다.
import { join } from 'node:path';
import { ROOT, readJson, writeJson, historyDir, todayKst } from './lib.mjs';

const WEEKLY = process.argv.includes('--weekly');
const THRESHOLD = Number(process.env.REBASE_THRESHOLD) || 0.1;
const file = join(ROOT, 'config', 'picks.json');
const picks = readJson(file, {});
const dir = historyDir(false);
const changed = [];
for (const [id, v] of Object.entries(picks)) {
  if (typeof v !== 'object' || !v.price) continue;
  const last = readJson(join(dir, `${id}.json`))?.points?.at(-1);
  if (!last?.low || last.low === v.price) continue;
  const diff = Math.abs(last.low - v.price) / v.price;
  if (diff >= THRESHOLD || WEEKLY) {
    changed.push(`${id}: ${v.price.toLocaleString('ko-KR')} → ${last.low.toLocaleString('ko-KR')}원 (${(diff * 100).toFixed(1)}%)`);
    v.price = last.low;
    v.checked = last.d;
    v.rebasedAt = todayKst();
  }
}
if (changed.length) writeJson(file, picks);
console.log(`기준가 갱신 ${changed.length}개${WEEKLY ? ' (주간 정기)' : ` (변동 ${THRESHOLD * 100}% 이상만)`}${changed.length ? '\n  ' + changed.join('\n  ') : ''}`);
