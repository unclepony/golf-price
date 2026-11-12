// 구글 색인 회복(질문함 #44, 2026-11-11 사장님 결정 '모두 해'): 얇은 자동 쪽 목록 → config/noindex.json
// node --env-file=<unclepony-ops/.env> src/noindex-list.mjs [--days 30] [--dry] [--promote]
//   먼저 node src/build.mjs 로 site/assets/pages.txt(전체 쪽 목록)를 만든다. D1(사이트 통계)은 읽기만 한다. 키 값은 출력하지 않는다.
// 대상(자동으로 만든 쪽): /p/ 상품, /vs/ 1:1 비교, /g/…-beginner·intermediate·advanced·pro 실력별 쪽, /jp/ 하위 쪽
// 남김: 최근 N일(기본 30) 안에 외부 페이지뷰(xpv)·첫 방문(visit, ChatGPT 착지 포함)·그 쪽에서 쿠팡 이동(out)이 하나라도 있는 쪽,
//       /p/ 는 그 상품이 어느 쪽에서든 쿠팡 이동으로 눌렸으면 남긴다.
// 대상이 아닌 쪽(늘 남김): 홈, /about, /c/ 분류, /g/ 가이드 본편(선물 가이드 포함), /qa·/qa/ 글, /jp 첫 쪽
// 결과는 한 번 뽑은 목록(스냅숏)이다 — 매일 다시 뽑지 않는다(색인 신호가 매일 흔들리지 않게).
// 2026-11-13(골프 상품 늘리기 재개): newAuto="noindex" 면 목록 밖 새 자동 쪽도 활동이 생기기 전까지 noindex(build.mjs). pin(사장님 지시 등)은 늘 남긴다.
// --promote: 지금 목록을 바탕으로 활동이 생긴 쪽만 kept 로 올린다(내리지는 않는다). 목록 밖 새 자동 쪽 가운데 활동이 없는 것은 paths 에 적어 둔다. 주 1회쯤 돌린다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, todayKst } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = Number(arg('--days', 30));
const DRY = process.argv.includes('--dry');
const PROMOTE = process.argv.includes('--promote');
const NOW_FILE = join(ROOT, 'config', 'noindex.json');
const prev = existsSync(NOW_FILE) ? JSON.parse(readFileSync(NOW_FILE, 'utf8')) : {};
if (PROMOTE && !prev.paths) { console.log('--promote 는 기존 config/noindex.json 이 있어야 합니다'); process.exit(1); }
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
const active = (p) => used.has(p) || (p.startsWith('/p/') && clickedIds.has(p.slice(3)));
const pin = prev.pin ?? {};
let keep, noindex, promoted = [];
if (PROMOTE) {
  // 올리기만: 이미 남긴 쪽(kept)·고정(pin)은 그대로, noindex 목록·목록 밖 새 쪽 가운데 활동이 생긴 쪽을 kept 로
  const keptPrev = new Set(Object.keys(prev.kept ?? {}));
  promoted = auto.filter((p) => !keptPrev.has(p) && !pin[p] && active(p));
  keep = auto.filter((p) => keptPrev.has(p) || promoted.includes(p));
  noindex = auto.filter((p) => !keep.includes(p) && !pin[p]);
} else {
  keep = auto.filter((p) => active(p) && !pin[p]);
  noindex = auto.filter((p) => !keep.includes(p) && !pin[p]);
}
const count = (list) => list.reduce((m, p) => { const t = TYPE(p); m[t] = (m[t] ?? 0) + 1; return m; }, {});
const reason = (p) => [...(why[p] ?? new Set())].join('·') || (clickedIds.has(p.slice(3)) ? '상품 쿠팡 이동' : '');
const keptOut = PROMOTE
  ? { ...(prev.kept ?? {}), ...Object.fromEntries(promoted.map((p) => [p, `${reason(p)} (${to} 올림)`])) }
  : Object.fromEntries(keep.map((p) => [p, reason(p)]));
const promoteInfo = PROMOTE
  ? { last: to, window: { from, to }, log: [...(prev.promote?.log ?? []), { day: to, pages: promoted }] }
  : prev.promote;
const out = {
  _설명: prev._설명 ?? '구글 색인 회복(질문함 #44). src/noindex-list.mjs 가 만든다. 기준: docs/google-index-recovery-2026-11.md',
  bot: prev.bot ?? 'googlebot',
  ...(prev.newAuto ? { newAuto: prev.newAuto } : {}),
  made: PROMOTE ? prev.made : to,
  window: PROMOTE ? prev.window : { from, to, statsFirstDay: firstDay },
  ...(promoteInfo ? { promote: promoteInfo } : {}),
  rule: '대상 = /p/·/vs/·/g/…-실력·/jp/ 하위(자동 생성 쪽). 남김 = 기간 안 외부 페이지뷰·첫 방문·ChatGPT 착지·그 쪽에서 쿠팡 이동이 있는 쪽, /p/ 는 그 상품이 어디서든 쿠팡 이동으로 눌린 쪽. 홈·/about·/c/·/g/ 본편·/qa·/jp 첫 쪽은 대상 아님. pin 은 늘 남김. --promote 는 올리기만 한다',
  counts: { pagesAll: pages.length, auto: auto.length, autoByType: count(auto), keep: Object.keys(keptOut).length, pin: Object.keys(pin).length, noindex: noindex.length, noindexByType: count(noindex), sitemapAfter: pages.length - noindex.length },
  pin,
  kept: keptOut,
  paths: noindex,
};
console.log(`${PROMOTE ? '올리기(--promote)' : '목록 새로 만들기'} · 기간 ${from}~${to} (통계 시작 ${firstDay}) · 전체 ${pages.length}쪽 · 자동 쪽 ${auto.length} ${JSON.stringify(out.counts.autoByType)}`);
console.log(`남김 ${out.counts.keep} · 고정 ${out.counts.pin} · noindex ${noindex.length} ${JSON.stringify(out.counts.noindexByType)} · 사이트맵 ${pages.length} → ${out.counts.sitemapAfter}`);
if (PROMOTE) for (const p of promoted) console.log(`  올림 ${p} — ${reason(p)}`);
else for (const [p, w] of Object.entries(out.kept)) console.log(`  남김 ${p} — ${w}`);
if (!DRY) { writeFileSync(NOW_FILE, JSON.stringify(out, null, 1) + '\n'); console.log('저장: config/noindex.json'); }
