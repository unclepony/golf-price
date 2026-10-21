// 후보(acc/*.json) → 쿠팡 파트너스 공식 검색 API 로 같은 모델을 찾는다 (unclepony-ops/scripts/coupang-pick.mjs 규칙과 같음)
// node --env-file=<unclepony-ops/.env> pick.mjs <결과.json> <후보.json...>   호출 간격 65초, 오류 시 10분 쉬고 다시. 이미 결과가 있는 id 는 건너뜀.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { search } from '../prices/coupang-client.mjs';

const [out, ...files] = process.argv.slice(2);
const items = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
const BAN = ['직구', '해외', '구매대행', '병행', '중고', '리퍼', '호환', '반품', '전시', '렌탈', '부품', '리필', '교체용', '세트구성품', '로스트', '로고볼'];
// 같은 낱말의 한글·영문 표기를 하나로 맞춘다(판매자마다 표기가 달라서). 상품명과 must 낱말 모두 같은 규칙으로 바꾼다.
const ALIAS = [['elyte', '엘리트'], ['quantum', '퀀텀'], ['맥스', 'max'], ['smoke', '스모크'], ['blackops', '블랙옵스'], ['stealth', '스텔스'], ['paradym', '패러다임'], ['omni', '옴니'], ['아이미니', 'eyemini'], ['chrome', '크롬'], ['tour', '투어'], ['response', '리스폰스'], ['리스판스', '리스폰스'], ['distance', '디스턴스'], ['velocity', '벨로시티'], ['supersoft', '슈퍼소프트'], ['softfeel', '소프트필'], ['blueprint', '블루프린트'], ['forged', '포지드'], ['rescue', '레스큐'], ['hybrid', '하이브리드'], ['fairway', '페어웨이'], ['driver', '드라이버'], ['iron', '아이언'], ['adapt', '어댑트'], ['베레스', 'beres'], ['hotmetal', '핫메탈'], ['핑', 'ping']];
const norm = (s) => ALIAS.reduce((t, [a, b]) => t.replaceAll(a, b), String(s).toLowerCase().replace(/[\s\-_·.]+/g, ''));
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let n = 0;
for (const it of items) {
  if (res[it.id]) continue;
  if (n++) await sleep(65);
  let list;
  for (let t = 0; ; t++) {
    try { list = await search(it.query, 10); break; }
    catch (e) { console.log(`${it.id}: ${e.message} → 10분 뒤 다시`); if (t > 5) { list = null; break; } await sleep(600); }
  }
  if (!list) { console.log('API 계속 실패 — 중단'); break; }
  const ok = list.filter((p) => (it.must ?? []).every((m) => norm(p.name).includes(norm(m))) && (!it.mustAny?.length || it.mustAny.some((m) => norm(p.name).includes(norm(m)))) && ![...(it.exclude ?? []), ...BAN].some((x) => norm(p.name).includes(norm(x))));
  const pick = ok.find((p) => p.rocket) ?? ok[0];
  res[it.id] = pick
    ? { link: pick.url, title: pick.name, rocket: pick.rocket, productId: pick.id, price: pick.price, image: pick.image, checked: today, cands: list.length }
    : { none: `검색 ${list.length}개 중 조건 맞는 상품 없음`, seen: list.slice(0, 5).map((p) => p.name) };
  writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
  console.log(`${Object.keys(res).length}/${items.length} ${it.id}: ${pick ? (pick.rocket ? '[로켓] ' : '') + pick.name.slice(0, 60) + ' ' + pick.price : '없음'}`);
}
console.log('끝');
