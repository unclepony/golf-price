// 매일 데이터 점검 (node src/check.mjs [--out 파일.md]): 네트워크 요청 없이 저장소 데이터만 본다.
// 점검: 출시 연도 형식, 초보 가이드 상품의 로프트·샤프트 기준, 이미지·링크 누락, 확인한 지 14일 지난 가격·3일 안에 숨겨질 가격, 관련 영상 목록 형식
// 결과는 마크다운으로 출력하고(GitHub Issue 본문용), 문제가 있어도 실패 코드로 끝내지 않는다(배포를 막지 않는 알림).
import { join } from 'node:path';
import { writeFileSync, readdirSync } from 'node:fs';
import { ROOT, readJson, loadLinks, historyDir, todayKst } from './lib.mjs';
import { beginnerIssues, releaseIssues } from './rules.mjs';
import { videoIssues } from './videos.mjs';
import { loadQa } from './qa.mjs';
import { match2 } from './prices/match2.mjs';

const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const products = readJson(join(ROOT, 'config', 'products.json')).products;
const guides = readJson(join(ROOT, 'config', 'guides.json')).guides.filter((g) => !g.mergeInto);
const picks = readJson(join(ROOT, 'config', 'picks.json'), {});
const links = loadLinks();
const notices = readJson(join(ROOT, 'config', 'notices.json'), {});
const STALE = notices.priceStaleDays ?? 14;
const today = todayKst();
const name = (id) => products.find((p) => p.id === id)?.name ?? id;
const cat = (id) => products.find((p) => p.id === id)?.category;
const days = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
const lastCheck = (id) => {
  const h = readJson(join(historyDir(false), `${id}.json`), null)?.points?.at(-1)?.d;
  const s = picks[id]?.checked;
  return [h, s].filter(Boolean).sort().at(-1) ?? null;
};

// 2026-11-05: 최근 30일 상품 페이지 조회수(data/stats, 하루 합계 pv)로 사람이 먼저 볼 상품을 앞에 둔다(방문 많은 상품의 가격부터 되살리기)
const statDir = join(ROOT, 'data', 'stats');
const views = {};
let statFiles = [];
try { statFiles = readdirSync(statDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && days(f.slice(0, 10)) >= 0 && days(f.slice(0, 10)) < 30); } catch {}
for (const f of statFiles) for (const [path, n] of Object.entries(readJson(join(statDir, f), {})?.by?.pv ?? {})) {
  if (path.startsWith('/p/') && typeof n === 'number') views[path.slice(3)] = (views[path.slice(3)] ?? 0) + n;
}
// 2026-11-10: 쿠팡 클릭(out '페이지|상품ID')도 센다 — 가이드·결론 표에서 눌린 상품은 상품 페이지 조회가 없어도 가격이 숨겨지면 손해가 크다(예: 보이스캐디 SC4 PRO, 11-02~08 클릭 2·상품 페이지 조회 1)
const outs = {};
for (const f of statFiles) for (const [k, n] of Object.entries(readJson(join(statDir, f), {})?.by?.out ?? {})) {
  const id = k.split('|')[1];
  if (id && typeof n === 'number') outs[id] = (outs[id] ?? 0) + n;
}
const pv = (id) => (outs[id] ?? 0) * 1000 + (views[id] ?? 0); // 정렬용: 쿠팡 클릭 먼저, 같으면 조회수
const pvNote = (id) => [outs[id] && `최근 30일 쿠팡 클릭 ${outs[id]}`, views[id] && `최근 30일 조회 ${views[id]}`].filter(Boolean).map((t) => ` · ${t}`).join('');

const sections = [];
const add = (title, items, hint = '', count = items.length) => sections.push({ title, items, hint, count });

add('출시 칸 형식 오류 (YYYY년 또는 빈 값만 허용)', guides.flatMap((g) => releaseIssues(g).map((r) => `${g.slug} · ${name(r.id)} (\`${r.id}\`): "${r.value}"`)));

const rule = [];
for (const g of guides) for (const pk of g.picks) for (const x of beginnerIssues(g, pk, cat(pk.id), picks)) rule.push(`${g.slug} · ${name(pk.id)} (\`${pk.id}\`): ${x.msg}`);
add('초보 추천 상품의 로프트·샤프트 기준 위반', rule, '같은 모델의 기준에 맞는 옵션으로 쿠팡 링크를 만들어 `config/variants.json` 에 넣으세요.');

const inGuides = new Set(guides.flatMap((g) => g.picks.map((pk) => pk.id)));
add('쿠팡 링크도 공식몰 링크도 없는 상품', products.filter((p) => !links[p.id] && !p.external).map((p) => `${p.name} (\`${p.id}\`)${inGuides.has(p.id) ? ' — 가이드에 있음' : ''}`));
add('이미지가 없는 쿠팡 상품', products.filter((p) => links[p.id] && !picks[p.id]?.image).map((p) => `${p.name} (\`${p.id}\`)`));

const stale = products
  .filter((p) => links[p.id])
  .map((p) => ({ p, d: lastCheck(p.id) }))
  .filter((x) => !x.d || days(x.d) > STALE)
  .sort((a, b) => pv(b.p.id) - pv(a.p.id) || (a.d ?? '').localeCompare(b.d ?? ''));
add(
  `확인한 지 ${STALE}일 지난 가격 (화면에서 숨겨짐)`,
  stale.slice(0, 30).map((x) => `${x.p.name} (\`${x.p.id}\`): ${x.d ? `${x.d} 확인, ${days(x.d)}일 전` : '확인 기록 없음'}${pvNote(x.p.id)}`).concat(stale.length > 30 ? [`… 외 ${stale.length - 30}개`] : []),
  '`node src/prices/template.mjs` 로 prices.csv 에 확인할 상품 줄을 만들고, 쿠팡 파트너스 사이트에서 가격을 확인해 채운 뒤 `node src/prices/import.mjs` 를 실행하세요.',
  stale.length,
);

// 곧 숨겨질 가격: 자동 갱신(쿠팡 API)이 같은 상품을 못 찾고 있는 상품을 숨겨지기 전에 알린다
const SOON = 3;
const soon = products
  .filter((p) => links[p.id] && !picks[p.id]?.gone)
  .map((p) => ({ p, d: lastCheck(p.id) }))
  .filter((x) => x.d && days(x.d) > STALE - SOON && days(x.d) <= STALE)
  .sort((a, b) => a.d.localeCompare(b.d));
add(
  `${SOON}일 안에 숨겨질 가격 (확인한 지 ${STALE - SOON + 1}~${STALE}일)`,
  [`쿠팡 상품 번호(productId) 없음 ${soon.filter((x) => !picks[x.p.id]?.productId).length}개 / ${soon.length}개`].concat(
    soon.slice(0, 30).map((x) => `${x.p.name} (\`${x.p.id}\`): ${x.d} 확인, ${days(x.d)}일 전${picks[x.p.id]?.productId ? '' : ' · productId 없음'}`),
    soon.length > 30 ? [`… 외 ${soon.length - 30}개`] : [],
  ),
  '매일 가격 갱신(src/prices/coupang-refresh.mjs)은 productId 가 없으면 상품명이 완전히 같을 때만 반영합니다. 쿠팡 파트너스에서 같은 상품의 링크를 다시 만들어 productId 를 채우거나, prices.csv 로 직접 확인한 가격을 넣으세요.',
  soon.length,
);

// 상품 번호 채우기 후보(2026-11-01): 가격 갱신이 못 맞춘 상품(config/coupang-candidates.json) 중 검색 결과 이름이
// 연결 상품명과 같거나(로켓 여부만 다름) 쉼표 앞 이름이 같은(옵션 글자만 다름) 것. 자동 반영하지 않고 사람이 같은 상품인지 확인하는 목록.
const cands = readJson(join(ROOT, 'config', 'coupang-candidates.json'), {});
const cWords = (s) => [...new Set(String(s ?? '').toLowerCase().replace(/[()[\]{}/,·+|]/g, ' ').split(/\s+/).filter(Boolean))].sort().join(' ');
const cBase = (s) => String(s ?? '').split(',')[0].replace(/\s+/g, ' ').trim().toLowerCase();
const fill = [];
// 2026-11-02: 매일 가격 갱신의 2단계 맞춤(src/prices/match2.mjs)이 차례가 오면 스스로 저장할 상품은 사람 확인 목록에서 빼고 건수만 따로 센다.
const auto2 = [];
for (const [id, v] of Object.entries(cands)) {
  const pk = picks[id];
  if (id.startsWith('_') || !pk || pk.productId || !Array.isArray(v?.rows)) continue;
  const sane = (price) => price > 0 && (!pk.price || (price >= pk.price * 0.5 && price <= pk.price * 2));
  const prod = products.find((p) => p.id === id);
  if (match2(prod, pk, v.rows.map(([rid, nm, price, rocket]) => ({ id: rid, name: nm, price, rocket })).filter((r) => sane(r.price)))) { auto2.push(id); continue; }
  const full = v.rows.find((r) => cWords(r[1]) === cWords(pk.title) && sane(r[2]));
  const part = full ? null : v.rows.find((r) => cBase(r[1]) === cBase(pk.title) && sane(r[2]));
  const r = full ?? part;
  if (r) fill.push({ id, kind: full ? '이름 같음, 로켓 여부만 다름' : '쉼표 앞 이름 같음, 옵션 글자 다름', r, guide: inGuides.has(id) });
}
fill.sort((a, b) => pv(b.id) - pv(a.id) || b.guide - a.guide || b.kind.startsWith('이름') - a.kind.startsWith('이름') || a.id.localeCompare(b.id));
add(
  '상품 번호(productId) 채우기 후보 — 가격 갱신이 못 맞춘 상품 중 같은 상품으로 보이는 쿠팡 검색 결과 (자동 반영 안 함)',
  [`매일 가격 갱신의 2단계 맞춤이 스스로 채울 상품 ${auto2.length}개는 이 목록에서 뺐습니다(차례가 오면 자동 저장, 확인 필요 없음).`].concat(fill.slice(0, 60).map((x) => `${name(x.id)} (\`${x.id}\`): 후보 ${x.r[0]} · ${Number(x.r[2]).toLocaleString('ko-KR')}원${x.r[3] ? ' · 로켓' : ''} — ${x.kind}${x.guide ? '' : ' · 가이드에 없음'}${pvNote(x.id)}`)).concat(fill.length > 60 ? [`… 외 ${fill.length - 60}개`] : []),
  '최근 30일 상품 페이지 조회가 많은 순서입니다(위부터 채우면 효과가 큼). 쿠팡 파트너스 사이트에서 연결한 상품과 같은 상품(같은 모델·옵션 구성)인지 확인한 뒤 `config/picks.json` 의 `productId` 에 후보 번호를 적으면 다음 매일 갱신부터 가격이 다시 보입니다. 다른 상품이면 적지 마세요. 링크는 바꾸지 않습니다.',
  fill.length,
);

add(
  '관련 영상 목록(config/videos.json) 형식 오류',
  videoIssues(readJson(join(ROOT, 'config', 'videos.json'), {}), new Set(guides.map((g) => g.slug))),
  '`node src/videos-sync.mjs` 로 golfvideo 의 data/videos.json 을 다시 가져오거나, 없는 가이드 slug·영상 id 를 고치세요.',
);

add('게시하지 못한 초보 Q&A 글 (content/qa, 검사 불통과)', loadQa(new Set(guides.map((g) => g.slug))).bad, '글을 고치면 다음 빌드에 게시됩니다. 기준은 README `초보 Q&A`.');

add(
  '판매 종료·품절 추정 상품 (쿠팡 API 에서 5일 연속 못 찾음 → 사이트에서 링크 숨김)',
  // 2026-11-14: 쿠팡 클릭·조회 많은 순(다시 잇기 우선순위) — 하루에 14 → 22개로 늘어 어느 것부터 다시 이을지 알 수 있게
  Object.entries(picks).filter(([, v]) => v?.gone).sort(([a, x], [b, y]) => pv(b) - pv(a) || String(x.gone).localeCompare(String(y.gone))).map(([id, v]) => `${name(id)} (\`${id}\`): ${v.gone} 부터${pvNote(id)}`),
  '최근 30일 쿠팡 클릭·조회가 많은 순서입니다. 같은 모델의 다른 쿠팡 판매글이 있으면 src/expand 로 찾아 링크를 바꾸고(gone 지움), 단종이면 그대로 둔다(주소 유지).',
);

const total =sections.reduce((s, x) => s + x.count, 0);
const md = [
  `## 데이터 점검 ${today}`,
  '',
  total ? `문제 ${total}건 (배포는 막지 않습니다)` : '문제 없음',
  '',
  '| 항목 | 건수 |',
  '| --- | --- |',
  ...sections.map((s) => `| ${s.title} | ${s.count} |`),
  '',
  ...sections
    .filter((s) => s.items.length)
    .flatMap((s) => [`### ${s.title} (${s.count})`, s.hint ? `> ${s.hint}` : '', ...s.items.map((i) => `- ${i}`), '']),
  '_자동 점검(src/check.mjs) — 매일 이 이슈 본문을 새로 씁니다._',
].join('\n');
if (out) writeFileSync(out, md);
console.log(md);
