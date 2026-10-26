// 쿠팡 링크가 있는 상품의 썸네일·판매가·확인일을 쿠팡 파트너스 공식 Open API(검색)로 갱신한다 → config/picks.json (image·price·rocket·checked)
// - 사진은 비어 있을 때만 API 이미지로 채운다(기존 쿠팡 썸네일 유지). 사이트가 이미 쓰는 자리(picks.json)만 바꾼다. 디자인·가격 표시 방식(확인일 표시, 14일 지나면 숨김)은 그대로.
// - config/links.json 에 링크가 있는 상품만. 쿠팡 쇼핑몰 페이지·link.coupang.com 에는 요청하지 않는다(공식 API 만).
// - 같은 상품 판단: picks.json 에 productId(쿠팡 상품 번호)가 있으면 검색 결과의 productId 가 같을 때만 쓴다.
//   productId 는 파트너스 사이트에서 링크를 만들 때 사람이 적거나, 아래 엄격 규칙으로 한 번 찾았을 때 저장된다.
//   link.coupang.com 리다이렉트로 알아내지 않는다(자동 요청 금지 — 우리 링크 클릭으로 잡힘).
// - productId 가 없을 때(엄격): 검색 결과 상품명의 단어 묶음이 picks.json 의 연결 상품명(title)과 '완전히 같을' 때만,
//   로켓배송 여부도 같고, 가격이 기존의 0.5~2배 안일 때만 쓴다. 애매하면 건너뛰고 기존 값을 둔다(추측 안 함).
// - 순번: 마지막으로 시도한 날(config/coupang-refresh.json) 또는 확인일 중 늦은 날이 오래된 상품부터 하루 --max 개(기본 전부)
//   → 기본은 매일 전 상품. 못 찾은 상품도 시도일을 남겨 다음 상품으로 넘어간다.
// - 호출 사이 --gap 초(기본 4, 최소 3) 쉰다. 쿠팡 파트너스 API 문서: 검색은 1분당 최대 50번, 한도에 닿으면 24시간 사용 제한 → 4초 간격(분당 15번)으로 넉넉히 둔다. API 오류가 나면 거기서 멈추고 그때까지 찾은 것만 저장한다. 키가 없으면 건너뛴다.
// - 가격이 바뀌어도 콘텐츠 업데이트일은 바뀌지 않는다(build.mjs 가 가격 요소를 지문에서 뺀다).
// - 판매 종료 처리: productId 가 있는 상품만. 같은 상품을 연속 5일(날짜 기준) 못 찾으면 picks.json 에 gone(날짜)을 적는다 → 빌드가 쿠팡 링크를 숨기고 순위·목록·홈에서 뺀다(주소는 유지, '판매 종료·품절 추정' 표시).
//   API 는 호출 시점에 품절된 상품을 돌려주지 않으므로 일시 품절도 포함된다. 다시 찾으면 gone 을 지우고 되살린다. 연속 일수는 config/coupang-missing.json.
// - 가격 튐 보류(2026-10-27 gp-1027-1): 같은 상품 번호인데 직전 값보다 1.5배 넘게 오르거나 1/1.5 아래로 내리면 그날은 직전 값(가격·로켓·확인일)을 그대로 두고
//   config/coupang-jumps.json 에 기록만 한다. 다음 날 이후에도 같은 값이 다시 나오면 그때 반영한다(진짜 가격 변화는 하루 늦게 들어감).
//   같은 상품 번호에서 옵션·판매글이 번갈아 잡혀(코브라 DS-ADAPT MAX-K 379,000↔730,000원, 골프공 1더즌↔2더즌 등) 순위·날짜가 매일 흔들리던 것을 막는다.
// 실행: node --env-file=<.env> src/prices/coupang-refresh.mjs [--max N] [--gap 4]   (키 값은 화면·로그에 쓰지 않는다)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, hasKeys } from './coupang-client.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MAX = arg('--max', 100000);
const GAP = Math.max(3, arg('--gap', 4)) * 1000;
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

if (!hasKeys()) { console.log('쿠팡 API 키 없음 — 건너뜀'); process.exit(0); }

const C = (f) => join(ROOT, 'config', f);
const read = (f) => JSON.parse(readFileSync(C(f), 'utf8'));
const links = read('links.json');
const picks = read('picks.json');
const prods = Object.fromEntries((read('products.json').products ?? []).map((p) => [p.id, p]));
const triedFile = C('coupang-refresh.json');
const missFile = C('coupang-missing.json');
const missing = existsSync(missFile) ? JSON.parse(readFileSync(missFile, 'utf8')) : { _설명: 'src/prices/coupang-refresh.mjs 가 관리한다. 상품 id → { since: 처음 못 찾은 날, days: 연속으로 못 찾은 날 수, last: 마지막으로 못 찾은 날 }. 5일이면 picks.json gone.' };
const GONE_DAYS = 5;
const jumpFile = C('coupang-jumps.json');
const jumps = existsSync(jumpFile) ? JSON.parse(readFileSync(jumpFile, 'utf8')) : {};
jumps._설명 = 'src/prices/coupang-refresh.mjs 가 관리한다. 상품 id → { price: 1.5배 넘게 튄 API 값(반영 보류), held: 그때 유지한 직전 값, first: 처음 본 날, last: 마지막으로 본 날 }. 다음 날 이후 같은 값이 다시 나오면 반영하고 지운다.';
const JUMP = 1.5;
const tried = existsSync(triedFile) ? JSON.parse(readFileSync(triedFile, 'utf8')) : { _설명: 'src/prices/coupang-refresh.mjs 가 관리한다. 상품 id → 쿠팡 API 로 마지막 시도한 날(찾음/못 찾음 모두). 순번용.' };

// 단어 묶음: 소문자, 괄호·쉼표·슬래시·가운뎃점 등을 띄어쓰기로, '10.5도'·'10.5' 같은 단위 차이는 그대로 둔다(엄격)
const words = (s) => [...new Set(String(s ?? '').toLowerCase().replace(/[()[\]{}/,·+|]/g, ' ').split(/\s+/).filter(Boolean))].sort().join(' ');
const last = (id) => [tried[id], picks[id]?.checked].filter(Boolean).sort().pop() ?? '';

const targets = Object.entries(links)
  .filter(([id, url]) => !id.startsWith('_') && typeof url === 'string' && url.startsWith('https://') && picks[id]?.title)
  .map(([id]) => id)
  .sort((a, b) => last(a).localeCompare(last(b)) || a.localeCompare(b))
  .slice(0, MAX);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = () => {
  writeFileSync(C('picks.json'), JSON.stringify(picks, null, 2) + '\n');
  writeFileSync(triedFile, JSON.stringify(tried, null, 2) + '\n');
  writeFileSync(missFile, JSON.stringify(missing, null, 2) + '\n');
  writeFileSync(jumpFile, JSON.stringify(jumps, null, 2) + '\n');
};
let held = 0;
let ok = 0, miss = 0;
for (const [i, id] of targets.entries()) {
  if (i) await sleep(GAP);
  const pk = picks[id];
  let rows;
  try { rows = await search(pk.title.replace(/\s+/g, ' ').trim().slice(0, 50), 10); } catch (e) { console.log(`오류로 멈춤 (${id}): ${e.message}`); break; }
  tried[id] = today;
  const want = words(pk.title);
  const sane = (r) => r.price > 0 && (!pk.price || (r.price >= pk.price * 0.5 && r.price <= pk.price * 2));
  // productId 가 있으면 그것으로만(정확히 같은 상품), 없으면 상품명 단어 완전 일치 + 로켓 여부
  let hit = pk.productId
    ? rows.find((r) => r.id === String(pk.productId) && sane(r))
    : rows.find((r) => words(r.name) === want && sane(r) && (pk.rocket === undefined || !!pk.rocket === r.rocket));
  // 상품 번호가 있는데 상품명 검색 10건에 없으면, 상품을 처음 찾을 때 쓴 검색어(products.json query)로 한 번 더 본다(같은 번호만 인정)
  const q2 = prods[id]?.query;
  if (!hit && pk.productId && q2 && q2.trim() !== pk.title.trim()) {
    await sleep(GAP);
    try { rows = await search(q2.replace(/\s+/g, ' ').trim().slice(0, 50), 10); } catch (e) { console.log(`오류로 멈춤 (${id}): ${e.message}`); break; }
    hit = rows.find((r) => r.id === String(pk.productId) && sane(r));
  }
  if (!hit) {
    miss++;
    // productId 가 없으면 '상품명 완전 일치'를 못 한 것일 뿐 판매 종료 근거가 아니다 → 연속 일수를 세지 않는다
    // (2026-10-25: 10-15·16 에 옵션 글자까지 넣은 연결 상품명이 검색 결과 이름과 달라 206개가 한꺼번에 판매 종료로 갈 뻔함)
    if (!pk.productId) {
      delete missing[id];
      console.log(`건너뜀: ${id} (검색 ${rows.length}건 중 같은 상품명 없음 — 상품 번호가 없어 판매 종료 판단 안 함, 기존 값 유지)`);
      save();
      continue;
    }
    const m = (missing[id] ??= { since: today, days: 0, last: '' });
    if (m.last !== today) { m.days++; m.last = today; }
    if (m.days >= GONE_DAYS && !pk.gone) { picks[id] = { ...pk, gone: today }; console.log(`판매 종료 추정: ${id} (${m.days}일 연속 못 찾음, ${m.since}부터)`); }
    else console.log(`건너뜀: ${id} (검색 ${rows.length}건 중 같은 상품으로 확신할 결과 없음 — 기존 값 유지, 연속 ${m.days}일)`);
    save();
    continue;
  }
  delete missing[id];
  // 가격 튐 보류: 직전 값 대비 1.5배 넘게 바뀌면, 앞선 날에 같은 값을 이미 본 경우에만 반영
  const r = pk.price ? hit.price / pk.price : 1;
  if (r > JUMP || r < 1 / JUMP) {
    const j = jumps[id];
    if (!(j && j.price === hit.price && j.last < today)) {
      jumps[id] = { price: hit.price, held: pk.price, first: j?.price === hit.price ? j.first : today, last: today };
      held++;
      console.log(`가격 튐 보류: ${id} ${pk.price.toLocaleString()}원 → ${hit.price.toLocaleString()}원 (직전 값 유지, 같은 값이 다음 날 다시 나오면 반영)`);
      save();
      continue;
    }
    console.log(`가격 튐 반영: ${id} ${hit.price.toLocaleString()}원 (${j.last} 에 이어 다시 확인)`);
  }
  delete jumps[id];
  picks[id] = { ...pk, productId: String(hit.id), price: hit.price, image: pk.image || hit.image, rocket: hit.rocket, checked: today };
  if (pk.gone) { delete picks[id].gone; console.log(`다시 판매: ${id}`); }
  ok++;
  console.log(`갱신: ${id} ${hit.price.toLocaleString()}원`);
  save();
}
console.log(`쿠팡 API 갱신 ${ok}개 · 가격 튐 보류 ${held}개 · 건너뜀 ${miss}개 · 대상 ${targets.length}개`);
