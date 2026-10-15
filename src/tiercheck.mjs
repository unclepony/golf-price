// 비교별 실력·가격 단계 분포 검사: 각 단계에 2개 이상인지 확인 (node src/tiercheck.mjs)
import { join } from 'node:path';
import { ROOT, readJson } from './lib.mjs';

const products = readJson(join(ROOT, 'config', 'products.json'));
const picks = readJson(join(ROOT, 'config', 'picks.json'), {});
const guides = readJson(join(ROOT, 'config', 'guides.json')).guides;
const SK = ['초심자', '중급', '고급', '프로'];
const PR = ['저가', '중가', '고가', '프리미엄'];
const byId = Object.fromEntries(products.products.map((p) => [p.id, p]));
let bad = 0;
for (const g of guides) {
  const cat = products.categories.find((c) => c.id === byId[g.picks[0].id]?.category);
  const b = cat?.priceBands;
  const sk = Object.fromEntries(SK.map((s) => [s, []]));
  const pr = Object.fromEntries(PR.map((s) => [s, []]));
  for (const pk of g.picks) {
    if (pk.skill) sk[pk.skill].push(pk.id);
    const price = picks[pk.id]?.price;
    if (price && b) pr[PR[price < b[0] ? 0 : price < b[1] ? 1 : price < b[2] ? 2 : 3]].push(pk.id);
  }
  const hasSkill = g.picks.some((pk) => pk.skill);
  const lack = [...(hasSkill ? SK.filter((s) => sk[s].length < 2) : []), ...PR.filter((s) => pr[s].length < 2)];
  if (lack.length) bad++;
  console.log(`${lack.length ? '✗' : '✓'} ${g.slug.padEnd(28)} ${g.picks.length}개 | 실력 ${hasSkill ? SK.map((s) => `${s}${sk[s].length}`).join(' ') : '-'} | 가격 ${PR.map((s) => `${s}${pr[s].length}`).join(' ')}${lack.length ? ' | 부족: ' + lack.join(',') : ''}`);
}
const links = readJson(join(ROOT, 'config', 'links.json'), {});
const cp = products.products.filter((p) => links[p.id]).length;
console.log(`\n쿠팡 ${cp}/${products.products.length} (${((cp / products.products.length) * 100).toFixed(1)}%) · 부족한 비교 ${bad}개`);
