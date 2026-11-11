// 후보(리서치) + 쿠팡 검색 결과 → golf-price config 에 넣기
// node merge.mjs <repo> <후보.json> <결과.json> <가이드 slug | auto> [--only id,id] [--skip id,id]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [repo, candF, resF, guideArg] = process.argv.slice(2);
const flag = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].split(',') : null; };
const only = flag('--only'), skip = flag('--skip') ?? [];
const C = (f) => join(repo, 'config', f);
const rd = (f) => JSON.parse(readFileSync(C(f), 'utf8'));
// 새 상품 추가 중지(2026-11-11 사장님 결정, 질문함 #44 구글 색인 회복): config/expand-pause.json 의 paused 가 true 면 새 상품을 넣지 않는다.
// 사장님·관제탑이 따로 지시한 한 건만 --allow-new 로 넣는다(예: 새 쿠팡 파트너스 계정 승인용 링크 1개). 판매 종료 다시 잇기·링크·가격 고치기는 이 도구를 쓰지 않으므로 계속할 수 있다
const PAUSE = (() => { try { return rd('expand-pause.json'); } catch { return null; } })();
if (PAUSE?.paused && !process.argv.includes('--allow-new')) {
  console.log(`새 상품 추가 중지 기간(${PAUSE.since}~, ${PAUSE.why}) — 아무것도 넣지 않습니다. 기존 상품의 링크·가격·모델 연결만 고치세요. 다시 켜기: config/expand-pause.json paused=false (사장님·관제탑 지시가 있을 때만)`);
  process.exit(0);
}
const wr = (f, v) => writeFileSync(C(f), JSON.stringify(v, null, 2) + '\n');
const products = rd('products.json'), links = rd('links.json'), picks = rd('picks.json'), guides = rd('guides.json');
const cands = JSON.parse(readFileSync(candF, 'utf8'));
const res = JSON.parse(readFileSync(resF, 'utf8'));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// 쿠팡 상품명에서 연결 상품 사양(로프트·샤프트 강도)을 읽는다 — 확실히 적혀 있을 때만
function linkedSpec(title) {
  const t = String(title);
  const loft = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:도|°)/)?.[1];
  const flex = t.match(/(?:^|[\s(,/])(SR|R|S|X|L|A)(?=$|[\s),/])/)?.[1] ?? t.match(/\d(SR|R|S|X)(?=$|[\s),/])/)?.[1];
  const parts = [flex, loft ? `${loft}°` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : '판매처 확인';
}
let added = 0;
const out = [];
for (const c of cands) {
  const r = res[c.id];
  if (!r || r.none || skip.includes(c.id) || (only && !only.includes(c.id))) continue;
  if (products.products.some((p) => p.id === c.id)) { out.push(`이미 있음: ${c.id}`); continue; }
  const slug = guideArg === 'auto' ? (c.gender === '여성' ? 'womens-shoes-recommend' : 'golf-shoes-recommend') : guideArg;
  const g = guides.guides.find((x) => x.slug === slug);
  if (!g) throw new Error(`가이드 없음 ${slug}`);
  products.products.push({ id: c.id, category: c.category, name: c.name, query: c.query, ...(c.must ? { must: c.must } : {}), ...(c.mustAny ? { mustAny: c.mustAny } : {}), exclude: c.exclude ?? [], summary: c.summary, points: c.points ?? [], ref: r.price, updated: today, added: today });
  links[c.id] = r.link;
  picks[c.id] = { title: r.title, price: r.price, rocket: !!r.rocket, image: r.image, checked: r.checked, productId: r.productId };
  const pk = { id: c.id, ...c.guidePick };
  pk.specs = (pk.specs ?? []).map((v) => (v === 'TBD' ? linkedSpec(r.title) : v === '확인 필요' ? (r.rocket ? 'O' : 'X') : v));
  g.picks.push(pk);
  added++;
  out.push(`추가: ${c.id} → ${slug} [${pk.skill ?? '-'}] ${pk.specs.join(' / ')} | ${r.title.slice(0, 50)}`);
}
wr('products.json', products); wr('links.json', links); wr('picks.json', picks); wr('guides.json', guides);
console.log(out.join('\n'));
console.log(`추가 ${added}개`);
