// 구글 색인 회복(질문함 #44, 2026-11-11 사장님 결정 '모두 해'): 얇은 자동 쪽 목록 → config/noindex.json
// node --env-file=<unclepony-ops/.env> src/noindex-list.mjs [--days 30] [--dry]
//   먼저 node src/build.mjs 로 site/assets/pages.txt(전체 쪽 목록)를 만든다. D1(사이트 통계)은 읽기만 한다. 키 값은 출력하지 않는다.
// 대상(자동으로 만든 쪽): /p/ 상품, /vs/ 1:1 비교, /g/…-beginner·intermediate·advanced·pro 실력별 쪽, /jp/ 하위 쪽
// 남김: 최근 N일(기본 30) 안에 외부 페이지뷰(xpv)·첫 방문(visit, ChatGPT 착지 포함)·그 쪽에서 쿠팡 이동(out)이 하나라도 있는 쪽,
//       /p/ 는 그 상품이 어느 쪽에서든 쿠팡 이동으로 눌렸으면 남긴다.
// 대상이 아닌 쪽(늘 남김): 홈, /about, /c/ 분류, /g/ 가이드 본편(선물 가이드 포함), /qa·/qa/ 글, /jp 첫 쪽
// 결과는 한 번 뽑은 목록(스냅숏)이다 — 매일 다시 뽑지 않는다(색인 신호가 매일 흔들리지 않게). 새로 생긴 쪽은 목록에 없으므로 색인 대상.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, todayKst } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = Number(arg('--days', 30));
const DRY = process.argv.includes('--dry');
const E = process.env;
const DB = E.CF_D1_DATABASE_ID || 'c3ba0664-18fb-4bc4-9593-f2b19e3e3473';
const TOKEN = E.CLOUDFLARE_API_TOKEN || E.CF_API_TOKEN, ACC = E.CLOUDFLARE_ACCOUNT_ID || E.CF_ACCOUNT_ID;
if (!TOKEN || !ACC) { console.log('Cloudflare 키가 없어 멈춥니다(CLOUDFLARE_API_TOKEN·CLOUDFLARE_ACCOUNT_ID)'); process.exit(1); }
const PAGES = join(ROOT, 'site', 'assets', 'pages.txt');
if (!existsSync(PAGES)) { console.log('site/assets/pages.txt 가 없습니다. 먼저 node src/build.mjs'); process.exit(1); }
const pages = readFileSync(PAGES, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const from = todayKst(-(DAYS - 1)), to = todayKst();

async function q(sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${DB}/query`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }) });
  const j = await r.json();
  if (!j.success) throw new Error(`D1 조회 실패: ${JSON.stringify(j.errors)}`);
  return j.result[0].results;
}
const rows = await q(`SELECT kind, k, SUM(n) n FROM stats WHERE day >= ?1 AND kind IN ('xpv','visit','out','refland') GROUP BY kind, k`, [from]);
const firstDay = (await q(`SELECT MIN(day) d FROM stats WHERE kind = 'visit'`))[0]?.d;
const used = new Set(), clickedIds = new Set(), why = {};
const mark = (p, w) => { used.add(p); (why[p] ??= new Set()).add(w); };
for (const r of rows) {
  if (r.kind === 'xpv') mark(r.k, '외부 페이지뷰');
  else if (r.kind === 'visit') mark(r.k, '첫 방문');
  else if (r.kind === 'refland') { const [src, ...p] = r.k.split('|'); if (/chatgpt/i.test(src)) mark(p.join('|'), 'ChatGPT 착지'); }
  else if (r.kind === 'out') { const [page, id] = r.k.split('|'); mark(page, '쿠팡 이동'); if (id) clickedIds.add(id); }
}
const TYPE = (p) => (p.startsWith('/p/') ? 'p' : p.startsWith('/vs/') ? 'vs' : /^\/g\/.+-(beginner|intermediate|advanced|pro)$/.test(p) ? 'g-skill' : p.startsWith('/jp/') ? 'jp-sub' : null);
const auto = pages.filter((p) => TYPE(p));
const keep = auto.filter((p) => used.has(p) || (p.startsWith('/p/') && clickedIds.has(p.slice(3))));
const noindex = auto.filter((p) => !keep.includes(p));
const count = (list) => list.reduce((m, p) => { const t = TYPE(p); m[t] = (m[t] ?? 0) + 1; return m; }, {});
const out = {
  _설명: '구글 색인 회복(질문함 #44, 2026-11-11 사장님 결정). src/noindex-list.mjs 가 만든 스냅숏 — 여기 있는 주소는 사이트맵·llms.txt 에서 빠지고 <meta name="googlebot" content="noindex,follow"> 가 붙는다. 주소는 그대로 열린다. 되돌리기: paths 를 비운다. 기준: docs/google-index-recovery-2026-11.md',
  bot: 'googlebot',
  made: to,
  window: { from, to, statsFirstDay: firstDay },
  rule: '대상 = /p/·/vs/·/g/…-실력·/jp/ 하위(자동 생성 쪽). 남김 = 기간 안 외부 페이지뷰·첫 방문·ChatGPT 착지·그 쪽에서 쿠팡 이동이 있는 쪽, /p/ 는 그 상품이 어디서든 쿠팡 이동으로 눌린 쪽. 홈·/about·/c/·/g/ 본편·/qa·/jp 첫 쪽은 대상 아님',
  counts: { pagesAll: pages.length, auto: auto.length, autoByType: count(auto), keep: keep.length, keepByType: count(keep), noindex: noindex.length, noindexByType: count(noindex), sitemapAfter: pages.length - noindex.length },
  kept: Object.fromEntries(keep.map((p) => [p, [...(why[p] ?? new Set(clickedIds.has(p.slice(3)) ? ['상품 쿠팡 이동'] : []))].join('·') || '상품 쿠팡 이동'])),
  paths: noindex,
};
console.log(`기간 ${from}~${to} (통계 시작 ${firstDay}) · 전체 ${pages.length}쪽 · 자동 쪽 ${auto.length} ${JSON.stringify(out.counts.autoByType)}`);
console.log(`남김 ${keep.length} ${JSON.stringify(out.counts.keepByType)} · noindex ${noindex.length} ${JSON.stringify(out.counts.noindexByType)} · 사이트맵 ${pages.length} → ${out.counts.sitemapAfter}`);
for (const [p, w] of Object.entries(out.kept)) console.log(`  남김 ${p} — ${w}`);
if (!DRY) { writeFileSync(join(ROOT, 'config', 'noindex.json'), JSON.stringify(out, null, 1) + '\n'); console.log('저장: config/noindex.json'); }
