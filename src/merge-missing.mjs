// 매일 작업(daily.yml)이 git pull --rebase 중 config/coupang-missing.json 충돌로 멈출 때 쓰는 합치기.
// 2026-11-16 새벽: 상품 늘리기 작업이 다시 이은 상품의 '못 찾은 날' 기록을 지운 커밋과
// 매일 가격 갱신이 날 수를 올린 커밋이 겹쳐 매일 작업이 실패(통계·가격 갱신이 안 올라감).
// rebase 중 단계: :1 = 공통 조상, :2 = 최신 main(다른 작업), :3 = 매일 갱신 커밋.
// 규칙: 매일 갱신 쪽 값을 쓰되, 다른 작업이 지운 상품(조상엔 있고 main 에 없음)은 빼고,
//       다른 작업이 새로 넣은 상품(조상·매일 갱신에 없음)은 더한다.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const FILE = 'config/coupang-missing.json';
const stage = n => {
  try { return JSON.parse(execFileSync('git', ['show', `:${n}:${FILE}`], { encoding: 'utf8' })); }
  catch { return {}; }
};
const base = stage(1), ours = stage(2), theirs = stage(3);
if (!Object.keys(theirs).length) { console.error(`${FILE}: 매일 갱신 쪽 내용을 읽지 못함`); process.exit(1); }

const out = {};
for (const [k, v] of Object.entries(theirs)) {
  if (k in base && !(k in ours)) continue; // 다른 작업이 지움(다시 이음)
  out[k] = v;
}
for (const [k, v] of Object.entries(ours)) {
  if (!(k in base) && !(k in theirs)) out[k] = v;
}
writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
const dropped = Object.keys(theirs).filter(k => !(k in out));
console.log(`${FILE} 합침: ${Object.keys(out).length - 1}개${dropped.length ? `, 다른 작업이 지운 ${dropped.length}개 뺌(${dropped.join(', ')})` : ''}`);
