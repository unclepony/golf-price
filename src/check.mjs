// 매일 데이터 점검 (node src/check.mjs [--out 파일.md]): 네트워크 요청 없이 저장소 데이터만 본다.
// 점검: 출시 연도 형식, 초보 가이드 상품의 로프트·샤프트 기준, 이미지·링크 누락, 확인한 지 14일 지난 가격, 관련 영상 목록 형식
// 결과는 마크다운으로 출력하고(GitHub Issue 본문용), 문제가 있어도 실패 코드로 끝내지 않는다(배포를 막지 않는 알림).
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { ROOT, readJson, loadLinks, historyDir, todayKst } from './lib.mjs';
import { beginnerIssues, releaseIssues } from './rules.mjs';
import { videoIssues } from './videos.mjs';
import { loadQa } from './qa.mjs';

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
  .sort((a, b) => (a.d ?? '').localeCompare(b.d ?? ''));
add(
  `확인한 지 ${STALE}일 지난 가격 (화면에서 숨겨짐)`,
  stale.slice(0, 30).map((x) => `${x.p.name} (\`${x.p.id}\`): ${x.d ? `${x.d} 확인, ${days(x.d)}일 전` : '확인 기록 없음'}`).concat(stale.length > 30 ? [`… 외 ${stale.length - 30}개`] : []),
  '`node src/prices/template.mjs` 로 prices.csv 에 확인할 상품 줄을 만들고, 쿠팡 파트너스 사이트에서 가격을 확인해 채운 뒤 `node src/prices/import.mjs` 를 실행하세요.',
  stale.length,
);

add(
  '관련 영상 목록(config/videos.json) 형식 오류',
  videoIssues(readJson(join(ROOT, 'config', 'videos.json'), {}), new Set(guides.map((g) => g.slug))),
  '`node src/videos-sync.mjs` 로 golfvideo 의 data/videos.json 을 다시 가져오거나, 없는 가이드 slug·영상 id 를 고치세요.',
);

add('게시하지 못한 초보 Q&A 글 (content/qa, 검사 불통과)', loadQa(new Set(guides.map((g) => g.slug))).bad, '글을 고치면 다음 빌드에 게시됩니다. 기준은 README `초보 Q&A`.');

const total = sections.reduce((s, x) => s + x.count, 0);
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
