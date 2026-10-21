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
const triedFile = C('coupang-refresh.json');
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
};
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
  const hit = pk.productId
    ? rows.find((r) => r.id === String(pk.productId) && sane(r))
    : rows.find((r) => words(r.name) === want && sane(r) && (pk.rocket === undefined || !!pk.rocket === r.rocket));
  if (!hit) { miss++; console.log(`건너뜀: ${id} (검색 ${rows.length}건 중 같은 상품으로 확신할 결과 없음 — 기존 값 유지)`); save(); continue; }
  picks[id] = { ...pk, productId: String(hit.id), price: hit.price, image: pk.image || hit.image, rocket: hit.rocket, checked: today };
  ok++;
  console.log(`갱신: ${id} ${hit.price.toLocaleString()}원`);
  save();
}
console.log(`쿠팡 API 갱신 ${ok}개 · 건너뜀 ${miss}개 · 대상 ${targets.length}개`);
