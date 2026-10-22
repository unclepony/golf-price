// 주간 분석 자료 만들기 (node src/weekly-report.mjs) — AI 없이 숫자만 정리한다. 먼저 node src/build.mjs 를 실행해 site/ 가 있어야 한다.
// 입력: reports/gsc 최신 파일(서치콘솔), reports/clicks 최신 파일(클릭 추적), site/ 의 현재 title·description
// 출력:
//   reports/weekly/{오늘}-data.json  주간 분석(Claude)이 읽는 자료
//   reports/weekly/{오늘}.md         (a) 가격 확인 목록을 채운 보고서 뼈대 — (b)(c)는 주간 분석이 채운다
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ROOT, readJson, loadLinks, historyDir, todayKst } from './lib.mjs';

const today = todayKst();
const SITE_URL = (process.env.SITE_URL || 'https://choicegolf.unclepony.com').replace(/\/$/, '');
const latest = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().at(-1) : null);
const gscFile = latest(join(ROOT, 'reports', 'gsc'));
const clickFile = latest(join(ROOT, 'reports', 'clicks'));
const gsc = gscFile ? readJson(join(ROOT, 'reports', 'gsc', gscFile)) : null;
const clicks = clickFile ? readJson(join(ROOT, 'reports', 'clicks', clickFile)) : null;
const products = readJson(join(ROOT, 'config', 'products.json')).products;
const picks = readJson(join(ROOT, 'config', 'picks.json'), {});
const links = loadLinks();
const stale = readJson(join(ROOT, 'config', 'notices.json'), {}).priceStaleDays ?? 14;

// 현재 페이지 제목·설명 (site/ 빌드 결과)
function meta(path) {
  const f = join(ROOT, 'site', path === '/' ? 'index.html' : `${path.replace(/^\//, '')}.html`);
  if (!existsSync(f)) return null;
  const h = readFileSync(f, 'utf8');
  return { title: (h.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? '', description: (h.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? '' };
}
const toPath = (url) => url.replace(SITE_URL, '').replace(/\/$/, '') || '/';

// (b) 노출 대비 클릭이 낮은 페이지: 노출 30회 이상, 평균 순위 20위 이내, 클릭률 2% 미만
const lowCtr = (gsc?.pages ?? [])
  .filter((p) => p.impressions >= 30 && p.position <= 20 && p.ctr < 0.02)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 10)
  .map((p) => {
    const path = toPath(p.page);
    return { path, ...p, ...meta(path), topQueries: (gsc.queries ?? []).filter((q) => q.page === p.page).sort((a, b) => b.impressions - a.impressions).slice(0, 8).map((q) => ({ query: q.query, impressions: q.impressions, clicks: q.clicks, position: q.position })) };
  });

// (c) 본문·FAQ 보강 후보: 노출이 많은 가이드·실력별 페이지 상위
const contentCandidates = (gsc?.pages ?? [])
  .map((p) => ({ path: toPath(p.page), impressions: p.impressions, clicks: p.clicks, position: p.position }))
  .filter((p) => p.path.startsWith('/g/'))
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 6);

// (a) 이번 주 가격 확인할 상품 20개: 클릭 많은 순 → 확인한 지 오래된 순
const lastCheck = (id) => [readJson(join(historyDir(false), `${id}.json`), null)?.points?.at(-1)?.d, picks[id]?.checked].filter(Boolean).sort().at(-1) ?? '';
const clickOf = Object.fromEntries((clicks?.products ?? []).map((r) => [r.pid, r.clicks]));
const priceChecks = products
  .filter((p) => links[p.id])
  .map((p) => ({ id: p.id, name: p.name, coupangTitle: picks[p.id]?.title ?? p.query, lastCheck: lastCheck(p.id), clicks: clickOf[p.id] ?? 0 }))
  .sort((a, b) => b.clicks - a.clicks || a.lastCheck.localeCompare(b.lastCheck))
  .slice(0, 20);

const data = { date: today, sources: { gsc: gscFile, clicks: clickFile }, gscRange: gsc?.range ?? null, clicksTotal: clicks?.total ?? null, priceChecks, lowCtr, contentCandidates };
mkdirSync(join(ROOT, 'reports', 'weekly'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'weekly', `${today}-data.json`), JSON.stringify(data, null, 2) + '\n');

const days = (d) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 864e5) : null);
const md = `# 주간 분석 ${today}

자료: 서치콘솔 ${gsc ? `${gsc.range.startDate}~${gsc.range.endDate}` : '없음(설정 전)'} · 클릭 추적 ${clicks ? `${clicks.from}~${clicks.to}, ${clicks.total}회` : '없음(설정 전)'}

## (a) 이번 주 가격 확인할 상품 20개
쿠팡 파트너스 사이트의 상품 검색에서 '쿠팡 상품명'으로 찾아 판매가를 확인하고, \`prices.csv\` 에 채운 뒤 \`node src/prices/import.mjs\` 를 실행하세요. (확인한 지 ${stale}일이 지나면 화면에서 가격이 숨겨집니다)

| # | 상품ID | 사이트 상품명 | 쿠팡 상품명(검색용) | 마지막 확인 | 최근 클릭 |
| --- | --- | --- | --- | --- | --- |
${priceChecks.map((x, i) => `| ${i + 1} | \`${x.id}\` | ${x.name} | ${x.coupangTitle.replace(/\|/g, '/')} | ${x.lastCheck || '-'}${days(x.lastCheck) != null ? ` (${days(x.lastCheck)}일 전)` : ''} | ${x.clicks} |`).join('\n')}

## (b) 노출 대비 클릭이 낮은 페이지 — title/description 개선안
${lowCtr.length ? '<!-- 주간 분석이 채웁니다 -->' : '대상 없음 (서치콘솔 자료가 없거나 기준에 맞는 페이지 없음)'}

## (c) 본문·FAQ 보강 페이지 (최대 2개)
${contentCandidates.length ? '<!-- 주간 분석이 채웁니다 -->' : '대상 없음 (서치콘솔 자료가 없음)'}
`;
writeFileSync(join(ROOT, 'reports', 'weekly', `${today}.md`), md);
console.log(`주간 자료: reports/weekly/${today}-data.json, reports/weekly/${today}.md (가격 확인 ${priceChecks.length}개, 클릭률 낮은 페이지 ${lowCtr.length}개, 보강 후보 ${contentCandidates.length}개)`);
