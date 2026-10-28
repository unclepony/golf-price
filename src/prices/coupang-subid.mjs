// 쿠팡 subId 시험(gp-1029-1, 2026-10-29): 결론 표 1위 상품 1개의 쿠팡 링크만 subId 'choicegolf' 가 붙은 공식 딥링크로 바꿔,
// 쿠팡 실적 리포트(ops lib/coupangrev.js 'subId별')에서 초이스골프 사이트 주문·클릭이 따로 잡히는지 본다.
// - 대상: /c/rangefinder·/g/rangefinder-recommend 결론 표 중급 1위 캐디톡 미니온2(ChatGPT 손님이 실제로 누른 상품).
//   /g/iron-recommend 초보 1위(SIM2 MAX)는 picks.json 에 productId 가 없어 주소를 만들 수 없다(link.coupang.com 리다이렉트로 알아내지 않음).
// - 쿠팡 주소는 지금 링크 문자열(pageKey·itemId·vendorItemId)로만 만든다. 쿠팡 쇼핑몰·link.coupang.com 에는 요청하지 않는다. 호출은 딥링크 API 1번.
// - 받은 결과가 같은 상품·같은 옵션(pageKey·itemId·vendorItemId)이고 landingUrl 에 subid=choicegolf 가 있을 때만 바꾼다.
//   아니면(키 없음·API 오류·subId 미반영·다른 상품) 지금 링크를 그대로 둔다. 한 번 바꾸면 다시 부르지 않는다(config/coupang-subid.json).
// - 되돌리기: config/coupang-subid.json 의 from 을 links.json 에 다시 넣고 그 항목을 지운다(또는 그 커밋 revert).
// 실행: node --env-file=<.env> src/prices/coupang-subid.mjs   (GitHub Actions daily.yml, continue-on-error)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deeplink, hasKeys } from './coupang-client.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID = 'caddytalk-minion2';
const SUB = 'choicegolf';
const C = (f) => join(ROOT, 'config', f);
const linksFile = C('links.json');
const logFile = C('coupang-subid.json');
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : { _설명: 'src/prices/coupang-subid.mjs 가 관리한다. 상품 id → { subId, from: 바꾸기 전 링크, to: subId 딥링크, date }. 되돌리려면 from 을 links.json 에 다시 넣는다.' };
const raw = readFileSync(linksFile, 'utf8');
const links = JSON.parse(raw);
const cur = links[ID];

if (log[ID] && cur === log[ID].to) { console.log(`subId 링크 이미 적용됨 (${ID}, ${log[ID].date}) — 건너뜀`); process.exit(0); }
if (!hasKeys()) { console.log('쿠팡 API 키 없음 — 건너뜀'); process.exit(0); }
let u;
try { u = new URL(cur); } catch { console.log(`${ID} 링크가 주소 형식이 아님 — 건너뜀`); process.exit(0); }
const pageKey = u.searchParams.get('pageKey'), itemId = u.searchParams.get('itemId'), vendorItemId = u.searchParams.get('vendorItemId');
if (!/^\d+$/.test(pageKey ?? '') || !/^\d+$/.test(itemId ?? '') || !/^\d+$/.test(vendorItemId ?? '')) { console.log(`${ID} 링크에 상품 번호·옵션 번호가 없음 — 건너뜀`); process.exit(0); }
const target = `https://www.coupang.com/vp/products/${pageKey}?itemId=${itemId}&vendorItemId=${vendorItemId}`;

let row;
try { [row] = await deeplink(target, SUB); } catch (e) { console.log(`딥링크 API 실패 — 지금 링크 유지: ${e.message}`); process.exit(0); }
let land;
try { land = new URL(row?.landing ?? ''); } catch { console.log('딥링크 결과에 landingUrl 없음 — 지금 링크 유지'); process.exit(0); }
const q = (k) => [...land.searchParams].find(([n]) => n.toLowerCase() === k.toLowerCase())?.[1];
const same = q('pageKey') === pageKey && q('itemId') === itemId && q('vendorItemId') === vendorItemId;
const subOk = q('subId') === SUB;
if (!same || !subOk || !/^https:\/\/link\.coupang\.com\/a\/[A-Za-z0-9]+$/.test(row.short ?? '')) {
  console.log(`딥링크 결과 확인 실패(같은 옵션 ${same}, subId 반영 ${subOk}, 짧은 링크 ${!!row.short}) — 지금 링크 유지`);
  process.exit(0);
}
log[ID] = { subId: SUB, from: cur, to: row.short, date: today };
// 다른 줄의 모양을 건드리지 않게 그 한 줄만 바꾼다(같은 링크가 두 번 나오면 전체를 다시 씀)
const enc = JSON.stringify(cur);
if (raw.split(enc).length === 2) writeFileSync(linksFile, raw.replace(enc, JSON.stringify(row.short)));
else { links[ID] = row.short; writeFileSync(linksFile, JSON.stringify(links, null, 2) + '\n'); }
writeFileSync(logFile, JSON.stringify(log, null, 2) + '\n');
console.log(`${ID} 링크를 subId '${SUB}' 딥링크로 바꿈 (${today})`);
