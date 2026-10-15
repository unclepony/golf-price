// 장비 선택 기준 검사 (config/rules.json): 초보 추천 상품의 로프트·샤프트, 출시 연도 형식
import { join } from 'node:path';
import { ROOT, readJson } from './lib.mjs';

export const RULES = readJson(join(ROOT, 'config', 'rules.json'), {});
const variants = readJson(join(ROOT, 'config', 'variants.json'), {});

// 연결 상품 기준 사양 문자열: 교체 상품(variants)이 있으면 그 사양, 없으면 가이드 사양 + 쿠팡 상품명
export function specText(g, pk, picks) {
  const v = variants[pk.id];
  if (v?.link && v.specs) return v.specs.join(' ');
  return `${(pk.specs ?? []).join(' ')} ${v?.link ? v.title ?? '' : picks[pk.id]?.title ?? ''}`;
}
// 로프트: '15°', '15도', '15.5°' 중 가장 처음 나온 값
export function loftOf(text) {
  const m = String(text).match(/(\d{1,2}(?:\.\d)?)\s*(?:°|도)/);
  return m ? +m[1] : null;
}
// 샤프트 강도: L, A, R, SR, S, X (숫자 접두·접미 허용: 5S, 6S, S200, X100)
export function flexOf(text) {
  const t = ` ${String(text).replace(/[,()·\[\]/_]/g, ' ')} `;
  const order = ['X', 'S', 'SR', 'R', 'A', 'L'];
  const found = [];
  // 5S·6S 같은 무게 접두, S200·X100 같은 다이나믹골드 표기만 허용 (S259 같은 모델명은 제외)
  for (const m of t.matchAll(/\s\d?(X|SR|S|R|A|L)(?:[1-4]00)?(?=\s)/g)) found.push(m[1]);
  // 가장 단단한 표기를 대표값으로
  return found.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? null;
}
// 샤프트를 따질 아이템 (퍼터·용품은 제외)
const SHAFT_CATS = ['driver', 'wood', 'utility', 'iron', 'wedge'];
// 샤프트 판단용 문자열: 샤프트·사양 칸 + 연결 쿠팡 상품명 (로켓배송 O/X 같은 칸은 제외)
function shaftText(g, pk, picks) {
  const v = variants[pk.id];
  const rows = (g.specRows ?? []).map((r, i) => (/샤프트|사양/.test(r) ? i : -1)).filter((i) => i >= 0);
  const specs = v?.link && v.specs ? v.specs : pk.specs ?? [];
  return `${rows.map((i) => specs[i] ?? '').join(' ')} ${v?.link ? v.title ?? '' : picks[pk.id]?.title ?? ''}`;
}
// 초보 추천 상품 점검 결과: [{ kind: 'loft'|'shaft', msg }]
export function beginnerIssues(g, pk, category, picks) {
  if (pk.skill !== '초심자') return [];
  const out = [];
  const text = specText(g, pk, picks);
  const minLoft = RULES.beginnerMinLoft?.[category]?.[g.gender];
  const loft = loftOf(text);
  if (minLoft && loft != null && loft < minLoft) out.push({ kind: 'loft', loft, minLoft, msg: `연결 상품 ${loft}° · 초보는 ${minLoft}° 이상 권장` });
  const flex = SHAFT_CATS.includes(category) ? flexOf(shaftText(g, pk, picks)) : null;
  if (flex && (RULES.beginnerStiffShaft ?? []).includes(flex)) out.push({ kind: 'shaft', flex, msg: `연결 상품 ${flex} 샤프트 · 초보는 더 부드러운 샤프트 권장` });
  return out;
}
// 출시 행: 'YYYY년' 또는 빈 값만 허용
export function releaseIssues(g) {
  const i = (g.specRows ?? []).findIndex((r) => r === RULES.releaseRow || r.endsWith(RULES.releaseRow ?? '출시'));
  if (i < 0) return [];
  return g.picks.filter((pk) => pk.specs?.[i] && !/^(19|20)\d\d년$/.test(pk.specs[i])).map((pk) => ({ id: pk.id, value: pk.specs[i] }));
}
