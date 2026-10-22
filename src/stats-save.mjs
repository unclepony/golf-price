// 매일 분석 자료: 사이트 방문·유입·쿠팡 클릭 하루 합계를 저장소에 남긴다 (node src/stats-save.mjs)
// /admin/data?day=YYYY-MM-DD 를 읽어 data/stats/YYYY-MM-DD.json { date, by: { 종류: { 키: 횟수 } } } 로 저장.
// 어제(확정)와 오늘(23시 기준, 다음 날 다시 덮어씀) 두 날을 저장한다. 필요: ADMIN_PASS (GitHub Secrets). 없으면 건너뛴다.
// 종류: pv visit ref refland refurl kw dev cty out(페이지|상품) outref pos seen(쿠팡 버튼이 화면에 보인 페이지뷰) seenpos(처음 보인 버튼 위치) nav(사이트 안 이동 '앞 페이지|다음 페이지') depth·stay(페이지를 떠날 때 내려간 깊이·머문 시간 구간 '페이지|구간') — functions/api/hit.js 참고. 개인정보 없음.
import { join } from 'node:path';
import { ROOT, writeJson, todayKst } from './lib.mjs';

const SITE_URL = (process.env.SITE_URL || 'https://choicegolf.unclepony.com').replace(/\/$/, '');
const pass = process.env.ADMIN_PASS;
if (!pass) {
  console.log('방문 통계 저장 건너뜀: ADMIN_PASS 가 없습니다 (GitHub Secrets 에 추가).');
  process.exit(0);
}
for (const day of [todayKst(-1), todayKst()]) {
  const res = await fetch(`${SITE_URL}/admin/data?day=${day}`, { headers: { authorization: `Basic ${Buffer.from(`stats:${pass}`).toString('base64')}` } });
  const j = await res.json().catch(() => ({ error: `응답 ${res.status}` }));
  if (j.error) { console.log(`방문 통계 ${day} 실패: ${j.error}`); process.exitCode = 1; continue; }
  const by = {};
  for (const r of j.rows) (by[r.kind] ??= {})[r.k] = r.n;
  writeJson(join(ROOT, 'data', 'stats', `${day}.json`), { date: day, by });
  const sum = (k) => Object.values(by[k] ?? {}).reduce((a, b) => a + b, 0);
  console.log(`방문 통계 ${day}: 페이지뷰 ${sum('pv')}, 방문 ${sum('visit')}, 쿠팡 클릭 ${sum('out')}`);
}
