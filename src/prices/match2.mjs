// 쿠팡 공식 API 검색 결과로 '같은 상품'을 고르는 2단계 규칙(coupang-refresh.mjs 가 쓴다).
// 시험: node src/prices/match2.mjs  → config/coupang-candidates.json(저장된 검색 결과)로 무엇이 새로 맞는지 출력만(파일을 바꾸지 않음, API 호출 없음)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 2단계 맞춤 규칙 — ① products.json 의 must(모두)·mustAny(하나 이상)·exclude(없음)·min~max 통과 ② 로켓 여부 같음
// ③ 검색 결과 상품명의 단어가 모두 우리 연결 상품명(title) 안에 있음(우리 title = 쿠팡 상품명 + 옵션이라서. 남성용↔여성용·색·다른 모델이 섞이면 탈락)
// ④ 이 조건을 만족하는 상품 번호가 1개뿐. 하나라도 어긋나면 쓰지 않는다(추측 안 함). 2026-11-02 저장된 후보 201개로 시험: 55개 맞춤, 눈으로 모두 같은 상품 확인.
const flat = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const toks = (s) => new Set(String(s ?? '').toLowerCase().replace(/[()[\]{}/,·+|_-]/g, ' ').split(/\s+/).filter(Boolean));
export function match2(p, pk, rows) {
  if (!p || !(p.must?.length || p.mustAny?.length)) return null;
  const tt = toks(pk.title);
  const ok = rows.filter((r) => {
    const n = flat(r.name);
    if (!(p.must ?? []).every((m) => n.includes(flat(m)))) return false;
    if (p.mustAny?.length && !p.mustAny.some((m) => n.includes(flat(m)))) return false;
    if ((p.exclude ?? []).some((m) => n.includes(flat(m)))) return false;
    if ((p.min && r.price < p.min) || (p.max && r.price > p.max)) return false;
    if (pk.rocket !== undefined && !!pk.rocket !== !!r.rocket) return false;
    return [...toks(r.name)].every((t) => tt.has(t));
  });
  return new Set(ok.map((r) => String(r.id))).size === 1 ? ok[0] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const C = (f) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', f), 'utf8'));
  const cands = C('coupang-candidates.json'), picks = C('picks.json');
  const prods = Object.fromEntries(C('products.json').products.map((p) => [p.id, p]));
  let n = 0, all = 0;
  for (const [id, c] of Object.entries(cands)) {
    if (id.startsWith('_')) continue;
    all++;
    const pk = picks[id] ?? { title: c.title, price: c.price };
    const sane = (r) => r.price > 0 && (!pk.price || (r.price >= pk.price * 0.5 && r.price <= pk.price * 2));
    const hit = match2(prods[id], pk, c.rows.map(([rid, name, price, rocket]) => ({ id: rid, name, price, rocket })).filter(sane));
    if (hit) { n++; console.log(`${id}\t${pk.title}\t→ ${hit.id} ${hit.name} ${hit.price}원${hit.rocket ? ' 로켓' : ''}`); }
  }
  console.log(`2단계 맞춤 ${n}개 / 후보 ${all}개 (시험 — 저장 안 함)`);
}
