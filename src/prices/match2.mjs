// 쿠팡 공식 API 검색 결과로 '같은 상품'을 고르는 2단계 규칙(coupang-refresh.mjs 가 쓴다).
// 시험: node src/prices/match2.mjs [--loose]  → config/coupang-candidates.json(저장된 검색 결과)로 무엇이 새로 맞는지 출력만(파일을 바꾸지 않음, API 호출 없음)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 2단계 맞춤 규칙 — ① products.json 의 must(모두)·mustAny(하나 이상)·exclude(없음)·min~max 통과 ② 로켓 여부 같음
// ③ 검색 결과 상품명의 단어가 모두 우리 연결 상품명(title) 안에 있음(우리 title = 쿠팡 상품명 + 옵션이라서. 남성용↔여성용·색·다른 모델이 섞이면 탈락)
// ④ 이 조건을 만족하는 상품 번호가 1개뿐. 하나라도 어긋나면 쓰지 않는다(추측 안 함). 2026-11-02 저장된 후보 201개로 시험: 55개 맞춤, 눈으로 모두 같은 상품 확인.
const flat = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const toks = (s) => new Set(String(s ?? '').toLowerCase().replace(/[()[\]{}/,·+|_-]/g, ' ').split(/\s+/).filter(Boolean));
// ① 만 본다(검색 결과가 이 상품과 관계가 있는지). coupang-refresh.mjs 가 '검색어 다시' 판단에 쓴다.
export function passMust(p, r) {
  if (!p) return false;
  const n = flat(r.name);
  if (!(p.must ?? []).every((m) => n.includes(flat(m)))) return false;
  if (p.mustAny?.length && !p.mustAny.some((m) => n.includes(flat(m)))) return false;
  return true;
}
// loose: 시험 모드 전용(--loose). ③에서 판매처 수식어(정품·국내정품 등)만 무시해 보면 몇 개가 더 맞는지 보기 위한 것 — 실제 갱신에는 쓰지 않는다.
const SELLER = new Set(['정품', '국내정품', '정품.', '[정품]', '공식', '새상품', '병행']);
export function match2(p, pk, rows, { loose = false } = {}) {
  if (!p || !(p.must?.length || p.mustAny?.length)) return null;
  const tt = toks(pk.title);
  const ok = rows.filter((r) => {
    if (!passMust(p, r)) return false;
    const n = flat(r.name);
    if ((p.exclude ?? []).some((m) => n.includes(flat(m)))) return false;
    if ((p.min && r.price < p.min) || (p.max && r.price > p.max)) return false;
    if (pk.rocket !== undefined && !!pk.rocket !== !!r.rocket) return false;
    return [...toks(r.name)].every((t) => tt.has(t) || (loose && SELLER.has(t)));
  });
  return new Set(ok.map((r) => String(r.id))).size === 1 ? ok[0] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const C = (f) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', f), 'utf8'));
  const cands = C('coupang-candidates.json'), picks = C('picks.json');
  const prods = Object.fromEntries(C('products.json').products.map((p) => [p.id, p]));
  const loose = process.argv.includes('--loose');
  let n = 0, all = 0, junk = 0, withQ = 0;
  for (const [id, c] of Object.entries(cands)) {
    if (id.startsWith('_')) continue;
    all++;
    const pk = picks[id] ?? { title: c.title, price: c.price };
    const sane = (r) => r.price > 0 && (!pk.price || (r.price >= pk.price * 0.5 && r.price <= pk.price * 2));
    const R = (rows) => (rows ?? []).map(([rid, name, price, rocket]) => ({ id: rid, name, price, rocket }));
    if (!R(c.rows).some((r) => passMust(prods[id], r))) junk++;
    if (c.qrows) withQ++;
    const hit = match2(prods[id], pk, R(c.rows).filter(sane), { loose }) ?? match2(prods[id], pk, R(c.qrows).filter(sane), { loose });
    if (hit) { n++; console.log(`${id}\t${pk.title}\t→ ${hit.id} ${hit.name} ${hit.price}원${hit.rocket ? ' 로켓' : ''}`); }
  }
  console.log(`2단계 맞춤 ${n}개 / 후보 ${all}개${loose ? ' (--loose: 판매처 수식어 무시)' : ''} · 상품명 검색이 엉뚱한 결과뿐 ${junk}개 · 검색어 다시 결과 있음 ${withQ}개 (시험 — 저장 안 함)`);
}
