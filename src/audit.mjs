// 데이터 점검 목록 (node src/audit.mjs): 초보 로프트·샤프트 기준 위반, 출시 형식 오류, 교체 자리 현황
import { join } from 'node:path';
import { ROOT, readJson } from './lib.mjs';
import { beginnerIssues, releaseIssues } from './rules.mjs';

const guides = readJson(join(ROOT, 'config', 'guides.json')).guides.filter((g) => !g.mergeInto);
const products = readJson(join(ROOT, 'config', 'products.json')).products;
const picks = readJson(join(ROOT, 'config', 'picks.json'), {});
const variants = readJson(join(ROOT, 'config', 'variants.json'), {});
const name = (id) => products.find((p) => p.id === id)?.name ?? id;
const cat = (id) => products.find((p) => p.id === id)?.category;

const loft = [], shaft = [], rel = [];
for (const g of guides) {
  for (const pk of g.picks) {
    for (const x of beginnerIssues(g, pk, cat(pk.id), picks)) (x.kind === 'loft' ? loft : shaft).push(`${g.slug} | ${name(pk.id)} (${pk.id}) | ${x.msg} | 쿠팡 상품: ${picks[pk.id]?.title ?? '-'}${variants[pk.id]?.link ? ' | 교체됨' : ''}`);
  }
  for (const r of releaseIssues(g)) rel.push(`${g.slug} | ${name(r.id)} (${r.id}) | 출시 값: "${r.value}"`);
}
const show = (h, xs) => console.log(`\n■ ${h} (${xs.length}건)\n${xs.map((x) => '  - ' + x).join('\n') || '  없음'}`);
show('초보 추천인데 로프트가 기준보다 낮은 상품', loft);
show('초보 추천인데 샤프트가 S 이상인 상품', shaft);
show('출시 칸이 연도 형식이 아닌 상품', rel);
