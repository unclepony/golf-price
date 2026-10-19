// 상품 설정과 가격 기록으로 정적 사이트(site/)를 만든다.
// 가격 기록이 없는 상품은 구매 가이드 페이지로, 있는 상품은 가격 추이 페이지로 만든다.
// 사용: node src/build.mjs        → 실제 데이터 (data/)
//       node src/build.mjs --demo → 샘플 데이터 (data-demo/)
import { rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, loadConfig, loadLinks, historyDir, readJson, writeText as rawWrite, todayKst } from './lib.mjs';
import { beginnerIssues, releaseIssues } from './rules.mjs';
import { loadQa, qaRelatedBlock, writeQaPages } from './qa.mjs';
import { publicVideos, isShorts, isVideoId, videoIssues } from './videos.mjs';
import { writeJpPages } from './jp.mjs';

const DEMO = process.argv.includes('--demo');
const SITE_URL = (process.env.SITE_URL || 'https://golfprice.unclepony.com').replace(/\/$/, '');
const SITE = readJson(join(ROOT, 'config', 'site.json'), {});
const SITE_NAME = SITE.name || 'ATL골프기어';
const LOGO_SVG = readFileSync(join(ROOT, 'src', 'figures', 'logo.svg'), 'utf8').replace(/role="img" aria-label="[^"]*"/, 'aria-hidden="true"');
const OUT = join(ROOT, 'site');
// 안내 문구는 config/notices.json 한 곳에서 관리한다 (고지·점수·가격 안내)
const NOTICES = readJson(join(ROOT, 'config', 'notices.json'), {});
const DISCLOSURE = NOTICES.disclosure;
// 가격 출처 상태: API 기록이 하나라도 있으면 api, 아니면 manual (링크 생성 때 확인·직접 입력)
const PRICE_MODE = (() => {
  const dir = historyDir(process.argv.includes('--demo'));
  if (!existsSync(dir)) return 'manual';
  return readdirSync(dir).some((f) => f.endsWith('.json') && (readJson(join(dir, f), {}).points ?? []).some((p) => (p.src ?? 'api') === 'api')) ? 'api' : 'manual';
})();
const PRICE_NOTE = NOTICES.price?.[PRICE_MODE];

// ---------- 콘텐츠 업데이트일 (가격 확인일과 분리) ----------
// 페이지 <main> 본문에서 가격·날짜를 뺀 내용의 지문(hash)을 config/content-state.json 에 저장하고,
// 지문이 바뀐 페이지만 '마지막 업데이트'와 sitemap lastmod 를 갱신하며 IndexNow 대기열(pending)에 넣는다.
// 가격만 바뀐 페이지는 지문이 같아서 날짜가 바뀌지 않는다.
const STATE_FILE = join(ROOT, 'config', 'content-state.json');
const prevState = readJson(STATE_FILE, null);
const SEEDING = !prevState; // 처음 만들 때는 기존 updated 값을 씨앗으로 쓰고 전송 대기열은 비워 둔다
const state = { _설명: 'build.mjs 가 관리한다. pages: 주소별 본문 지문(h)과 콘텐츠 업데이트일(d). pending: IndexNow 로 보낼 주소(콘텐츠가 바뀐·새로 생긴·삭제된 페이지). 직접 고치지 않는다.', pages: {}, pending: prevState?.pending ?? [] };
const pageDates = {};
const TODAY = todayKst();
function contentKey(html) {
  const a = html.indexOf('<main');
  const b = html.indexOf('</main>');
  const main = (a >= 0 && b > a ? html.slice(a, b) : html)
    .replace(/"pr":\d+,"pd":"[^"]*"/g, '')
    .replace(/<p class="updated"[\s\S]*?<\/p>/g, '')
    // 가격 기록에서 나오는 부분(판단 문구·그래프·통계·가격 하락 목록)은 가격만 바뀌어도 달라지므로 뺀다
    .replace(/<!--phist-->[\s\S]*?<!--\/phist-->/g, '')
    // 쿠팡 이동 주소(직접 링크·/go/ 추적 링크)는 같은 것으로 본다
    .replace(/href="(?:\/go\/[^"]*|https:\/\/link\.coupang\.com\/[^"]*)"/g, 'href="#out"')
    // 가격 표시 요소는 통째로 뺀다 (14일이 지나 가격을 숨겨도 콘텐츠 날짜가 바뀌지 않게)
    .replace(/<p class="(?:price-line|pt-won|pd-won|cc-won)[^"]*">[\s\S]*?<\/p>/g, '')
    .replace(/<span class="pshort[^"]*">[\s\S]*?<\/small><\/span>/g, '')
    .replace(/<span class="sb-t">[\s\S]*?<\/span>(?=<a)/g, '')
    .replace(/<p class="verdict[\s\S]*?<\/p>/g, '')
    .replace(/<svg class="chart"[\s\S]*?<\/svg>/g, '')
    .replace(/<section class="stats">[\s\S]*?<\/section>/g, '')
    .replace(/<section class="block drops">[\s\S]*?<\/section>/g, '')
    .replace(/\(\d+일 기록/g, '(# 기록')
    .replace(/[+-]?\d+(?:\.\d+)?%/g, '#%')
    .replace(/[\d,]+원/g, '#원')
    .replace(/\d+월 \d+일/g, '#')
    .replace(/\d+\.\d+ 확인/g, '# 확인')
    .replace(/ stale/g, '')
    .replace(/ · 오래된 가격/g, '');
  return createHash('sha1').update(main).digest('hex').slice(0, 16);
}
function writeText(path, text) {
  if (!path.endsWith('.html') || DEMO) return rawWrite(path, text);
  const canon = (text.match(/<link rel="canonical" href="([^"]*)">/) ?? [])[1];
  const url = canon?.startsWith(SITE_URL) ? canon.slice(SITE_URL.length) || '/' : null;
  if (!url || /<meta name="robots" content="noindex">/.test(text)) return rawWrite(path, text.replaceAll('%%UPD%%', TODAY).replaceAll('%%UPDL%%', TODAY.replaceAll('-', '.')));
  const h = contentKey(text);
  const old = prevState?.pages?.[url];
  const seed = (text.match(/data-seed="(\d{4}-\d\d-\d\d)"/) ?? [])[1];
  let d;
  if (old && old.h === h) d = old.d;
  else if (SEEDING) d = seed ?? TODAY;
  else {
    d = TODAY;
    state.pending.push({ url, kind: old ? 'updated' : 'new', d });
  }
  state.pages[url] = { h, d };
  pageDates[url] = d;
  rawWrite(path, text.replaceAll('%%UPD%%', d).replaceAll('%%UPDL%%', d.replaceAll('-', '.')));
}

// 빌드 버전: 배포된 페이지가 어느 커밋으로 만들어졌는지 하단과 /version.json 에 표시 (예전 사본을 보고 있는지 구분용)
const BUILD_COMMIT = (process.env.CF_PAGES_COMMIT_SHA || (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
})()).slice(0, 7);
const ASSET_V = createHash('md5').update(readFileSync(join(ROOT, 'src', 'style.css')) + readFileSync(join(ROOT, 'src', 'app.js'))).digest('hex').slice(0, 8); // CSS·JS 내용이 바뀌면 주소도 바뀐다(브라우저 캐시로 옛 CSS 를 쓰지 않게)
const BUILD_AT = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

const config = loadConfig();
const links = loadLinks();
const picks = readJson(join(ROOT, 'config', 'picks.json'), {});
// 초보 기준에 맞는 옵션으로 바꿀 쿠팡 상품 (config/variants.json): link 를 채우면 기존 링크·상품 정보를 대신한다
const variants = readJson(join(ROOT, 'config', 'variants.json'), {});
for (const [id, v] of Object.entries(variants)) {
  if (!v?.link) continue;
  links[id] = v.link;
  picks[id] = { ...picks[id], title: v.title ?? picks[id]?.title, price: v.price ?? null, image: v.image ?? picks[id]?.image, rocket: !!v.rocket, checked: v.checked ?? picks[id]?.checked };
}
const siteConf = readJson(join(ROOT, 'config', 'site.json'), {});
const VERIFY = [
  siteConf.googleVerification && `<meta name="google-site-verification" content="${siteConf.googleVerification}">`,
  siteConf.naverVerification && `<meta name="naver-site-verification" content="${siteConf.naverVerification}">`,
]
  .filter(Boolean)
  .join('\n');
const cats = config.categories;
const catName = Object.fromEntries(cats.map((c) => [c.id, c.name]));

// ---------- 유틸 ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const shortWon = (n) => (n >= 10000 ? `${+(n / 10000).toFixed(n >= 1e6 ? 0 : 1)}만` : `${Math.round(n / 1000)}천`);
const pct = (a, b) => ((a - b) / b) * 100;
const md = (d) => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
const addDays = (d, n) => new Date(Date.parse(d) + n * 86400e3).toISOString().slice(0, 10);

// ---------- 통계와 판단 ----------
function analyze(points) {
  const last = points.at(-1);
  const cur = last.low;
  const allMin = Math.min(...points.map((p) => p.low));
  const from30 = addDays(last.d, -30);
  const p30 = points.filter((p) => p.d >= from30);
  const avg30 = p30.reduce((s, p) => s + p.low, 0) / p30.length;
  const min30 = Math.min(...p30.map((p) => p.low));
  const prev7 = [...points].reverse().find((p) => p.d <= addDays(last.d, -7));
  const change7 = prev7 ? cur - prev7.low : null;

  let v;
  if (points.length < 7) {
    v = { cls: 'wait', label: '데이터 수집 중', text: `가격 기록이 ${points.length}일치라 아직 판단하기 이릅니다.` };
  } else if (cur <= allMin * 1.02) {
    v = { cls: 'good', label: '역대 최저가 근처', text: `기록된 최저가(${won(allMin)})와 2% 이내입니다. 사기 좋은 때예요.` };
  } else if (cur <= avg30 * 0.95) {
    v = { cls: 'good', label: '평소보다 저렴', text: `최근 30일 평균보다 ${Math.abs(pct(cur, avg30)).toFixed(1)}% 낮습니다.` };
  } else if (cur >= avg30 * 1.05) {
    v = { cls: 'bad', label: '평소보다 비쌈', text: `최근 30일 평균보다 ${pct(cur, avg30).toFixed(1)}% 높습니다. 조금 기다려 보세요.` };
  } else {
    v = { cls: 'mid', label: '평균 수준', text: `최근 30일 평균(${won(avg30)})과 비슷한 가격입니다.` };
  }
  return { cur, last, allMin, avg30, min30, change7, verdict: v, days: points.length };
}

// ---------- 가격 그래프 (SVG) ----------
function chart(points, allMin) {
  const pts = points.slice(-180);
  const W = 720, H = 260, L = 56, R = 16, T = 16, B = 32;
  const lows = pts.map((p) => p.low);
  let lo = Math.min(...lows), hi = Math.max(...lows);
  const pad = Math.max((hi - lo) * 0.12, hi * 0.01);
  lo -= pad; hi += pad;
  const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : (i / (pts.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.low).toFixed(1)}`).join('');
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${H - B}L${x(0).toFixed(1)},${H - B}Z`;
  const grid = [0, 0.5, 1].map((f) => {
    const v = lo + (hi - lo) * f;
    return `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${shortWon(v)}</text>`;
  });
  const xi = [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])];
  const xl = xi.map((i) => `<text class="axis" x="${x(i)}" y="${H - 10}" text-anchor="middle">${md(pts[i].d)}</text>`);
  const minY = y(allMin);
  const lastI = pts.length - 1;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${pts.length}일 최저가 추이">
${grid.join('')}
<path class="area" d="${area}"/>
<path class="line" d="${line}"/>
<line class="minline" x1="${L}" x2="${W - R}" y1="${minY}" y2="${minY}"/>
<text class="minlabel" x="${W - R}" y="${minY - 6}" text-anchor="end">역대 최저 ${won(allMin)}</text>
<circle class="dot" cx="${x(lastI)}" cy="${y(pts[lastI].low)}" r="4.5"/>
${xl.join('')}
</svg>`;
}

// ---------- 레이아웃 ----------
const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
function catIcon(c) {
  const e = entries.find((x) => x.p.category === c.id);
  const src = e && imageOf(e.p.id, e.hist);
  return src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" width="212" height="212">` : `<span>${esc(c.name.slice(0, 1))}</span>`;
}
function header() {
  const catLinks = cats
    .map((c) => `<a href="/c/${c.id}"><span class="ci">${catIcon(c)}</span>${esc(c.name)}<small>${entries.filter((e) => e.p.category === c.id).length}</small></a>`)
    .join('');
  return `<div class="util"><div class="wrap util-in"><span>${DISCLOSURE}</span><nav><a href="/about">운영 안내</a></nav></div></div>
${DEMO ? '<p class="demo">샘플 데이터로 만든 미리보기입니다. 표시된 가격은 실제 가격이 아닙니다.</p>' : ''}
<header class="hd"><div class="wrap hd-in">
<a class="logo" href="/" aria-label="${esc(SITE_NAME)} 홈"><span class="logo-emb">${LOGO_SVG}</span><span class="logo-txt"><span class="logo-name">${esc(SITE.logoBefore ?? '')}<b>${esc(SITE.logoAccent ?? SITE_NAME)}</b>${esc(SITE.logoAfter ?? '')}</span>${SITE.logoSub ? `<small class="logo-sub">${esc(SITE.logoSub)}</small>` : ''}</span></a>
<form class="search" action="/search" role="search" autocomplete="off">
<input type="search" name="q" id="q" placeholder="찾는 골프용품을 검색해 보세요 (예: 드라이버, 프로V1)" aria-label="골프용품 검색">
<button type="submit" aria-label="검색">${SEARCH_ICON}</button>
<div class="suggest" id="suggest" hidden></div>
</form>
<div class="hd-icons">
<button type="button" class="hd-ico" id="recentBtn"><span class="hd-ico-i"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>최근 본 상품<b id="recentCount"></b></button>
<a class="hd-ico" href="/#guides"><span class="hd-ico-i"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span>비교 가이드</a>
<div class="recent-panel" id="recentPanel" hidden></div>
</div>
</div></header>
<nav class="gnb"><div class="wrap gnb-in">
<div class="allcat"><button type="button" id="catBtn" aria-expanded="false">☰ 골프 카테고리</button><div class="catmenu" id="catMenu" hidden>${catLinks}</div></div>
<div class="quick">${cats
    .map((c) => {
      const rel = guidesFor(c.id);
      const sub = rel.length
        ? `<div class="qsub">${rel
            .map(
              (g) =>
                `<div class="qg"><a href="/g/${g.slug}"><span class="gender g-${esc(g.gender ?? '공용')}">${esc(g.gender && g.gender !== '공용' ? g.gender : '남녀공용')}</span><span class="qsub-t"><b>${esc(g.menuName ?? (g.gender && g.gender !== '공용' ? `${g.gender} ${c.name}` : c.name))}</b><small>${g.menuName ? '종류별 선택 비교법' : '비교 및 선택 가이드'}</small></span>${skillGroups(g).length ? '<i class="qarr">›</i>' : ''}</a>${
                  skillGroups(g).length
                    ? `<div class="qsub2"><p class="qsub2-h">${esc(g.gender && g.gender !== '공용' ? `${g.gender} ${c.name}` : c.name)} 실력별 비교</p>${skillGroups(g)
                        .map((s) => `<a href="${skillPath(g, s.skill)}"><span class="skill sk-${SKILLS.indexOf(s.skill) + 1}">${s.skill}</span><span class="qsub-t"><b>${s.skill}용 ${esc(c.name)}</b><small>${s.ids.length}종${levelRange(s.ids) ? ` · ${levelRange(s.ids)}` : ''}</small></span></a>`)
                        .join('')}${g.picks.some((pk) => pk.dist) ? `<a href="/g/${g.slug}#dist"><span class="skill sk-dist">비거리</span><span class="qsub-t"><b>비거리 비교 추천</b><small>실력별 비거리 순위</small></span></a>` : ''}</div>`
                    : ''
                }</div>`,
            )
            .join('')}<a href="/c/${c.id}" class="qsub-all">${esc(c.name)} 전체 비교 ›</a></div>`
        : '';
      return `<div class="qitem"><a href="/c/${c.id}">${esc(c.name)}</a>${sub}</div>`;
    })
    .join('')}</div>
</div></nav>`;
}

// 공유 미리보기 이미지(카카오톡·커뮤니티·SNS): 쿠팡 썸네일을 큰 크기(492)로
const bigImage = (src) => (src ? src.replace('/212x212ex/', '/492x492ex/') : '');
function ogImageFor(path) {
  if (path === '/jp' || path.startsWith('/jp/')) return ''; // 일본 정가 비교: 특정 상품 사진을 쓰지 않는다
  if (VS_OG[path]) return bigImage(imageOf(VS_OG[path], entryById[VS_OG[path]]?.hist));
  const m = path.match(/^\/p\/(.+)$/);
  if (m) return bigImage(imageOf(m[1], entryById[m[1]]?.hist));
  const g = pageGuides.find((x) => path === `/g/${x.slug}` || path.startsWith(`/g/${x.slug}-`));
  const skill = g && Object.entries(SKILL_EN).find(([, en]) => path === `/g/${g.slug}-${en}`)?.[0];
  const top = g ? (skill ? rankedPicks(g).find((pk) => pk.skill === skill) : rankedPicks(g)[0]) : null;
  if (top) return bigImage(imageOf(top.id, byId[top.id]?.hist));
  if (path === '/qa' || path.startsWith('/qa/')) return ''; // 초보 Q&A: 특정 상품 사진을 쓰지 않는다
  const c = cats.find((x) => path === `/c/${x.id}`);
  const first = c ? pageGuides.find((x) => guideCat(x)?.id === c.id) : pageGuides[0];
  const pk = first && rankedPicks(first)[0];
  return pk ? bigImage(imageOf(pk.id, byId[pk.id]?.hist)) : '';
}
function layout({ title, desc, path, body, recent, ld = [], raw = false }) {
  const full = raw || title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;
  const ogImg = ogImageFor(path);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="build" content="${BUILD_COMMIT} ${BUILD_AT}">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE_URL}${path}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}${path}">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:locale" content="ko_KR">
${ogImg ? `<meta property="og:image" content="${esc(ogImg)}">\n<meta property="og:image:width" content="492">\n<meta property="og:image:height" content="492">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
${DEMO ? '<meta name="robots" content="noindex">' : path === '/' ? VERIFY : ''}
<link rel="stylesheet" href="/assets/style.css?v=${ASSET_V}">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
${header()}
<main class="wrap"${recent ? ` data-recent="${esc(JSON.stringify(recent))}"` : ''}>
${body}
</main>
<footer class="wrap foot">
<p>${DISCLOSURE}</p>
<p>${PRICE_NOTE} 구매 전 판매 페이지에서 가격과 옵션을 꼭 확인하세요.</p>
<p>점수는 이 사이트의 주관적인 참고 점수이며 공식 평가가 아닙니다. 상품 이미지는 쿠팡 파트너스가 제공하는 이미지입니다.</p>
<p class="family"><a href="/qa">골프 초보 Q&amp;A</a> · 함께 운영하는 사이트: <a href="https://techprice.unclepony.com/">ATL테크기어 — 전자기기 비교</a> · <a href="https://youtubeking.unclepony.com/">유튜브킹 — 유튜브 조회수 순위</a> · <a href="https://homeprice.unclepony.com/">ATL홈기어 — 생활가전 비교</a></p>
<p class="build">사이트 버전 ${BUILD_AT} (KST) · ${BUILD_COMMIT || 'local'}</p>
</footer>
<script src="/assets/app.js?v=${ASSET_V}" defer></script>
</body>
</html>
`;
}

// 구조화 데이터 (리뷰·평점 스키마는 직접 사용 리뷰가 아니므로 넣지 않는다)
const crumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE_URL}${path}` })),
});
const listLd = (name, ids) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name,
  numberOfItems: ids.length,
  itemListElement: ids.map((id, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/p/${id}`, name: config.products.find((p) => p.id === id)?.name })),
});
const ymd = (d) => (d ? d.replaceAll('-', '.') : '');
// 날짜는 페이지를 쓸 때 본문 지문으로 정한다 (d 는 처음 기록할 때의 씨앗)
const updatedTag = (d) => `<p class="updated"${d ? ` data-seed="${d}"` : ''}>마지막 업데이트 <time datetime="%%UPD%%">%%UPDL%%</time></p>`;
const max2 = (...ds) => ds.filter(Boolean).sort().at(-1);
const imageOf = (id, hist) => hist?.latest?.image ?? picks[id]?.image;
// 확인일 기준 쿠팡 판매가 (API 가격 기록이 있으면 그 값을 우선)
const PRICE_DATE = SITE.priceCheckedAt ?? '';
const priceDateLabel = PRICE_DATE ? `${+PRICE_DATE.slice(5, 7)}.${+PRICE_DATE.slice(8, 10)}` : '';
const pickPrice = (id) => picks[id]?.price ?? null;
const BUILD_DAY = todayKst();
const PRICE_STALE_DAYS = NOTICES.priceStaleDays ?? 14; // 확인한 지 이보다 오래된 가격은 숨기고 '현재 가격 보기' 버튼만 보여 준다
const dayLabel = (d) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const daysAgo = (d) => Math.round((Date.parse(BUILD_DAY) - Date.parse(d)) / 864e5);
// 보여 줄 가격: 가격 이력(data/history: 직접 입력·API)과 링크 생성 때 확인한 판매가 중 가장 최근 것
const SRC_LABEL = { api: '최근 최저가', manual: '쿠팡 판매가', link: '쿠팡 판매가' };
function shownPrice(id) {
  if (!links[id] && !entryById[id]?.hist?.latest?.link) return null;
  const last = entryById[id]?.hist?.points?.at(-1);
  const pk = picks[id];
  const snap = pk?.price ? { won: pk.price, d: pk.checked ?? PRICE_DATE, kind: 'link' } : null;
  const hist = last ? { won: last.low, d: last.d, kind: last.src ?? 'api', allMin: entryById[id]?.a?.allMin } : null;
  if (hist && (!snap || hist.d >= snap.d)) return hist;
  return snap;
}
// 화면에 보여도 되는 가격 (확인한 지 PRICE_STALE_DAYS 이내)
const freshPrice = (id) => {
  const sp = shownPrice(id);
  return sp && daysAgo(sp.d) <= PRICE_STALE_DAYS ? sp : null;
};
function priceLine(id, cls = 'price-line') {
  const sp = freshPrice(id);
  if (!sp) return !shownPrice(id) && extOf(id) ? `<p class="${cls} none"><small>쿠팡 판매처 없음 · 가격 정보 없음</small></p>` : '';
  return `<p class="${cls}"><b>${won(sp.won)}</b><small>${SRC_LABEL[sp.kind] ?? '쿠팡 판매가'} · ${dayLabel(sp.d)} 확인 · 현재 가격과 다를 수 있음</small></p>`;
}
const priceShort = (id) => {
  const sp = freshPrice(id);
  return sp ? `<span class="pshort">${won(sp.won)}<small>${+sp.d.slice(5, 7)}.${+sp.d.slice(8, 10)} 확인</small></span>` : '';
};
// 가격 단계: 아이템(카테고리)별 가격 구간(priceBands) 기준 저가·중가·고가·프리미엄 (숫자 가격은 표시하지 않음)
const LEVELS = ['', '저가', '중가', '고가', '프리미엄'];
const SKILLS = ['초심자', '중급', '고급', '프로'];
function priceLevel(id) {
  const p = pickPrice(id);
  const prod = config.products.find((x) => x.id === id);
  const bands = cats.find((c) => c.id === prod?.category)?.priceBands;
  if (!p || !bands) return null;
  const n = p < bands[0] ? 1 : p < bands[1] ? 2 : p < bands[2] ? 3 : 4;
  return { n, label: LEVELS[n], marks: '₩'.repeat(n) };
}
const skillOf = (id) => {
  for (const g of guides) {
    const pk = g.picks.find((x) => x.id === id);
    if (pk?.skill) return pk.skill;
  }
  return null;
};
const skillBadge = (id) => {
  const s = skillOf(id);
  return s ? `<span class="skill sk-${SKILLS.indexOf(s) + 1}">${s}</span>` : '';
};
const levelBadge = (id) => {
  const lv = priceLevel(id);
  return lv ? `<span class="lvl lvl-${lv.n}"><i>${lv.marks}</i>${lv.label}</span>` : '';
};
// 가격 수준 + 쿠팡 링크
// 쿠팡에 없는 상품: 공식몰 등 다른 판매처 일반 링크(제휴 아님)
// 쿠팡으로 나가는 주소: 클릭 추적(config/site.json clickTracking)을 켜면 /go/{상품ID} 를 거친다 (Pages Functions 가 클릭 수만 세고 302 이동)
const CLICK_TRACKING = SITE.clickTracking === true && !process.argv.includes('--demo');
const rawLink = (id) => links[id] ?? entryById[id]?.hist?.latest?.link ?? null;
const outHref = (id) => (rawLink(id) ? (CLICK_TRACKING ? `/go/${encodeURIComponent(id)}` : rawLink(id)) : null);
const extOf = (id) => config.products.find((x) => x.id === id)?.external ?? null;
function levelLink(id, hist, extra = '쿠팡에서 가격 보기 ›') {
  const lv = priceLevel(id);
  const link = outHref(id);
  const ext = extOf(id);
  if (!link && ext) {
    return `<a class="lvl-link" href="${esc(ext.url)}" target="_blank" rel="nofollow noopener"><span class="lvl lvl-0">${lv ? `<i>${lv.marks}</i>${lv.label}` : '공식몰 확인'}</span><small>${esc(ext.store)} ›</small></a>`;
  }
  if (!lv) return '';
  const inner = `<span class="lvl lvl-${lv.n}"><i>${lv.marks}</i>${lv.label}</span>${link ? `<small>${extra}</small>` : ''}`;
  return link ? `<a class="lvl-link" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener">${inner}</a>` : `<span class="lvl-link">${inner}</span>`;
}
function priceTag(id, a, cls = 'pt-price') {
  const b = skillBadge(id) + levelBadge(id);
  return b ? `<p class="${cls} tierline">${b}</p>` : '';
}

// ---------- 투어·뉴스 소식, 설명 그림 ----------
const news = readJson(join(ROOT, 'config', 'news.json'), {});
const NEWS_NOTE = '선수 사용 정보는 보도 시점 기준이며, 선수의 장비는 대회마다 바뀔 수 있습니다. 해당 선수가 이 사이트나 판매 상품을 추천하는 것은 아닙니다.';
function newsBlock(id, heading = 'h2') {
  const items = news[id];
  if (!items?.length) return '';
  return `<section class="news"><${heading}>투어·뉴스 소식</${heading}><ul>${items
    .map(
      (n) =>
        `<li>${esc(n.text)} <a class="src" href="${esc(n.url)}" target="_blank" rel="nofollow noopener">출처: ${esc(n.source)}, ${esc(n.date)}</a></li>`,
    )
    .join('')}</ul><p class="note">${NEWS_NOTE}</p></section>`;
}
const FIGURE_BY_CATEGORY = { driver: 'driver-loft', putter: 'putter-shapes', ball: 'ball-layers', shoes: 'shoe-soles', rangefinder: 'slope' };
const figCache = {};
function figure(category) {
  const name = FIGURE_BY_CATEGORY[category];
  if (!name) return '';
  figCache[name] ??= readFileSync(join(ROOT, 'src', 'figures', `${name}.svg`), 'utf8');
  return `<figure class="fig">${figCache[name]}</figure>`;
}

function buyButton(id, hist) {
  const link = outHref(id);
  const ext = extOf(id);
  if (!link && ext) {
    return `<p class="linked">판매처: ${esc(ext.store)} (쿠팡에 국내 정품 판매가 없어 다른 판매처로 연결합니다)</p>
<a class="btn ext" href="${esc(ext.url)}" target="_blank" rel="nofollow noopener">${esc(ext.store)}에서 가격·재고 보기</a>
<p class="note">위 버튼은 제휴 링크가 아니며, 이 사이트는 이 링크로 수수료를 받지 않습니다. 가격·재고는 판매처에서 확인하세요.</p>`;
  }
  if (!link) return '';
  const linked = links[id] ? picks[id]?.title : hist?.latest?.title;
  return `${linked ? `<p class="linked">연결 상품: ${esc(linked)}</p>` : ''}
<a class="btn" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener">쿠팡에서 현재 가격 보기</a>
<p class="note">위 버튼은 쿠팡 파트너스 링크입니다.</p>`;
}

function card({ p, hist, a }) {
  const image = imageOf(p.id, hist);
  const img = image
    ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="212" height="212">`
    : `<span class="ph">${esc(catName[p.category]?.slice(0, 1) ?? '⛳')}</span>`;
  let info;
  if (a) {
    const ch =
      a.change7 == null || a.change7 === 0
        ? ''
        : `<span class="${a.change7 < 0 ? 'down' : 'up'}">${a.change7 < 0 ? '▼' : '▲'} ${won(Math.abs(a.change7))} (7일)</span>`;
    info = `<span class="badge ${a.verdict.cls}">${a.verdict.label}</span>
<h3>${esc(p.name)}</h3>
<p class="price">${won(a.cur)}</p>
<p class="meta">${ch}</p>`;
  } else {
    info = `<span class="badge wait">구매 가이드</span>
<h3>${esc(p.name)}</h3>
<p class="meta">${esc(p.points?.[0] ?? '')}</p>`;
  }
  return `<a class="card" href="/p/${p.id}"><div class="thumb">${img}</div><div class="info">${info}</div></a>`;
}

const grid = (items) => `<div class="grid">${items.map(card).join('')}</div>`;

// ---------- 쿠팡 링크 비율 검사 (60% 이상 유지) ----------
{
  const total = config.products.length;
  const coupang = config.products.filter((p) => links[p.id]).length;
  const ratio = coupang / total;
  console.log(`쿠팡 링크 상품 ${coupang}/${total} (${(ratio * 100).toFixed(1)}%)`);
  if (ratio < 0.6) {
    console.error('쿠팡 링크 상품 비율이 60% 미만입니다. 쿠팡 상품을 늘리거나 다른 판매처 상품을 줄이세요.');
    process.exit(1);
  }
}

// ---------- 데이터 읽기 ----------
const dir = historyDir(DEMO);
const entries = config.products.map((p) => {
  const hist = readJson(join(dir, `${p.id}.json`));
  return { p, hist, a: hist?.points?.length ? analyze(hist.points) : null };
});
const tracked = entries.filter((e) => e.a);
const entryById = Object.fromEntries(entries.map((e) => [e.p.id, e]));
const updated = tracked.map((e) => e.a.last.d).sort().at(-1) ?? todayKst();

rmSync(OUT, { recursive: true, force: true });
writeText(join(OUT, 'assets', 'style.css'), readFileSync(join(ROOT, 'src', 'style.css'), 'utf8'));
writeText(join(OUT, 'assets', 'app.js'), readFileSync(join(ROOT, 'src', 'app.js'), 'utf8'));
writeText(join(OUT, 'assets', 'logo.svg'), readFileSync(join(ROOT, 'src', 'figures', 'logo.svg'), 'utf8'));

// ---------- 비교·추천 가이드 데이터와 타일 ----------
const guides = readJson(join(ROOT, 'config', 'guides.json'), { guides: [] }).guides;
for (const g of guides) for (const pk of g.picks) if (variants[pk.id]?.link && variants[pk.id].specs) pk.specs = variants[pk.id].specs;
// 출시 칸 형식 검사: 'YYYY년' 또는 빈 값 (모르는 연도는 지어내지 않고 비워 둔다)
{
  const bad = guides.flatMap((g) => releaseIssues(g).map((r) => `  ${g.slug} · ${r.id}: "${r.value}"`));
  if (bad.length) {
    console.error(`출시 칸은 "YYYY년" 형식이거나 비워 두어야 합니다:\n${bad.join('\n')}`);
    process.exit(1);
  }
}
const byId = Object.fromEntries(entries.map((e) => [e.p.id, e]));
const SCORE_NOTE = NOTICES.score;
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const dots = (n) => `<span class="dots" aria-label="5점 중 ${n}점">${'●'.repeat(n)}<i>${'●'.repeat(5 - n)}</i></span>`;
function guideTile(g) {
  const imgs = rankedPicks(g).map((pk) => imageOf(pk.id, byId[pk.id].hist)).filter(Boolean).slice(0, 4);
  return `<a class="gcard" href="/g/${g.slug}">
<div class="gthumb">${imgs.map((src) => `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" width="212" height="212">`).join('')}</div>
<div class="ginfo"><span class="badge good">${rankedPicks(g).length}종 비교</span><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p></div>
</a>`;
}
const guideGrid = (list) => `<div class="ggrid">${list.map(guideTile).join('')}</div>`;

const shortTitle = (t) => t.split(':')[0].trim();
// 쿠팡 링크(또는 API 기록 링크)가 있는 상품만 순위·대표 모델·실력별 페이지에 넣는다. 공식몰만 있는 상품은 '판매처 없음' 참고 목록으로
const sellable = (id) => !!(links[id] ?? byId[id]?.hist?.latest?.link);
// 다른 가이드에 합쳐진 가이드(mergeInto)는 따로 페이지를 만들지 않는다
const pageGuides = guides.filter((g) => !g.mergeInto);
// 초보 Q&A 글 (content/qa, src/qa.mjs): 검사를 통과한 글만 게시하고, 관련 가이드 페이지에서 연결한다
const QA = loadQa(new Set(pageGuides.map((g) => g.slug)));
if (QA.bad.length) console.warn(`경고: 게시하지 않은 초보 Q&A 글 ${QA.bad.length}편\n${QA.bad.map((x) => `  ${x}`).join('\n')}`);
// 유튜브 관련 영상 (config/videos.json ← node src/videos-sync.mjs): 공개된 영상만, 클릭하면 그때 유튜브 플레이어를 불러온다
const VIDEOS = readJson(join(ROOT, 'config', 'videos.json'), {});
{
  const bad = videoIssues(VIDEOS, new Set(pageGuides.map((g) => g.slug)));
  if (bad.length) console.warn(`경고: config/videos.json 형식 문제 ${bad.length}건 (해당 영상은 그대로 두고 빌드 계속)\n${bad.map((x) => `  ${x}`).join('\n')}`);
}
function videoBlock(g) {
  const list = publicVideos(VIDEOS[g.slug]).filter((v) => isVideoId(v.id) && v.title);
  if (!list.length) return '';
  const card = (v) => {
    const sh = isShorts(v);
    const url = sh ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
    return `<figure class="vcard${sh ? ' vshort' : ''}"><a class="vplay" href="${url}" data-yt="${esc(v.id)}" target="_blank" rel="noopener" aria-label="${esc(v.title)} 영상 재생"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" width="480" height="360"><span class="vbtn" aria-hidden="true"></span>${sh ? '<span class="vtag">쇼츠</span>' : ''}</a><figcaption><a href="${url}" target="_blank" rel="noopener">${esc(v.title)}</a></figcaption></figure>`;
  };
  const long = list.filter((v) => !isShorts(v));
  const shorts = list.filter(isShorts);
  return `<section id="videos" class="videos"><h2>관련 영상 <small>ATL골프기어 유튜브</small></h2>${long.length ? `<div class="vgrid">${long.map(card).join('')}</div>` : ''}${shorts.length ? `<div class="vgrid vgrid-s">${shorts.map(card).join('')}</div>` : ''}${SITE.youtube ? `<a class="more-link" href="${esc(SITE.youtube)}" target="_blank" rel="noopener">유튜브 채널에서 더 보기 ›</a>` : ''}</section>`;
}
const mergedInto = (g) => guides.filter((m) => m.mergeInto === g.slug);
// 실력 단계가 다른 제품끼리는 한 줄로 세우지 않는다: 같은 단계 안에서의 순위만 쓴다
const skillIdx = (pk) => (pk.skill ? SKILLS.indexOf(pk.skill) : 9);
const totalScore = (pk) => (pk.scores?.length ? avg(pk.scores) : 0);
function stageRank(g, id) {
  const pk = g.picks.find((x) => x.id === id);
  if (!pk || !sellable(id)) return null;
  if (warned(g, pk)) return { r: null, n: 0, skill: pk.skill ?? null, warn: true, label: '옵션 확인 필요' };
  const same = rankedPicks(g).filter((x) => (x.skill ?? null) === (pk.skill ?? null) && !warned(g, x));
  const r = same.findIndex((x) => x.id === id) + 1;
  return { r, n: same.length, skill: pk.skill ?? null, label: pk.skill ? `${pk.skill} 추천 ${r}위` : `${same.length}종 중 ${r}위` };
}
// 남녀 공용 표시: 여성 가이드에 넣은 남성용·공용 사양
const unisexBadge = (pk) => (pk?.unisex ? '<span class="tag unisex">남녀 공용 추천</span>' : '');
// 출시 연도(사양 행 '출시' 또는 '세대')
function yearOf(g, pk) {
  const i = (g.specRows ?? []).findIndex((r) => /출시|세대/.test(r));
  const m = i >= 0 ? String(pk.specs?.[i] ?? '').match(/(20\d\d)/) : null;
  return m ? +m[1] : null;
}
const CUR_YEAR = +todayKst().slice(0, 4);
// 상품별 최고 편집 점수 (가이드 점수 중 가장 높은 값)
const scoreOf = {};
for (const g of guides) for (const pk of g.picks) if (pk.scores?.length) scoreOf[pk.id] = Math.max(scoreOf[pk.id] ?? 0, avg(pk.scores));
// 가이드 안 상품을 종합 점수 순으로
// 동점이면 첫 비교 항목 점수가 높은 제품, 그래도 같으면 쿠팡 판매가가 낮은 제품을 앞에 둔다
// 초보 기준(로프트·샤프트)에 맞지 않는 연결 상품은 '옵션 확인 필요'로 순위에서 빼고 목록 뒤로 보낸다 (config/variants.json 으로 권장 옵션이 들어오면 자동으로 순위에 돌아온다)
const warned = (g, pk) => issuesOf(g, pk).length > 0;
const rankedPicks = (g) =>
  g.picks
    .filter((pk) => byId[pk.id] && sellable(pk.id))
    .sort((x, y) => warned(g, x) - warned(g, y) || totalScore(y) - totalScore(x) || (y.scores?.[tieIdx(g)] ?? 0) - (x.scores?.[tieIdx(g)] ?? 0) || (pickPrice(x.id) ?? 9e9) - (pickPrice(y.id) ?? 9e9));
// 동점 기준 항목: 쉬움 계열 항목(쉬움·초보 적합·관용성·정렬·가벼움)이 있으면 그것, 없으면 첫 항목
function tieIdx(g) {
  const c = g.criteria ?? [];
  for (const re of [/쉬움|초보 적합/, /관용성|정렬|방향/, /가벼움/]) {
    const i = c.findIndex((x) => re.test(x));
    if (i >= 0) return i;
  }
  return 0;
}
// 표 안 정렬: 실력 단계 순 → 단계 안 점수 순
const stagedPicks = (g) => [...rankedPicks(g)].sort((x, y) => skillIdx(x) - skillIdx(y)); // 단계 안에서는 rankedPicks 순서(순위 → 옵션 확인 필요) 유지
// 실력 단계별 대표(1위): 남녀 공용으로 끌어온 모델보다 해당 가이드 전용 모델을 우선
const stageTop = (g, skill) => {
  const ps = rankedPicks(g).filter((pk) => pk.skill === skill);
  return ps.find((pk) => !pk.unisex && !warned(g, pk)) ?? ps.find((pk) => !warned(g, pk)) ?? ps[0];
};
// 쿠팡 판매처가 없는 참고 모델
const offerless = (g) => g.picks.filter((pk) => byId[pk.id] && !sellable(pk.id));
// 가격대: 가이드 안에서 가장 싼 상품 대비 상대 비교 (2026-10 쿠팡 판매가 기준)
function priceTier(g, id) {
  const prices = g.picks.map((pk) => picks[pk.id]?.price).filter(Boolean);
  const p = picks[id]?.price;
  if (!p || !prices.length) return '';
  const r = p / Math.min(...prices);
  return '₩'.repeat(r <= 1.3 ? 1 : r <= 2 ? 2 : r <= 3 ? 3 : 4);
}
// 비교 인포그래픽 표: 제품을 열로, 비교 항목을 행으로
function infographic(g, highlight, opts = {}) {
  // 비교 대상이 많으면(8종 초과) 전체 표 대신 실력 단계별 1위(대표 모델)만 보여 주고, 전체는 수준별 탭·실력별 페이지에서 본다
  const hlSkill = highlight && g.picks.length > 8 ? g.picks.find((pk) => pk.id === highlight)?.skill : null;
  if (hlSkill && !opts.ids) opts = { ...opts, ids: g.picks.filter((pk) => pk.skill === hlSkill).map((pk) => pk.id), title: `${hlSkill} ${shortTitle(g.title)}` };
  const many = !opts.ids && g.picks.length > 8 && g.picks.some((pk) => pk.skill);
  const reps = many ? SKILLS.map((s) => stageTop(g, s)).filter(Boolean) : null;
  if (many) opts = { ...opts, title: opts.title ?? `${shortTitle(g.title)} · 실력별 대표 모델` };
  const ps0 = reps ?? (opts.ids ? stagedPicks(g).filter((pk) => opts.ids.includes(pk.id)) : stagedPicks(g));
  const ps = opts.byPrice ? [...ps0].sort((x, y) => (priceLevel(x.id)?.n ?? 9) - (priceLevel(y.id)?.n ?? 9)) : ps0;
  const crit = g.criteria ?? [];
  const col = (pk, i) => {
    const { p, hist } = byId[pk.id];
    const image = imageOf(p.id, hist);
    return `<th class="${pk.id === highlight ? 'hl' : ''}"><a href="/p/${p.id}">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="212" height="212">` : `<span class="noimg">${esc(catName[p.category] ?? '')}<small>${esc(extOf(p.id)?.store ?? '')}</small></span>`}<span class="ig-rank">${esc(stageRank(g, pk.id)?.label ?? '')}</span><b>${esc(p.name)}</b><span class="ig-role">${esc(pk.role)}</span>${unisexBadge(pk)}</a></th>`;
  };
  const row = (icon, label, cell, cls = '') =>
    `<tr class="${cls}"><th scope="row">${label}</th>${ps.map((pk) => `<td class="${pk.id === highlight ? 'hl' : ''}">${cell(pk)}</td>`).join('')}</tr>`;
  return `<div class="ig-wrap"><div class="ig-head"><p class="ig-kicker">${esc(SITE_NAME)} 비교표</p><h3>${esc(opts.title ?? shortTitle(g.title))} <span>${reps ? `전체 ${rankedPicks(g).length}종 · 실력 단계별 추천 1위` : `${ps.length}종 한눈에 비교`}</span></h3></div>
<div class="tablewrap ig-scroll"><table class="ig" style="min-width:${150 + ps.length * 150}px"><thead><tr><th class="ig-corner"></th>${ps.map(col).join('')}</tr></thead><tbody>
${ps.some((pk) => pk.dist) ? row('', '비거리', (pk) => (pk.dist ? `<b class="ig-total">${pk.dist}<small>/10</small></b><span class="bar dist"><i style="width:${pk.dist * 10}%"></i></span>` : '-')) : ''}
${row('', '편집 점수', (pk) => (pk.scores ? `<b class="ig-total">${avg(pk.scores).toFixed(1)}</b><span class="bar"><i style="width:${(avg(pk.scores) / 5) * 100}%"></i></span>` : '-'), 'r-total')}
${row('', '실력·가격대', (pk) => `<span class="tierline">${pk.skill ? `<span class="skill sk-${SKILLS.indexOf(pk.skill) + 1}">${pk.skill}</span>` : skillBadge(pk.id)}${levelBadge(pk.id)}</span>`)}
${row('', '한마디', (pk) => `<b class="ig-short">${esc(pk.short ?? pk.role)}</b>`)}
${(g.specRows ?? []).map((label, si) => row('', esc(label.replace('연결 상품 ', '')), (pk) => `<span class="ig-spec">${esc(pk.specs?.[si] || '-')}</span>`)).join('')}
${ps.some((pk) => issuesOf(g, pk).length) ? row('', '확인할 점', (pk) => issuesOf(g, pk).map((x) => `<span class="tag warn">${esc(x.msg)}</span>`).join('') || '-') : ''}
${row('', '강점', (pk) => `<span class="ig-plus">${esc(pk.plus ?? pk.pros?.[0] ?? '-')}</span>`)}
${row('', '약점', (pk) => `<span class="ig-minus">${esc(pk.minus ?? pk.cons?.[0] ?? '-')}</span>`)}
${crit.length ? row('', '항목별', (pk) => (pk.scores ? `<span class="ig-crits">${crit.map((c, i) => `<span><em>${esc(c.split('·')[0])}</em>${dots(pk.scores[i])}</span>`).join('')}</span>` : '-')) : ''}
${row('', '가격', (pk) => `${levelBadge(pk.id)}${priceShort(pk.id)}${buyBtn(pk.id, 'btn xs')}`, 'r-price')}
</tbody></table></div>
${reps ? `<p class="ig-more">${skillGroups(g).map((x) => `<a href="${skillPath(g, x.skill)}"><span class="skill sk-${SKILLS.indexOf(x.skill) + 1}">${x.skill}</span> ${x.ids.length}종 전체 비교 ›</a>`).join('')}</p>` : ''}${reps ? oldModelNote(g, reps) : ''}<p class="note">점수는 주관적 참고 점수(공식 평가 아님) · 순위는 같은 실력 단계 안에서만 매깁니다 · 가격은 링크 생성 시 확인한 쿠팡 판매가로 현재 가격과 다를 수 있음 · 버튼은 쿠팡 파트너스 링크</p></div>`;
}
// 수준별 비교: 실력(초심자·중급·고급·프로) / 가격(저가·중가·고가·프리미엄) 탭으로 나눠 비교
let tierSeq = 0;
function tierCompare(g) {
  const ps = rankedPicks(g);
  const short = shortTitle(g.title);
  const groups = [];
  if (ps.some((pk) => pk.skill)) groups.push({ name: '실력별', items: SKILLS.map((s) => ({ label: s, ids: ps.filter((pk) => pk.skill === s).map((pk) => pk.id) })).filter((it) => it.ids.length) });
  groups.push({ name: '가격별', items: LEVELS.slice(1).map((l) => ({ label: l, ids: ps.filter((pk) => priceLevel(pk.id)?.label === l).map((pk) => pk.id) })) });
  const all = groups.flatMap((gr) => gr.items.map((it) => ({ ...it, group: gr.name })));
  const first = all.find((it) => it.ids.length);
  const key = `t${++tierSeq}`;
  const btn = (it) => {
    const id = `${key}-${it.group}-${it.label}`;
    return `<button type="button" class="tab${it === first ? ' on' : ''}" data-tab="${esc(id)}"${it.ids.length ? '' : ' disabled'}>${esc(it.label)} <small>${it.ids.length}</small></button>`;
  };
  return `<section class="tiers tabs-wrap"><h2>수준별 비교 <small>실력과 가격대로 나눠 보기</small></h2>
${groups.map((gr) => `<div class="tier-row"><span class="tier-gname">${gr.name}</span><div class="tabs" role="tablist">${gr.items.map((it) => btn(all.find((a) => a.group === gr.name && a.label === it.label))).join('')}</div></div>`).join('')}
${all
  .filter((it) => it.ids.length)
  .map((it) => `<div class="tabpanel${it === first ? ' on' : ''}" data-panel="${esc(`${key}-${it.group}-${it.label}`)}">${infographic(g, null, { ids: it.ids, title: `${it.label} ${short}` })}</div>`)
  .join('')}
</section>`;
}
const guidesFor = (catId) => pageGuides.filter((g) => g.picks.some((pk) => byId[pk.id]?.p.category === catId));
const genderLabel = (g, c) => (g.gender && g.gender !== '공용' ? `${g.gender} ${c.name} 비교` : `${c.name} 비교`);
const guideCat = (g) => cats.find((c) => c.id === byId[g.picks[0]?.id]?.p.category);
const guideName = (g) => {
  const c = guideCat(g);
  if (g.menuName) return g.menuName;
  return `${g.gender && g.gender !== '공용' ? `${g.gender} ` : ''}${c?.name ?? ''} 비교 및 선택 가이드`;
};
// 웨지 그라인드 비교 (guides.json 의 grinds·matrix): 솔 모양은 직접 그린 개념도
function soleSvg(gr) {
  const h = 10 + gr.sole * 5;
  const y = 8;
  const rel = gr.relief ?? '';
  return `<svg class="sole" viewBox="0 0 124 ${y + h + 6}" role="img" aria-label="${esc(gr.name)} 솔 모양 개념도">
<path class="sole-base" d="M6,${y} L118,${y} Q122,${y} 120,${y + h * 0.55} Q114,${y + h} 62,${y + h} Q12,${y + h} 6,${y + h * 0.55} Z"/>
${rel.includes('trail') ? `<path class="sole-cut" d="M24,${y + h * 0.72} Q62,${y + h * 0.82} 100,${y + h * 0.72} L104,${y + h * 0.9} Q62,${y + h + 1} 20,${y + h * 0.9} Z"/>` : ''}
${rel.includes('heel') ? `<path class="sole-cut" d="M6,${y + h * 0.3} L26,${y + h} L6,${y + h} Z"/>` : ''}
${rel.includes('toe') ? `<path class="sole-cut" d="M120,${y + h * 0.3} L98,${y + h} L122,${y + h} Z"/>` : ''}
<line class="sole-le" x1="6" y1="${y}" x2="118" y2="${y}"/><text x="4" y="${y + h + 5}" class="sole-tx">힐</text><text x="110" y="${y + h + 5}" class="sole-tx">토</text></svg>`;
}
function grindCompare(g) {
  if (!g.grinds?.length) return '';
  const gs = g.grinds;
  const row = (icon, label, cell) => `<tr><th scope="row">${label}</th>${gs.map((gr) => `<td>${cell(gr)}</td>`).join('')}</tr>`;
  const meter = (n) => `<span class="meter">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const m = g.matrix;
  return `<section id="grind" class="grind"><div class="ig-wrap"><div class="ig-head"><p class="ig-kicker">${esc(SITE_NAME)} 비교표</p><h3>그라인드별 비교 <span>${gs.length}종 한눈에 보기</span></h3></div>
<div class="tablewrap ig-scroll"><table class="ig grind-t"><thead><tr><th class="ig-corner"></th>${gs.map((gr) => `<th><span class="gk">${esc(gr.k)}</span>${soleSvg(gr)}<b>${esc(gr.name)}</b></th>`).join('')}</tr></thead><tbody>
${row('🎯', '추천 실력', (gr) => `<span class="skill sk-${SKILLS.indexOf(gr.skill) + 1}">${esc(gr.skill)}</span>`)}
${row('📏', '바운스', (gr) => `${meter(gr.b)}<small class="ig-spec">${esc(gr.bounce)}</small>`)}
${row('🪶', '솔 폭', (gr) => meter(gr.sole))}
${row('🔓', '페이스 열기', (gr) => meter(gr.open))}
${row('📐', '대표 로프트', (gr) => `<span class="ig-spec">${esc(gr.lofts)}</span>`)}
${row('🏌️', '스윙 유형', (gr) => `<b class="ig-short">${esc(gr.swing)}</b>`)}
${row('🌱', '잔디·벙커', (gr) => `<span class="ig-spec">${esc(gr.turf)}</span>`)}
${row('💬', '이럴 때', (gr) => `<span class="ig-plus">${esc(gr.use)}</span>`)}
</tbody></table></div>
<p class="note">솔 모양은 이해를 돕기 위해 직접 그린 개념도이며 실제 형상과 다릅니다 · 바운스는 세대·로프트마다 달라 대표값입니다 · 정확한 스펙은 공식몰 확인</p></div>
${m ? `<h3 class="grind-mh">내 스윙 × 잔디 조건으로 고르기</h3><div class="tablewrap"><table class="grind-m"><thead><tr><th></th>${m.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${m.rows.map((r) => `<tr><th scope="row">${esc(r.h)}</th>${r.v.map((v) => `<td><b>${esc(v)}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
<div class="grind-cards">${gs.map((gr) => `<div><span class="gk">${esc(gr.k)}</span><b>${esc(gr.name)}</b><p>${esc(gr.desc)}</p></div>`).join('')}</div></section>`;
}

// 실력 단계별 비교 페이지 (/g/{slug}-{beginner|intermediate|advanced|pro})
const SKILL_EN = { 초심자: 'beginner', 중급: 'intermediate', 고급: 'advanced', 프로: 'pro' };
const skillPath = (g, s) => `/g/${g.slug}-${SKILL_EN[s]}`;
const MIN_SKILL_PAGE = 3; // 이보다 적으면 실력별 페이지를 만들지 않고 상위 가이드로 보낸다
const skillGroupsAll = (g) => SKILLS.map((skill) => ({ skill, ids: g.picks.filter((pk) => pk.skill === skill && byId[pk.id] && sellable(pk.id)).map((pk) => pk.id) }));
const skillGroups = (g) => (g.mergeInto ? [] : skillGroupsAll(g).filter((x) => x.ids.length >= MIN_SKILL_PAGE));
// 메뉴·칩에 쓰는 가격대 범위 문구 (데이터에서 계산)
function levelRange(ids) {
  const ns = ids.map((id) => priceLevel(id)?.n).filter(Boolean);
  if (!ns.length) return '';
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return lo === hi ? LEVELS[lo] : `${LEVELS[lo]}~${LEVELS[hi]}`;
}
// 점수 기준 설명 (가이드 상단)
function criteriaBox(g) {
  const crit = g.criteria ?? [];
  if (!crit.length) return '';
  const w = Math.round(100 / crit.length);
  return `<aside class="crit-box"><b>점수 기준</b><p>${crit.map((c) => `${esc(c)} ${w}%`).join(' · ')}를 각 5점 만점으로 매긴 뒤 평균한 <b>주관적 편집 점수</b>입니다.${g.picks.some((pk) => pk.skill) ? ' 실력 단계마다 기대하는 성능이 달라, <b>순위는 같은 실력 단계 안에서만</b> 매깁니다.' : ''} 편집 점수가 같으면 ${esc(crit[tieIdx(g)])} 점수가 높은 제품, 그래도 같으면 쿠팡 판매가가 낮은 제품을 앞 순위로 둡니다.${g.picks.some((pk) => byId[pk.id] && warned(g, pk)) ? ' 연결된 쿠팡 상품의 옵션(로프트·샤프트)이 초보 기준과 맞지 않는 제품은 <b>“옵션 확인 필요”</b>로 표시하고 순위에서 뺍니다.' : ''} <a href="/about#score">점수 매기는 방법</a></p></aside>`;
}
// 초보 기준(로프트·샤프트) 점검 결과
function issuesOf(g, pk) {
  return beginnerIssues(g, pk, byId[pk.id]?.p.category, picks);
}
// 구매 버튼: 쿠팡(파트너스) 또는 공식몰(제휴 아님)
function buyBtn(id, cls = 'btn sm', label = '쿠팡에서 현재 가격 보기') {
  const link = outHref(id);
  if (link) return `<a class="${cls}" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener">${esc(label)}</a>`;
  const ext = extOf(id);
  return ext ? `<a class="${cls} ext" href="${esc(ext.url)}" target="_blank" rel="nofollow noopener">${esc(ext.store)}에서 보기</a>` : '';
}
// 제목용 가격 표기: 정확한 금액 대신 'N만원대' (기준가 기준이라 매일 바뀌지 않는다)
const manwonBand = (n) => (n >= 1e6 ? `${Math.floor(n / 1e5) * 10}만원대` : `${Math.floor(n / 1e4)}만원대`);
function baseMin(ids) {
  const xs = ids.map((id) => pickPrice(id)).filter(Boolean);
  return xs.length ? Math.min(...xs) : null;
}
function priceRange(ids) {
  const xs = ids.map((id) => freshPrice(id)).filter(Boolean);
  if (!xs.length) return null;
  const w = xs.map((x) => x.won);
  return { min: Math.min(...w), max: Math.max(...w), d: xs.map((x) => x.d).sort().at(-1) };
}
// 검색에서 많이 쓰는 실력 표현
const SKILL_WORD = { 초심자: '초보', 중급: '중급자', 고급: '상급자', 프로: '프로' };
// 아이템×성별×실력별 '고르는 법'·FAQ·한 줄 결론 수동 지정 (config/howto.json, 키: 카테고리|성별|실력)
const howto = readJson(join(ROOT, 'config', 'howto.json'), {});
const howtoOf = (g, skill) => howto[`${guideCat(g)?.id}|${g.gender ?? '공용'}|${skill ?? '전체'}`];
const faqLd = (faq) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
function howtoBlock(h) {
  if (!h) return '';
  return `${h.sections?.length ? `<section id="howto" class="prose howto"><h2>${esc(h.title ?? '고르는 법')}</h2>${h.sections.map((x) => `<h3>${esc(x.h)}</h3>${String(x.p).split('\n').map((t) => `<p>${esc(t)}</p>`).join('')}`).join('')}</section>` : ''}
${h.faq?.length ? `<section id="faq" class="prose"><h2>자주 묻는 질문</h2>${h.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>` : ''}`;
}
// '쉬움'에 해당하는 비교 항목 위치
const easyIdx = (g) => {
  const c = g.criteria ?? [];
  for (const re of [/쉬움|초보 적합/, /관용성|정렬|방향/, /가벼움/]) {
    const i = c.findIndex((x) => re.test(x));
    if (i >= 0) return i;
  }
  return -1;
};
// 한 줄 결론: 예산 기준 1개 + 쉬움(초보·중급) 또는 성능(상급·프로) 기준 1개. howto.json 의 conclusion 으로 수동 지정 가능
function conclusionBox(g, ps, skill) {
  if (ps.length < 2) return '';
  const man = howtoOf(g, skill)?.conclusion ?? {};
  const pick = (id) => ps.find((pk) => pk.id === id);
  // 초보 기준(로프트·샤프트)에 맞지 않는 연결 상품은 결론 후보에서 뒤로 미룬다
  const ok = ps.filter((pk) => !issuesOf(g, pk).length);
  const pool = ok.length >= 2 ? ok : ps;
  const sc = pool.map(totalScore).sort((a, b) => b - a);
  const median = sc[Math.floor((sc.length - 1) / 2)];
  const budget = pick(man.budget) ?? [...pool].filter((pk) => totalScore(pk) >= median && pickPrice(pk.id)).sort((a, b) => pickPrice(a.id) - pickPrice(b.id))[0];
  const hard = skill === '고급' || skill === '프로';
  const ei = easyIdx(g);
  const order = hard || ei < 0 ? pool : [...pool].sort((a, b) => (b.scores?.[ei] ?? 0) - (a.scores?.[ei] ?? 0) || totalScore(b) - totalScore(a));
  const second = pick(man.easy) ?? order.find((pk) => pk.id !== budget?.id);
  const card = (label, why, pk) => {
    if (!pk) return '';
    const p = byId[pk.id].p;
    const image = imageOf(p.id, byId[pk.id].hist);
    return `<div class="cc"><span class="cc-l">${esc(label)}</span><a class="cc-p" href="/p/${p.id}">${image ? `<img src="${esc(image)}" alt="" width="64" height="64" loading="lazy" decoding="async">` : ''}<span><b>${esc(p.name)}</b><small>${esc(why)}</small></span></a>${priceLine(p.id, 'cc-won')}${buyBtn(p.id, 'btn sm')}</div>`;
  };
  return `<section class="conclusion" aria-label="한 줄 결론"><h2>한 줄 결론</h2><div class="cc-grid">
${card('예산 기준 추천', man.budget ? '편집자 지정' : '편집 점수 상위 절반 중 쿠팡 판매가가 가장 낮은 모델', budget)}
${card(hard || ei < 0 ? '성능 기준 추천' : '쉬움 기준 추천', man.easy ? '편집자 지정' : hard || ei < 0 ? '이 단계 편집 점수 1위' : `${(g.criteria ?? [])[ei]} 점수가 가장 높은 모델`, second)}
</div></section>`;
}
// 모바일 하단 고정: 1위 상품 가격 보기
function stickyBuy(pk, label = '1위') {
  if (!pk) return '';
  const p = byId[pk.id].p;
  const sp = freshPrice(p.id);
  return `<div class="stickybuy" role="complementary" aria-label="1위 상품 바로가기"><span class="sb-t"><b>${esc(label)}</b> ${esc(p.name)}${sp ? ` · ${won(sp.won)}` : ''}</span>${buyBtn(p.id, 'btn sm', '1위 상품 가격 보기')}</div>`;
}
// 구형 모델이 실력별 1위일 때 이유와 최신 모델 1위
function oldModelNote(g, reps) {
  const lines = reps
    .map((pk) => {
      const y = yearOf(g, pk);
      if (!y || y >= CUR_YEAR - 1) return '';
      const crit = g.criteria ?? [];
      const bi = crit.findIndex((c) => c.includes('가성비'));
      const why = bi >= 0 && pk.scores?.[bi] >= 4 ? '가성비(가격 대비 성능) 점수가 높아' : '항목 점수 합계가 높아';
      const newer = rankedPicks(g).find((x) => x.skill === pk.skill && (yearOf(g, x) ?? 0) >= CUR_YEAR - 1);
      return `<li><b>${esc(pk.skill)} 1위 ${esc(byId[pk.id].p.name)}</b>는 ${y}년 모델로, ${why} 1위입니다.${newer ? ` ${CUR_YEAR - 1}년 이후 모델 중에서는 <a href="/p/${newer.id}">${esc(byId[newer.id].p.name)}</a>가 1위입니다.` : ''}</li>`;
    })
    .filter(Boolean);
  return lines.length ? `<ul class="old-note">${lines.join('')}</ul>` : '';
}
// 쿠팡 판매처가 없는 참고 모델 목록
function offerlessList(g) {
  const xs = offerless(g);
  if (!xs.length) return '';
  return `<section class="offerless"><h3>쿠팡 판매처 없는 참고 모델 <small>순위·비교표에서 제외</small></h3><ul>${xs
    .map((pk) => {
      const p = byId[pk.id].p;
      const ext = extOf(p.id);
      return `<li><a href="/p/${p.id}">${esc(p.name)}</a> <span class="tag none">판매처 없음</span> <small>${esc(pk.short ?? pk.role ?? '')}${ext ? ` · <a href="${esc(ext.url)}" target="_blank" rel="nofollow noopener">${esc(ext.store)}에서 확인 ›</a> (제휴 아님)` : ''}</small></li>`;
    })
    .join('')}</ul><p class="note">쿠팡에 국내 정품 판매처가 없는 모델입니다. 가격을 확인할 수 없어 순위에서 뺐습니다.</p></section>`;
}
const DIST_NOTE = '비거리 점수는 헤드 설계(반발·스핀·탄도)와 일반적인 사용자 평가를 바탕으로, 각 제품이 맞는 스윙 스피드에서 낼 수 있는 거리 잠재력을 매긴 주관적 참고값(10점 만점)입니다. 실측 비거리가 아니며 스윙에 맞지 않는 제품은 오히려 거리가 줄 수 있습니다.';
// 비거리 비교 추천: 비거리 점수 순위 + 실력별 비거리 1위
function distCompare(g, ids) {
  const ps = g.picks.filter((pk) => pk.dist && byId[pk.id] && sellable(pk.id) && (!ids || ids.includes(pk.id)));
  if (!ps.length) return '';
  const sorted = [...ps].sort((x, y) => y.dist - x.dist || (y.scores ? avg(y.scores) : 0) - (x.scores ? avg(x.scores) : 0));
  const tops = ids ? [] : SKILLS.map((s) => ({ s, pk: sorted.find((pk) => pk.skill === s && !pk.unisex) ?? sorted.find((pk) => pk.skill === s) })).filter((x) => x.pk);
  const sk = (s) => `<span class="skill sk-${SKILLS.indexOf(s) + 1}">${s}</span>`;
  return `<section class="dist"><h2>비거리 비교 추천 <small>거리 잠재력 순위</small></h2>
${tops.length ? `<div class="dist-top">${tops
    .map(({ s, pk }) => {
      const { p, hist } = byId[pk.id];
      const image = imageOf(p.id, hist);
      return `<a href="/p/${p.id}">${sk(s)}<span class="dist-tl">${esc(s)} 비거리 추천</span>${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async" width="212" height="212">` : ''}<b>${esc(p.name)}</b><span class="dist-n">${pk.dist}<small>/10</small></span>${levelBadge(p.id)}</a>`;
    })
    .join('')}</div>` : ''}
<ol class="dist-list">${sorted
    .map((pk) => {
      const { p, hist } = byId[pk.id];
      const image = imageOf(p.id, hist);
      return `<li><a href="/p/${p.id}">${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async" width="212" height="212">` : '<span class="dimg"></span>'}<span class="dname"><b>${esc(p.name)}</b><span class="tierline">${pk.skill ? sk(pk.skill) : ''}${levelBadge(p.id)}</span></span><span class="bar dist"><i style="width:${pk.dist * 10}%"></i></span><b class="dnum">${pk.dist}</b></a></li>`;
    })
    .join('')}</ol>
<p class="note">※ ${DIST_NOTE}</p></section>`;
}

// ---------- 상품 상세: 사진 갤러리와 비교 분석 ----------
const galleryConf = readJson(join(ROOT, 'config', 'gallery.json'), { base: '', images: {} });
function galleryOf(p, hist) {
  const list = (galleryConf.images[p.id] ?? []).map((path) => galleryConf.base + path);
  const first = imageOf(p.id, hist);
  if (!list.length && first) list.push(first);
  return [...new Set(list)];
}
function gallery(p, hist) {
  const imgs = galleryOf(p, hist);
  if (!imgs.length) return '';
  return `<div class="gal">
<div class="gal-main"><img id="galMain" src="${esc(imgs[0])}" alt="${esc(p.name)}" width="492" height="492" fetchpriority="high"></div>
${imgs.length > 1 ? `<div class="gal-thumbs">${imgs.map((src, i) => `<button type="button" class="gal-t${i === 0 ? ' on' : ''}" data-src="${esc(src)}" aria-label="사진 ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" width="212" height="212"></button>`).join('')}</div>` : ''}
<p class="gal-note">쿠팡 판매 상품 사진 · 판매처마다 옵션 구성이 다를 수 있습니다</p>
</div>`;
}
const guidesOf = (id) => guides.filter((g) => g.picks.some((pk) => pk.id === id) && !g.mergeInto);
function analysis(p) {
  return guidesOf(p.id)
    .map((g) => {
      const pk = g.picks.find((x) => x.id === p.id);
      const sr = stageRank(g, p.id);
      const total = pk.scores ? avg(pk.scores) : null;
      return `<section class="ana">
<div class="ana-head">
<div class="ana-score"><b>${total ? total.toFixed(1) : '-'}</b><small>/ 5</small><span>편집 점수</span></div>
<div><p class="ana-kicker">${esc(guideName(g))}${unisexBadge(pk)}</p><h2>${sr ? `<em>${esc(sr.label)}</em>${sr.warn ? ' <small>(연결 상품 옵션이 초보 기준과 맞지 않아 순위 제외)</small>' : sr.skill ? ` <small>(${esc(sr.skill)} ${sr.n}종 중)</small>` : ''}` : '<em>순위 제외</em> <small>(쿠팡 판매처 없음)</small>'} · ${esc(pk.role)}</h2>
${pk.verdict ? `<p class="ana-verdict">“${esc(pk.verdict)}”</p>` : ''}</div>
</div>
<div class="ana-grid">
<div class="ana-crit">${(g.criteria ?? []).map((c, i) => `<div class="ana-row"><span>${esc(c)}</span><span class="bar"><i style="width:${(pk.scores?.[i] ?? 0) * 20}%"></i></span><b>${pk.scores?.[i] ?? '-'}</b></div>`).join('')}</div>
<div class="ana-pc"><p class="pro">${(pk.pros ?? []).map((t) => `＋ ${esc(t)}`).join('<br>')}</p><p class="con">${(pk.cons ?? []).map((t) => `－ ${esc(t)}`).join('<br>')}</p></div>
</div>
${sellable(p.id) ? infographic(g, p.id) : ''}
<a class="more-link" href="/g/${g.slug}">${esc(shortTitle(g.title))} 비교 전체 보기 ›</a>
</section>`;
    })
    .join('');
}

// 가격 기록 영역: 일별 기록(직접 입력·API)이 있을 때만 추이 그래프(30일·90일)와 역대 최저가 대비 현재가를 보여 준다.
// 기록이 없으면 영역 자체를 숨기고, 가격이 14일을 넘으면 한 줄 안내만 둔다. 가격 안내 문단은 푸터에 한 번만 있다.
function priceHistory(p, hist, a) {
  if (!sellable(p.id) || !a) return '';
  // 가격 기록 영역은 가격만 바뀌어도 내용이 달라지므로 <!--phist--> 표시 사이를 콘텐츠 지문에서 뺀다
  if (!freshPrice(p.id)) return `<!--phist--><p class="note phist-stale">최근 확인한 가격이 ${PRICE_STALE_DAYS}일을 넘어 가격 정보를 숨겼습니다. 쿠팡에서 현재 가격을 확인하세요.</p><!--/phist-->`;
  const vsMin = pct(a.cur, a.allMin);
  const panel = (days, on) => {
    const from = addDays(a.last.d, -days);
    const pts = hist.points.filter((pt) => pt.d >= from);
    return `<div class="tabpanel${on ? ' on' : ''}" data-panel="ph${days}">${pts.length > 1 ? chart(pts, a.allMin) : '<p class="note">기록이 더 쌓이면 그래프가 표시됩니다.</p>'}</div>`;
  };
  return `<!--phist--><section class="phist tabs-wrap"><h2>가격 추이 <small>(${a.days}일 기록 · ${dayLabel(a.last.d)} 기준)</small></h2>
<p class="verdict ${a.verdict.cls}"><b>${a.verdict.label}</b> · ${esc(a.verdict.text)}</p>
<section class="stats">
<div><span>${PRICE_MODE === 'api' ? '최근 최저가' : '최근 확인가'}</span><b>${won(a.cur)}</b></div>
<div><span>역대 최저가</span><b>${won(a.allMin)}</b></div>
<div><span>역대 최저 대비</span><b class="${vsMin > 0 ? 'up' : ''}">${vsMin > 0.05 ? `+${vsMin.toFixed(1)}%` : '최저가'}</b></div>
<div><span>30일 평균</span><b>${won(a.avg30)}</b></div>
</section>
<div class="tabs" role="tablist"><button type="button" class="tab on" data-tab="ph30">최근 30일</button><button type="button" class="tab" data-tab="ph90">최근 90일</button></div>
${panel(30, true)}${panel(90, false)}
</section><!--/phist-->`;
}

// ---------- 상품 설명 자동 작성: 데이터(사양·실력 단계·강점·약점·추천 대상·같은 가이드 상품)만 조합하고, 사실을 지어내지 않는다 ----------
// 상품의 대표 가이드(쿠팡 판매처가 있으면 처음 등록된 가이드)와 그 안의 평가
const mainPick = (id) => {
  const g = guidesOf(id)[0];
  return g ? { g, pk: g.picks.find((x) => x.id === id) } : null;
};
// 사양 칸 중 구매 판단에 쓰는 것(번호·로프트·샤프트·구성·길이 등)을 '이름 값' 형태로
const SPEC_KEYS = /번호|로프트|샤프트|사양|구성|길이|헤드|유형|구조|소재|조임/;
function specPairs(g, pk) {
  return (g.specRows ?? [])
    .map((label, i) => ({ label: label.replace('연결 상품 ', ''), value: pk.specs?.[i] }))
    .filter((x) => x.value && x.value !== '-' && !/판매처 확인|공식몰 확인/.test(x.value) && SPEC_KEYS.test(x.label));
}
// 메타 설명: 사양 + 가격대(N만원대, 기준가) + 실력 단계·추천 대상
function productDesc(p) {
  const m = mainPick(p.id);
  if (!m) return `${p.name}: ${p.summary}`.slice(0, 160);
  const { g, pk } = m;
  const specs = specPairs(g, pk).map((x) => `${x.label} ${x.value}`).join(' · ');
  const base = pickPrice(p.id);
  const who = pk.skill ? `${SKILL_WORD[pk.skill]}용` : '';
  return `${p.name}${specs ? ` — ${specs}` : ''}${base ? `, 쿠팡 판매가 ${manwonBand(base)}` : ''}. ${who ? `${who}으로 ` : ''}${pk.forWhom}께 맞는 모델로 분류했습니다. 강점: ${pk.plus ?? pk.pros?.[0] ?? ''}.`.slice(0, 160);
}
// 같은 실력 단계의 비교 상품(순위에 든 상품 중 점수가 가까운 순)
function peersOf(g, pk, n = 2) {
  return rankedPicks(g)
    .filter((x) => x.id !== pk.id && (x.skill ?? null) === (pk.skill ?? null) && !warned(g, x))
    .sort((x, y) => Math.abs(totalScore(x) - totalScore(pk)) - Math.abs(totalScore(y) - totalScore(pk)))
    .slice(0, n);
}
// 본문 2~3문단: 이런 분께 맞아요 / 이런 분은 다른 선택이 나아요 / 비슷한 상품과 차이
function productStory(p) {
  const m = mainPick(p.id);
  if (!m) return '';
  const { g, pk } = m;
  const crit = g.criteria ?? [];
  const name = (id) => byId[id].p.name;
  const link = (id) => `<a href="/p/${id}">${esc(name(id))}</a>`;
  const iss = issuesOf(g, pk);
  // 1) 이런 분께 맞아요
  const fit = `<p>${esc(pk.forWhom)}께 맞는 모델입니다.${pk.skill ? ` ${esc(guideName(g))}에서 <b>${esc(SKILL_WORD[pk.skill])}</b> 단계로 분류했습니다.` : ''}${pk.pros?.length ? ` 강점으로는 ${pk.pros.map((t) => esc(t)).join(', ')}을(를) 꼽았습니다.` : ''}</p>`;
  // 2) 이런 분은 다른 선택이 나아요
  const others = [];
  if (iss.length) others.push(`연결된 쿠팡 상품은 ${esc(iss.map((x) => x.msg.split(' · ')[0].replace('연결 상품 ', '')).join(', '))} 옵션이라 초보 기준과 맞지 않습니다. 같은 모델의 ${esc(variantsNeed(p.id) || '권장 옵션')}을 고르세요.`);
  if (pk.cons?.length) others.push(`${pk.cons.map((t) => esc(t)).join(', ')} 점이 마음에 걸린다면 다른 모델을 함께 보세요.`);
  const cheaper = rankedPicks(g)
    .filter((x) => x.id !== pk.id && (x.skill ?? null) === (pk.skill ?? null) && !warned(g, x) && pickPrice(x.id) && pickPrice(pk.id) && priceLevel(x.id)?.n < priceLevel(pk.id)?.n)
    .sort((x, y) => totalScore(y) - totalScore(x))[0];
  if (cheaper) others.push(`예산을 줄이고 싶다면 같은 단계의 ${link(cheaper.id)}(${esc(priceLevel(cheaper.id).label)})가 있습니다.`);
  const si = pk.skill ? SKILLS.indexOf(pk.skill) : -1;
  if (si > 0) {
    const easier = rankedPicks(g).find((x) => x.skill === SKILLS[si - 1] && !warned(g, x));
    if (easier) others.push(`더 쉽게 다룰 모델을 원하면 ${esc(SKILL_WORD[SKILLS[si - 1]])} 단계 1위 ${link(easier.id)}를 보세요.`);
  }
  const alt = others.length ? `<p>${others.join(' ')}</p>` : '';
  // 3) 비슷한 상품과 차이 (주관 점수 비교)
  const diffs = peersOf(g, pk)
    .map((x) => {
      const up = [], down = [];
      crit.forEach((c, i) => {
        const d = (pk.scores?.[i] ?? 0) - (x.scores?.[i] ?? 0);
        if (d >= 1) up.push(c);
        if (d <= -1) down.push(c);
      });
      const lv = priceLevel(pk.id)?.label && priceLevel(x.id)?.label ? ` 가격대는 ${esc(priceLevel(pk.id).label)}, ${esc(name(x.id))}는 ${esc(priceLevel(x.id).label)}입니다.` : '';
      if (!up.length && !down.length) return `<li>${link(x.id)}와는 항목별 점수가 비슷합니다.${lv}</li>`;
      return `<li>${link(x.id)}보다 ${up.length ? `${esc(up.join('·'))} 점수는 높게` : ''}${up.length && down.length ? ', ' : ''}${down.length ? `${esc(down.join('·'))} 점수는 낮게` : ''} 매겼습니다.${lv}</li>`;
    })
    .join('');
  const near = diffs ? `<h3>비슷한 상품과 차이</h3><ul>${diffs}</ul><p class="note">점수 비교는 이 사이트의 주관적 편집 점수 기준입니다.</p>` : '';
  return `<section class="prose story"><h2>이런 분께 맞아요</h2>${fit}${alt ? `<h3>이런 분은 다른 선택이 나아요</h3>${alt}` : ''}${near}</section>`;
}
const variantsNeedMap = readJson(join(ROOT, 'config', 'variants.json'), {});
const variantsNeed = (id) => variantsNeedMap[id]?.need ?? '';
// 구매 전 확인할 점: 옵션·사이즈·로프트·샤프트·정품 여부처럼 구매 전에 확인할 것만 (장점은 넣지 않는다)
const CHECK_HINT = /확인|선택|옵션|사이즈|구성|버전|정품|AS|길이|로프트|샤프트|강도|번호|수량|호환/;
const CATEGORY_CHECKS = {
  driver: ['판매 페이지 옵션에서 로프트와 샤프트 강도(R·SR·S 등)를 확인하세요.'],
  wood: ['번호(3번·5번·7번)와 로프트, 샤프트 강도를 옵션에서 확인하세요.'],
  utility: ['번호와 로프트, 샤프트 강도를 옵션에서 확인하세요.'],
  iron: ['세트 구성(몇 번부터 몇 번까지, 몇 자루)과 샤프트 종류·강도를 확인하세요.'],
  wedge: ['로프트·바운스와 샤프트를 옵션에서 확인하세요.'],
  putter: ['길이(33·34인치 등)와 헤드 모양을 옵션에서 확인하세요.'],
  ball: ['구성 수량(더즌·알 수)과 색상을 확인하세요.'],
  shoes: ['사이즈(mm)와 발볼 너비를 확인하세요.'],
  glove: ['사이즈와 착용 손(왼손·양손)을 확인하세요.'],
  rangefinder: ['국내 정식 AS 가능 여부를 확인하세요.'],
  gps: ['국내 정식 AS 가능 여부와 국내 골프장 지도 지원을 확인하세요.'],
  launch: ['국내 정식 AS 가능 여부와 함께 쓸 앱·기기 호환을 확인하세요.'],
  bag: ['크기·무게와 수납 구성을 확인하세요.'],
  practice: ['구성품과 크기를 확인하세요.'],
};
function buyChecks(p) {
  const m = mainPick(p.id);
  const out = [];
  if (m) {
    const iss = issuesOf(m.g, m.pk);
    for (const x of iss) out.push(`${x.msg} — 같은 모델의 권장 옵션을 고르세요.`);
    const covered = (label) => (iss.some((x) => x.kind === 'loft') && /로프트|번호/.test(label)) || (iss.some((x) => x.kind === 'shaft') && /샤프트/.test(label));
    for (const x of specPairs(m.g, m.pk)) if (/번호|로프트|샤프트|사양|구성|길이/.test(x.label) && !covered(x.label)) out.push(`이 사이트가 연결한 상품의 ${x.label}: ${x.value} — 원하는 옵션인지 확인하세요.`);
  }
  out.push(...(CATEGORY_CHECKS[p.category] ?? []));
  out.push(...(p.points ?? []).filter((t) => CHECK_HINT.test(t) && !/^\d/.test(t)));
  out.push('국내 정품(병행수입·해외직구 아님)인지, 쿠팡 직매입인지 판매자 배송인지 판매 페이지에서 확인하세요.');
  return [...new Set(out)];
}

// ---------- A vs B 1:1 비교 페이지 (/vs/{A}-vs-{B}) ----------
// 구매 직전에 "A vs B"로 찾는 사람을 위한 페이지. 대량 생성을 막기 위해 '실제로 함께 비교되는' 두 모델만 만든다:
//  - 같은 가이드(같은 카테고리) 안의 두 모델, 판매처가 있고(링크 준비 중 포함) 옵션 경고·남녀 공용으로 끌어온 모델이 아닌 것
//  - 추천 단계가 같거나 바로 옆 단계, 또는 같은 시리즈(두 단계 차이까지). 이름의 종류 표시(게이밍·기계식 등)가 같아야 함
//  - 데이터가 실제로 달라야 함: 항목 점수가 1개 이상 다르고, 점수·주요 사양 차이가 합쳐서 2개 이상
//  - 사이트 전체 VS_MAX 개, 상품 하나당 VS_PER_PRODUCT 개까지. 쿠팡 링크가 있는 상품·같은 단계·높은 단계를 먼저, 가이드마다 돌아가며 고른다
// 문장은 모두 데이터(단계·항목 점수·사양·장단점·추천 대상)에서 조합하고, 사실이나 가격을 지어내지 않는다.
const VS_MAX = 150;
const VS_PER_PRODUCT = 3;
// 두 상품 모두 쿠팡 링크가 있을 때만 만든다(2026-10-19 관제탑)
const vsListed = (id) => sellable(id);
const VS_STRIP = null; // 제목용 짧은 이름: 끝에 붙은 일반 명사(무선·이어폰 등)를 뗀다 (모델명에 숫자·영문 코드가 남을 때만)
// 받침 여부 (조사 고르기): 한글은 받침, 숫자·영문은 읽는 소리 기준
function hasBatchim(word) {
  const w = String(word).replace(/\s*\([^)]*\)\s*$/, '').trim();
  const ch = w.at(-1) ?? '';
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return '013678'.includes(ch);
  if (/[a-z]/i.test(ch)) return /[lmnr]/i.test(ch);
  return false;
}
const josa = (w, withB, without) => `${w}${hasBatchim(w) ? withB : without}`;
function vsShort(full) {
  const name = full.replace(/\s*\(\d+(?:더즌|개입|구)\)$/, ''); // 수량 표기(1더즌 등)는 제목에서 뺀다
  if (!VS_STRIP) return name;
  let base = name;
  let code = '';
  const m = base.match(/^(.*?)\s*(\([A-Z-]*[0-9][A-Z0-9-]*\))$/); // 숫자가 든 모델 코드만 (예: HT08, A1289)
  if (m) [base, code] = [m[1], ` ${m[2]}`];
  let out = base;
  while (VS_STRIP.test(out)) out = out.replace(VS_STRIP, '');
  // 남은 이름에 숫자·영문 모델 코드가 없으면(예: 애플 매직 마우스) 원래 이름을 쓴다
  if (out === base || !/[0-9A-Za-z]/.test(out.split(/\s+/).slice(1).join(' ') + code)) return name;
  return `${out}${code}`;
}
const brandOf = (id) => byId[id].p.name.split(/\s+/)[0];
// 같은 시리즈(브랜드 + 다음 낱말, 예: 애플 에어팟·로지텍 MX)는 두 단계 차이까지 비교한다
const seriesOf = (id) => byId[id].p.name.split(/\s+/).slice(0, 2).join(' ');
// 이름에 든 종류 표시가 서로 다르면(예: 게이밍 마우스 vs 사무용 마우스) 함께 비교하지 않는다
const VS_TYPES = [/여성/];
const sameType = (x, y) => VS_TYPES.every((re) => re.test(byId[x].p.name) === re.test(byId[y].p.name));
const vsSpecOk = (v) => !!v && v !== '-' && !/확인/.test(String(v));
const vsLabel = (l) => l.replace('연결 상품 ', '');
// 두 모델의 차이: 항목 점수(1점 이상)와 주요 사양('연결 상품' 칸은 판매 옵션이라 차이 계산에서 뺀다)
function vsDiff(g, x, y) {
  const crit = (g.criteria ?? []).map((c, i) => ({ c, i, a: x.scores?.[i], b: y.scores?.[i] })).filter((r) => r.a != null && r.b != null && r.a !== r.b);
  const spec = (g.specRows ?? [])
    .map((label, i) => ({ label: vsLabel(label), raw: label, i, a: String(x.specs?.[i] ?? ''), b: String(y.specs?.[i] ?? '') }))
    .filter((r) => !/^연결 상품/.test(r.raw) && vsSpecOk(r.a) && vsSpecOk(r.b) && r.a !== r.b);
  return { crit, spec };
}
const vsTierIdx = (pk) => (pk.skill ? SKILLS.indexOf(pk.skill) : -1);
// 한 번 공개한 비교 주소(config/url-manifest.json)는 데이터가 바뀌어도 유지한다: 두 상품이 아직 같은 가이드에 있으면 계속 만들고,
// 상품이 빠져 만들 수 없게 되면 남은 상품 페이지(없으면 홈)로 301 (VS_GONE → _redirects)
const VS_KNOWN = DEMO ? [] : (readJson(join(ROOT, 'config', 'url-manifest.json'), {}).urls ?? []).filter((u) => u.startsWith('/vs/'));
const vsIdsOf = (path) => {
  const m = path.match(/^\/vs\/(.+?)-vs-(.+)$/);
  return m ? [m[1], m[2]] : [];
};
const VS_PAIRS = (() => {
  const pinned = [];
  for (const path of VS_KNOWN) {
    const [ia, ib] = vsIdsOf(path);
    const g = pageGuides.find((x) => [ia, ib].every((id) => byId[id] && vsListed(id) && x.picks.some((pk) => pk.id === id && pk.scores?.length)));
    if (!g) continue;
    const a = g.picks.find((pk) => pk.id === ia), b = g.picks.find((pk) => pk.id === ib);
    pinned.push({ g, a, b, gap: Math.abs(vsTierIdx(a) - vsTierIdx(b)), sameBrand: brandOf(ia) === brandOf(ib), d: vsDiff(g, a, b), key: [ia, ib].sort().join('|'), path });
  }
  const perGuide = pageGuides.map((g) => {
    const n = (g.criteria ?? []).length;
    const kindRow = (g.specRows ?? []).findIndex((r) => /^종류$/.test(r));
    const ps = rankedPicks(g).filter((pk) => vsListed(pk.id) && !warned(g, pk) && !pk.unisex && n && pk.scores?.length === n);
    const cands = [];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const x = ps[i], y = ps[j];
        const tx = vsTierIdx(x), ty = vsTierIdx(y);
        const gap = tx < 0 || ty < 0 ? (tx === ty ? 0 : 9) : Math.abs(tx - ty);
        const sameBrand = brandOf(x.id) === brandOf(y.id);
        if (!(gap <= 1 || (seriesOf(x.id) === seriesOf(y.id) && gap <= 2)) || !sameType(x.id, y.id)) continue;
        if (kindRow >= 0 && vsSpecOk(x.specs?.[kindRow]) && vsSpecOk(y.specs?.[kindRow]) && x.specs[kindRow] !== y.specs[kindRow]) continue; // 종류가 다른 연습기 등은 비교하지 않는다
        const d = vsDiff(g, x, y);
        if (!d.crit.length || d.crit.length + d.spec.length < 2) continue;
        // 높은 단계(같으면 편집 점수가 높은 모델)를 앞에 둔다
        const [a, b] = ty > tx || (ty === tx && totalScore(y) > totalScore(x)) ? [y, x] : [x, y];
        const linkN = (sellable(a.id) ? 1 : 0) + (sellable(b.id) ? 1 : 0);
        const pri = linkN * 1000 + (gap === 0 ? 300 : sameBrand ? 200 : 100) + Math.max(tx, ty, 0) * 20 + Math.min(d.crit.length + d.spec.length, 6) * 5 + totalScore(a) + totalScore(b);
        cands.push({ g, a, b, gap, sameBrand, d: vsDiff(g, a, b), pri, grp: [a.skill ?? '', b.skill ?? ''].sort().join('|'), key: [a.id, b.id].sort().join('|') });
      }
    // 단계 조합(예: 초심자끼리, 중급-고급)마다 돌아가며 넣어 한 단계에만 몰리지 않게 한다 (높은 단계 조합이 먼저)
    cands.sort((p, q) => q.pri - p.pri);
    const groups = [...new Set(cands.map((v) => v.grp))].sort((x, y) => {
      const t = (k) => Math.max(...k.split('|').map((n) => SKILLS.indexOf(n)));
      return t(y) - t(x) || cands.findIndex((v) => v.grp === x) - cands.findIndex((v) => v.grp === y);
    });
    const byGrp = groups.map((k) => cands.filter((v) => v.grp === k));
    const mixed = [];
    for (let r = 0; byGrp.some((xs) => xs.length > r); r++) for (const xs of byGrp) if (xs[r]) mixed.push(xs[r]);
    return mixed;
  });
  const out = [...pinned];
  const used = new Set(pinned.map((v) => v.key));
  const per = {};
  for (const v of pinned) for (const id of [v.a.id, v.b.id]) per[id] = (per[id] ?? 0) + 1;
  let moved = true;
  while (out.length < VS_MAX && moved) {
    moved = false;
    for (const cands of perGuide) {
      if (out.length >= VS_MAX) break;
      const k = cands.findIndex((v) => !used.has(v.key) && (per[v.a.id] ?? 0) < VS_PER_PRODUCT && (per[v.b.id] ?? 0) < VS_PER_PRODUCT);
      if (k < 0) continue;
      const v = cands.splice(k, 1)[0];
      used.add(v.key);
      per[v.a.id] = (per[v.a.id] ?? 0) + 1;
      per[v.b.id] = (per[v.b.id] ?? 0) + 1;
      out.push({ ...v, path: `/vs/${v.a.id}-vs-${v.b.id}` });
      moved = true;
    }
  }
  return out;
})();
const VS_OG = Object.fromEntries(VS_PAIRS.map((v) => [v.path, v.a.id]));
const VS_GONE = VS_KNOWN.filter((u) => !VS_OG[u]).map((u) => `${u} ${vsIdsOf(u).find((id) => byId[id]) ? `/p/${vsIdsOf(u).find((id) => byId[id])}` : '/'} 301`);
const vsOf = (id) => VS_PAIRS.filter((v) => v.a.id === id || v.b.id === id);
const vsName = (pk) => vsShort(byId[pk.id].p.name);
// 추천 대상 문구: '…분, …면 ○○ 버전'처럼 덧붙인 설명은 앞부분만 쓴다
function vsWho(pk) {
  const t = String(pk.forWhom ?? '').trim();
  const m = t.match(/^(.*?분)[,.]\s/);
  const w = m ? m[1] : t;
  return `${w}${w.endsWith('분') ? '께' : w.endsWith('환경') ? '에' : '에게'}`;
}
// 결론·FAQ 문장 (모두 데이터에서)
function vsText(v) {
  const { g, a, b, d } = v;
  const A = vsName(a), B = vsName(b);
  let tier;
  if (a.skill && b.skill && a.skill === b.skill) {
    const ra = stageRank(g, a.id)?.r, rb = stageRank(g, b.id)?.r;
    tier = `두 모델 모두 ${SKILL_WORD[a.skill]} 단계로 분류했고${ra && rb ? `, 같은 단계 안 순위는 ${A} ${ra}위, ${B} ${rb}위입니다` : ''}.`;
  } else if (a.skill && b.skill) {
    tier = `${josa(A, '은', '는')} ${SKILL_WORD[a.skill]} 단계, ${josa(B, '은', '는')} ${SKILL_WORD[b.skill]} 단계 모델입니다.${v.sameBrand ? ` 같은 ${brandOf(a.id)} 제품 가운데 단계가 다른 두 모델입니다.` : ''}`;
  } else {
    tier = `두 모델 모두 ${guideCat(g)?.name ?? ''} 비교에 넣은 모델이며, 편집 점수는 ${A} ${totalScore(a).toFixed(1)}점, ${B} ${totalScore(b).toFixed(1)}점입니다.`;
  }
  const ups = d.crit.filter((r) => r.a > r.b).map((r) => r.c);
  const downs = d.crit.filter((r) => r.b > r.a).map((r) => r.c);
  let score;
  if (ups.length && downs.length) score = `항목 점수로는 ${josa(A, '이', '가')} ${ups.join('·')}에서, ${josa(B, '이', '가')} ${downs.join('·')}에서 앞섭니다.`;
  else {
    const [W, xs] = ups.length ? [A, ups] : [B, downs];
    score = `항목 점수로는 ${josa(W, '이', '가')} ${xs.join('·')}에서 앞서고, 나머지 항목은 점수가 같습니다.`;
  }
  const who = `${josa(A, '은', '는')} ${vsWho(a)}, ${josa(B, '은', '는')} ${vsWho(b)} 맞습니다.`;
  const specs = d.spec.slice(0, 3).map((r) => `${josa(r.label, '은', '는')} ${A} ${r.a}, ${B} ${r.b}입니다.`);
  const specLine = specs.length ? `사양을 보면 ${specs.join(' ')}` : `점수 차이는 ${d.crit.map((r) => `${r.c} ${A} ${r.a}점·${B} ${r.b}점`).join(', ')}입니다.`;
  const faq = [
    { q: `${josa(A, '과', '와')} ${B} 중 무엇을 사야 하나요?`, a: `${who} ${score}` },
    { q: `${josa(A, '과', '와')} ${B}의 가장 큰 차이는 무엇인가요?`, a: `${tier} ${specLine}` },
  ];
  if (a.cons?.length && b.cons?.length) faq.push({ q: `${josa(A, '과', '와')} ${B}의 단점은 무엇인가요?`, a: `${A}: ${a.cons.join(', ')}. ${B}: ${b.cons.join(', ')}.` });
  return { A, B, tier, score, who, faq };
}
// 상품·가이드 페이지의 '자주 비교하는 모델' 목록
function vsLinkList(list, self) {
  if (!list.length) return '';
  const img = (id) => {
    const src = imageOf(id, byId[id].hist);
    return src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" width="48" height="48">` : `<span class="vs-ph">${esc(catName[byId[id].p.category]?.slice(0, 1) ?? '·')}</span>`;
  };
  return `<ul class="vs-list">${list
    .map((v) => {
      const other = self ? (v.a.id === self ? v.b : v.a) : null;
      const sub = other ? `${other.skill ? `${other.skill} · ` : ''}${esc(other.role ?? '')}` : `${v.a.skill && v.b.skill ? (v.a.skill === v.b.skill ? `${esc(v.a.skill)} 단계 맞대결` : `${esc(v.a.skill)} vs ${esc(v.b.skill)}`) : esc(`${v.a.role} vs ${v.b.role}`)}`;
      return `<li><a href="${v.path}"><span class="vs-imgs">${img(v.a.id)}${img(v.b.id)}</span><span class="vs-lt"><b>${esc(vsName(v.a))} <i>vs</i> ${esc(vsName(v.b))}</b><small>${sub}</small></span></a></li>`;
    })
    .join('')}</ul>`;
}
function vsProductBlock(id) {
  const list = vsOf(id);
  if (!list.length) return '';
  return `<section class="vs-links" id="vs"><h2>자주 비교하는 모델 <small>1:1 비교</small></h2>${vsLinkList(list, id)}</section>`;
}
function vsTierBlock(g, skill) {
  const list = VS_PAIRS.filter((v) => v.g.slug === g.slug && (v.a.skill === skill || v.b.skill === skill));
  if (!list.length) return '';
  return `<section class="vs-links" id="vs"><h2>${esc(SKILL_WORD[skill])} 모델 1:1 비교 <small>${list.length}개</small></h2>${vsLinkList(list)}</section>`;
}
function vsGuideBlock(g) {
  const list = VS_PAIRS.filter((v) => v.g.slug === g.slug);
  if (!list.length) return '';
  return `<section class="vs-links" id="vs"><h2>자주 비교하는 모델 <small>${list.length}개 1:1 비교</small></h2>${vsLinkList(list)}</section>`;
}
function writeVsPages() {
  for (const v of VS_PAIRS) {
    const { g, a, b, d } = v;
    const t = vsText(v);
    const c = guideCat(g);
    const pa = byId[a.id].p, pb = byId[b.id].p;
    const crit = g.criteria ?? [];
    const title = `${t.A} vs ${t.B}: 무엇을 살까 (${CUR_YEAR})`;
    const side = (pk, cls) => {
      const p = byId[pk.id].p;
      const image = imageOf(p.id, byId[pk.id].hist);
      const sr = stageRank(g, pk.id);
      return `<div class="vs-side ${cls}"><a class="vs-img" href="/p/${p.id}">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" width="212" height="212" decoding="async">` : `<span class="vs-ph">${esc(c?.name?.slice(0, 1) ?? '·')}</span>`}</a>
<p class="vs-tags">${pk.skill ? `<span class="skill sk-${SKILLS.indexOf(pk.skill) + 1}">${esc(pk.skill)}</span>` : ''}${levelBadge(p.id)}</p>
<h2><a href="/p/${p.id}">${esc(p.name)}</a></h2>
<p class="vs-role">${esc(pk.short ?? pk.role)}${sr?.label ? ` · ${esc(sr.label)}` : ''}</p>
<p class="vs-total"><b>${totalScore(pk).toFixed(1)}</b><small>/5 편집 점수</small></p>
${priceLine(p.id, 'price-line vs-price')}
<div class="vs-btn">${buyBtn(p.id, 'btn sm', '쿠팡 가격 보기') || ''}</div></div>`;
    };
    const bar = (n) => `<span class="vs-bar"><i style="width:${(n ?? 0) * 20}%"></i></span><b>${n ?? '-'}</b>`;
    const scoreRows = crit
      .map((cn, i) => {
        const x = a.scores[i], y = b.scores[i];
        const win = x > y ? `<em class="a">${esc(t.A)} 우세</em>` : y > x ? `<em class="b">${esc(t.B)} 우세</em>` : '<em>같음</em>';
        return `<div class="vs-crit"><p class="vs-cn">${esc(cn)} ${win}</p><div class="vs-line a"><span>${esc(t.A)}</span>${bar(x)}</div><div class="vs-line b"><span>${esc(t.B)}</span>${bar(y)}</div></div>`;
      })
      .join('');
    const specRow = (label, va, vb, raw = false) => `<tr${!raw && va !== vb ? ' class="diff"' : ''}><th scope="row">${esc(label)}</th><td>${raw ? va : esc(va || '-')}</td><td>${raw ? vb : esc(vb || '-')}</td></tr>`;
    const list = (xs) => (xs?.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '-');
    const tierCell = (pk) => (pk.skill ? `<span class="skill sk-${SKILLS.indexOf(pk.skill) + 1}">${esc(pk.skill)}</span> ${esc(stageRank(g, pk.id)?.label ?? '')}` : esc(stageRank(g, pk.id)?.label ?? '-'));
    const specTable = `<div class="tablewrap"><table class="vs-table"><thead><tr><th></th><th><a href="/p/${a.id}">${esc(t.A)}</a></th><th><a href="/p/${b.id}">${esc(t.B)}</a></th></tr></thead><tbody>
${specRow('추천 단계·순위', tierCell(a), tierCell(b), true)}
${specRow('편집 점수', `${totalScore(a).toFixed(1)} / 5`, `${totalScore(b).toFixed(1)} / 5`)}
${levelBadge(a.id) || levelBadge(b.id) ? specRow('가격대', levelBadge(a.id) || '-', levelBadge(b.id) || '-', true) : ''}
${specRow('한마디', a.short ?? a.role, b.short ?? b.role)}
${(g.specRows ?? []).map((label, i) => specRow(vsLabel(label), String(a.specs?.[i] ?? ''), String(b.specs?.[i] ?? ''))).join('')}
${specRow('장점', list(a.pros), list(b.pros), true)}
${specRow('단점', list(a.cons), list(b.cons), true)}
</tbody></table></div>`;
    const whoCard = (pk, other, cls, nm) => {
      const wins = d.crit.filter((r) => (pk === a ? r.a > r.b : r.b > r.a)).map((r) => `<li><b>${esc(r.c)}</b> ${pk === a ? r.a : r.b}점 <small>(${esc(vsName(other))} ${pk === a ? r.b : r.a}점)</small></li>`);
      return `<div class="vs-who-c ${cls}"><p class="vs-who-k">이런 분은</p><h3><a href="/p/${pk.id}">${esc(nm)}</a></h3><p class="vs-fw">${esc(pk.forWhom)}</p>
${wins.length ? `<p class="vs-sub">더 높게 매긴 항목</p><ul class="vs-why">${wins.join('')}</ul>` : ''}
${pk.pros?.length ? `<p class="vs-sub">장점</p><ul class="vs-pro">${pk.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${pk.cons?.length ? `<p class="vs-sub">감안할 점</p><ul class="vs-con">${pk.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${pk.verdict ? `<p class="vs-vd">“${esc(pk.verdict)}”</p>` : ''}</div>`;
    };
    const more = VS_PAIRS.filter((x) => x !== v && (x.a.id === a.id || x.b.id === a.id || x.a.id === b.id || x.b.id === b.id)).slice(0, 6);
    const desc = `${t.A} vs ${t.B} 비교: ${t.who} ${t.score}`.slice(0, 160);
    const body = `<nav class="crumb"><a href="/">홈</a> › <a href="/c/${c?.id}">${esc(c?.name ?? '')}</a> › <a href="/g/${g.slug}">${esc(guideName(g))}</a> › 1:1 비교</nav>
<p class="g-kicker">${esc(c?.name ?? '')} 1:1 비교</p>
<h1>${esc(t.A)} <span class="vs-x">vs</span> ${esc(t.B)} <small>무엇을 살까</small></h1>
${updatedTag(max2(g.updated, pa.updated, pb.updated))}
<section class="vs-hero">${side(a, 'a')}<span class="vs-mid" aria-hidden="true">VS</span>${side(b, 'b')}</section>
<section class="vs-verdict" aria-label="결론"><h2>결론부터</h2><p><b>${esc(t.who)}</b></p><p>${esc(t.score)} ${esc(t.tier)}</p></section>
<section class="vs-who"><h2>이런 분은 ${esc(t.A)}, 이런 분은 ${esc(t.B)}</h2><div class="vs-who-g">${whoCard(a, b, 'a', t.A)}${whoCard(b, a, 'b', t.B)}</div></section>
<section class="vs-scores"><h2>항목별 점수 비교 <small>5점 만점</small></h2><p class="vs-legend"><span class="a">${esc(t.A)}</span><span class="b">${esc(t.B)}</span></p><div class="vs-crits">${scoreRows}</div><p class="note">※ ${SCORE_NOTE}</p></section>
<section class="vs-spec"><h2>사양·특징 비교</h2>${specTable}<p class="note">색이 칠해진 줄은 두 모델이 다른 항목입니다. 사양은 ${esc(guideName(g))}의 비교표와 같은 자료입니다.</p></section>
<section class="vs-buy"><h2>판매처에서 확인하기</h2><div class="vs-buy-g">${[a, b].map((pk) => `<div><b>${esc(byId[pk.id].p.name)}</b>${priceLine(pk.id, 'price-line vs-price')}${buyBtn(pk.id, 'btn') || ''}</div>`).join('')}</div>${sellable(a.id) || sellable(b.id) ? '<p class="note">쿠팡 버튼은 쿠팡 파트너스 링크입니다. 가격과 옵션은 판매 페이지에서 확인하세요.</p>' : ''}</section>
<section id="faq" class="prose"><h2>자주 묻는 질문</h2>${t.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>
<section class="vs-links"><h2>더 보기</h2><ul class="vs-go"><li><a href="/g/${g.slug}">${esc(guideName(g))} — ${rankedPicks(g).length}종 전체 비교 ›</a></li><li><a href="/p/${a.id}">${esc(pa.name)} 자세히 보기 ›</a></li><li><a href="/p/${b.id}">${esc(pb.name)} 자세히 보기 ›</a></li></ul>${more.length ? `<h3>함께 많이 보는 비교</h3>${vsLinkList(more)}` : ''}</section>`;
    writeText(
      join(OUT, 'vs', `${a.id}-vs-${b.id}.html`),
      layout({
        title,
        desc,
        path: v.path,
        body,
        ld: [crumbLd([['홈', '/'], [c?.name ?? '', `/c/${c?.id}`], [guideName(g), `/g/${g.slug}`], [`${t.A} vs ${t.B}`, v.path]]), faqLd(t.faq)],
      }),
    );
  }
}

// ---------- 상품 페이지 ----------
for (const { p, hist, a } of entries) {
  const cat = cats.find((c) => c.id === p.category);
  const crumb = `<nav class="crumb"><a href="/">홈</a> › <a href="/c/${p.category}">${esc(cat.name)}</a></nav>`;
  const checks = buyChecks(p);
  const title = `${p.name} 가격·스펙·추천 대상`;
  const desc = productDesc(p);
  const sc = scoreOf[p.id];
  const top = guidesOf(p.id).filter((g) => !g.mergeInto).map((g) => ({ g, sr: stageRank(g, p.id) }));
  const body = `${crumb}
<section class="pd">
${gallery(p, hist)}
<div class="pd-info">
<span class="pt-cat">${esc(cat.name)}</span>
<h1>${esc(p.name)}</h1>
${updatedTag(p.updated)}
<div class="pt-badges">${picks[p.id]?.rocket ? '<span class="tag rocket">로켓배송</span>' : ''}${sc ? `<span class="tag score">편집 점수 ${sc.toFixed(1)}</span>` : ''}${top.map(({ g, sr }) => (sr ? `<span class="tag ${sr.warn ? 'warn' : 'rank'}">${esc(guideName(g).replace(' 비교 및 선택 가이드', ''))} ${esc(sr.label)}</span>` : '')).join('')}${sellable(p.id) ? '' : '<span class="tag none">쿠팡 판매처 없음</span>'}</div>
<div class="pd-price">${priceLine(p.id, 'pd-won')}${priceLevel(p.id) ? `<span>가격대 <small>(${esc(cat.name)} 비교 기준)</small></span>${levelLink(p.id, hist, '쿠팡에서 현재 가격 보기 ›')}` : ''}</div>
<p class="pd-sum">${esc(p.summary)}</p>
${checks.length ? `<h2 class="sub">구매 전 확인할 점</h2><ul class="checks">${checks.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
${buyButton(p.id, hist)}
</div>
</section>
${productStory(p)}
${vsProductBlock(p.id)}
${analysis(p)}
${newsBlock(p.id)}
<section class="prose"><h2>${esc(cat.name)} 고르는 법</h2><p>${esc(cat.intro)}</p>${figure(p.category)}<ul>${cat.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
${priceHistory(p, hist, a)}`;
  writeText(
    join(OUT, 'p', `${p.id}.html`),
    layout({ title, desc, path: `/p/${p.id}`, body, recent: { id: p.id, n: p.name, i: imageOf(p.id, hist) ?? '' }, ld: [crumbLd([['홈', '/'], [cat.name, `/c/${p.category}`], [p.name, `/p/${p.id}`]])] }),
  );
}

// ---------- 분류 페이지 ----------
for (const c of cats) {
  const items = entries.filter((e) => e.p.category === c.id);
  const related = guidesFor(c.id);
  writeText(
    join(OUT, 'c', `${c.id}.html`),
    layout({
      title: `${c.name} 비교: 브랜드별 상위 모델 점수·장단점`,
      desc: `${c.name} ${items.filter((e) => sellable(e.p.id)).length}종을 실력 단계·가격대별로 비교하고 장단점과 주관적 편집 점수, 쿠팡 판매가를 정리했습니다. ${items.slice(0, 6).map((e) => e.p.name).join(', ')} 등.`.slice(0, 160),
      path: `/c/${c.id}`,
      ld: [crumbLd([['홈', '/'], [c.name, `/c/${c.id}`]])],
      body: `<nav class="crumb"><a href="/">홈</a> › ${esc(c.name)}</nav>
<h1>${esc(c.name)} 비교</h1>
${updatedTag(max2(...related.map((g) => g.updated)))}
${related.length > 1 ? `<nav class="gtabs">${related.map((g) => `<a href="#g-${g.slug}">${esc(genderLabel(g, c))}</a>`).join('')}</nav>` : ''}
${related.map((g) => `<section id="g-${g.slug}" class="cat-cmp">${related.length > 1 ? `<h2 class="cat-cmp-h"><span class="gender g-${esc(g.gender ?? '공용')}">${esc(g.gender ?? '공용')}</span>${esc(c.name)} 비교</h2>` : ''}${infographic(g)}${tierCompare(g)}<a class="more-link" href="/g/${g.slug}">장단점·고르는 법 전체 보기 ›</a></section>`).join('')}
<section><h2>${esc(c.name)} 전체 상품</h2>${prow(items)}</section>
<section class="prose"><h2>${esc(c.name)} 고르는 법</h2><p>${esc(c.intro)}</p>${figure(c.id)}<ul>${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`,
    }),
  );
}

// ---------- 비교·추천 가이드 페이지 ----------
// 제목: "[성별] [아이템] 추천 N종 비교 (연도) | 최저가원부터" — 최저가는 페이지 상품의 쿠팡 판매가에서 계산
function guideTitle(g, skill) {
  const c = guideCat(g);
  const who = g.gender && g.gender !== '공용' ? `${g.gender} ` : '';
  const ids = skill ? skillGroups(g).find((x) => x.skill === skill)?.ids ?? [] : rankedPicks(g).map((pk) => pk.id);
  const bm = baseMin(ids);
  return `${who}${skill ? `${SKILL_WORD[skill]} ` : ''}${c?.name ?? ''} 추천 ${ids.length}종 비교 (${CUR_YEAR})${bm ? ` | ${manwonBand(bm)}부터` : ''}`;
}
// 메타 설명: 가격 범위 + 핵심 추천 대상
function guideDesc(g, skill) {
  const c = guideCat(g);
  const who = g.gender && g.gender !== '공용' ? `${g.gender} ` : '';
  const ps = skill ? rankedPicks(g).filter((pk) => pk.skill === skill) : rankedPicks(g);
  const pr = priceRange(ps.map((pk) => pk.id));
  const top = ps[0];
  const head = `${who}${skill ? `${SKILL_WORD[skill]} ` : ''}${c?.name ?? ''} ${ps.length}종 비교`;
  const price = pr ? ` 쿠팡 판매가 ${won(pr.min)}~${won(pr.max)}(${dayLabel(pr.d)} 확인).` : '';
  const target = skill && top ? ` ${top.forWhom}께 맞춘 추천으로, 1위는 ${byId[top.id].p.name}.` : ` ${g.desc}`;
  return `${head}:${price}${target}`.slice(0, 160);
}
for (const g of pageGuides) {
  const picksIn = stagedPicks(g);
  const crit = g.criteria ?? [];
  const totalOf = (pk) => (pk.scores?.length ? avg(pk.scores) : null);
  const best = Math.max(...picksIn.map((pk) => totalOf(pk) ?? 0));
  const scoreRows = picksIn
    .map((pk) => {
      const { p, hist } = byId[pk.id];
      const image = imageOf(p.id, hist);
      const link = outHref(p.id);
      const total = totalOf(pk);
      return `<tr>
<td class="pcell">${image ? `<img src="${esc(image)}" alt="" loading="lazy" width="48" height="48">` : ''}<a href="/p/${p.id}">${esc(p.name)}</a><br>${pk.skill ? `<span class="skill sk-${SKILLS.indexOf(pk.skill) + 1}">${pk.skill}</span> ` : ''}<span class="badge mid">${esc(pk.role)}</span></td>
${crit.map((_, i) => `<td class="sc">${pk.scores ? dots(pk.scores[i]) : '-'}</td>`).join('')}
<td class="total">${total ? `<b>${total.toFixed(1)}</b><small>/5</small>${stageRank(g, pk.id)?.r === 1 ? `<br><span class="badge good">${esc(stageRank(g, pk.id).label)}</span>` : ''}` : '-'}</td>
<td>${link ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener">쿠팡 가격 보기</a>` : ''}</td>
</tr>`;
    })
    .join('');
  const proRows = picksIn
    .map((pk) => {
      const { p } = byId[pk.id];
      return `<tr><td class="pname"><a href="/p/${p.id}">${esc(p.name)}</a></td>
<td class="t pro"><ul>${(pk.pros ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></td>
<td class="t con"><ul>${(pk.cons ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></td></tr>`;
    })
    .join('');
  const cards = picksIn
    .map((pk) => {
      const { p, hist } = byId[pk.id];
      const image = imageOf(p.id, hist);
      const total = totalOf(pk);
      return `<section class="pick"><h2>${esc(p.name)} <small>${esc(pk.role)}</small>${total ? ` <span class="badge good">${total.toFixed(1)}/5</span>` : ''}${unisexBadge(pk)}</h2>
<div class="pick-body">${image ? `<img class="pick-img" src="${esc(image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="212" height="212">` : ''}<div>
<p>${esc(p.summary)}</p><p><b>이런 분께:</b> ${esc(pk.forWhom)}</p>${newsBlock(p.id, 'h3')}${buyButton(p.id, hist)}</div></div></section>`;
    })
    .join('');
  writeText(
    join(OUT, 'g', `${g.slug}.html`),
    layout({
      title: guideTitle(g),
      raw: true,
      desc: guideDesc(g),
      path: `/g/${g.slug}`,
      ld: [
        crumbLd([['홈', '/'], [guideCat(g)?.name ?? '', `/c/${guideCat(g)?.id}`], [guideName(g), `/g/${g.slug}`]]),
        listLd(g.title, stagedPicks(g).map((pk) => pk.id)),
        ...(g.faq?.length ? [faqLd(g.faq)] : []),
      ],
      body: `<nav class="crumb"><a href="/">홈</a> › <a href="/c/${guideCat(g)?.id}">${esc(guideCat(g)?.name ?? '')}</a>${g.gender && g.gender !== '공용' ? ` › ${esc(g.gender)}` : ''}</nav>
<p class="g-kicker">${g.gender ? `<span class="gender g-${esc(g.gender)}">${esc(g.gender === '공용' ? '남녀공용' : g.gender)}</span>` : ''}${esc(guideName(g))}</p>
<h1>${esc(g.title)}</h1>
${updatedTag(g.updated)}
${skillGroups(g).length ? '' : conclusionBox(g, rankedPicks(g), null)}
<section class="prose"><p>${esc(g.intro)}</p></section>
${criteriaBox(g)}
<nav class="toc">${mergedInto(g).some((m) => m.grinds) ? '<a href="#vokey">보키 그라인드 비교</a>' : ''}<a href="#cmp">비교표</a><a href="#tiers">수준별 비교</a>${g.picks.some((pk) => pk.dist) ? '<a href="#dist">비거리 비교</a>' : ''}<a href="#scores">항목별 점수</a><a href="#models">모델별 분석</a><a href="#choose">선택 가이드</a><a href="#faq">자주 묻는 질문</a></nav>
<section id="cmp">${infographic(g)}${offerlessList(g)}</section>
${skillNav(g)}<div id="tiers">${tierCompare(g)}</div>
<div id="dist">${distCompare(g)}</div>
<section id="scores"><h2>한눈에 비교: 항목별 점수</h2><div class="tablewrap"><table class="scores"><thead><tr><th>모델</th>${crit.map((c) => `<th>${esc(c)}</th>`).join('')}<th>종합</th><th></th></tr></thead><tbody>${scoreRows}</tbody></table></div>
<p class="note score-note">※ ${SCORE_NOTE}</p>
</section>
<div id="models">${cards}</div>
<section id="choose" class="choose"><h2>선택 가이드: 이렇게 고르세요</h2>
<div class="choose-pick">${stagedPicks(g)
        .map((pk) => `<a href="/p/${pk.id}"><span class="tierline">${pk.skill ? `<span class="skill sk-${SKILLS.indexOf(pk.skill) + 1}">${pk.skill}</span>` : ''}<span class="badge mid">${esc(pk.role)}</span>${unisexBadge(pk)}</span><b>${esc(byId[pk.id].p.name)}</b><small>${esc(pk.forWhom)}</small></a>`)
        .join('')}</div>
${figure(guideCat(g)?.id)}
<div class="prose">${g.sections.map((s) => `<h3>${esc(s.h)}</h3><p>${esc(s.p)}</p>`).join('')}</div></section>
${mergedInto(g)
  .map((m) => `<section id="vokey" class="merged"><h2>${esc(m.menuName ?? shortTitle(m.title))}</h2><p class="prose">${esc(m.intro)}</p>${grindCompare(m)}<div class="prose">${m.sections.map((x) => `<h3>${esc(x.h)}</h3><p>${esc(x.p)}</p>`).join('')}</div><div class="prose">${m.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</div></section>`)
  .join('')}
${vsGuideBlock(g)}
<section id="faq" class="prose"><h2>자주 묻는 질문</h2>${g.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>
${videoBlock(g)}
${qaRelatedBlock(QA.list, g.slug, esc)}
<section><h2>다른 비교·추천 가이드</h2>${guideGrid(pageGuides.filter((o) => o.slug !== g.slug))}</section>
${skillGroups(g).length ? stickyBuy(rankedPicks(g).find((pk) => pk.skill === SKILLS[0]), `${SKILLS[0]} 1위`) : stickyBuy(rankedPicks(g)[0])}`,
    }),
  );
}

// 실력 단계 바로가기 칩
function skillNav(g, active) {
  const gs = skillGroups(g);
  if (!gs.length) return '';
  return `<nav class="skillnav" aria-label="실력별 비교"><span>실력별 비교</span><a href="/g/${g.slug}"${active ? '' : ' class="on"'}>전체 ${rankedPicks(g).length}종</a>${gs
    .map((x) => `<a href="${skillPath(g, x.skill)}"${x.skill === active ? ' class="on"' : ''}><span class="skill sk-${SKILLS.indexOf(x.skill) + 1}">${x.skill}</span> ${x.ids.length}종</a>`)
    .join('')}</nav>`;
}
// 실력 단계별 비교 페이지: 해당 실력대 상품을 순위 순으로
for (const g of pageGuides) {
  const c = guideCat(g);
  const who = g.gender && g.gender !== '공용' ? `${g.gender} ` : '';
  for (const { skill, ids } of skillGroups(g)) {
    const ps = rankedPicks(g).filter((pk) => ids.includes(pk.id));
    const levels = LEVELS.filter((l) => l && ps.some((pk) => priceLevel(pk.id)?.label === l));
    const name = `${who}${SKILL_WORD[skill]} ${c?.name ?? ''}`;
    const h = howtoOf(g, skill);
    writeText(
      join(OUT, 'g', `${g.slug}-${SKILL_EN[skill]}.html`),
      layout({
        title: guideTitle(g, skill),
        raw: true,
        desc: guideDesc(g, skill),
        path: skillPath(g, skill),
        ld: [
          crumbLd([['홈', '/'], [c?.name ?? '', `/c/${c?.id}`], [guideName(g), `/g/${g.slug}`], [`${SKILL_WORD[skill]}`, skillPath(g, skill)]]),
          listLd(`${name} 추천`, ps.map((pk) => pk.id)),
          ...(h?.faq?.length ? [faqLd(h.faq)] : []),
        ],
        body: `<nav class="crumb"><a href="/">홈</a> › <a href="/c/${c?.id}">${esc(c?.name ?? '')}</a>${who ? ` › <a href="/g/${g.slug}">${esc(g.gender)}</a>` : ''} › ${esc(SKILL_WORD[skill])}</nav>
<p class="g-kicker"><span class="skill sk-${SKILLS.indexOf(skill) + 1}">${skill}</span>${esc(guideName(g))}</p>
<h1>${esc(name)} 추천 비교 <small>${ps.length}종 · ${esc(levels.join('·'))}</small></h1>
${updatedTag(max2(g.updated, h?.updated))}
${conclusionBox(g, ps, skill)}
${criteriaBox(g)}
${skillNav(g, skill)}
<section id="cmp">${infographic(g, null, { ids, title: `${name} 순위` })}</section>
${howtoBlock(h)}
${distCompare(g, ids)}
<section class="choose"><h2>${esc(SKILL_WORD[skill])}에게 맞는 선택</h2><div class="choose-pick">${ps
          .map((pk) => `<a href="/p/${pk.id}"><span class="tierline"><span class="badge good">${esc(stageRank(g, pk.id)?.label ?? '')}</span>${levelBadge(pk.id)}<span class="badge mid">${esc(pk.role)}</span>${unisexBadge(pk)}</span><b>${esc(byId[pk.id].p.name)}</b><small>${esc(pk.forWhom)}</small><small class="vd">${esc(pk.verdict ?? '')}</small></a>`)
          .join('')}</div></section>
<p class="note score-note">※ ${SCORE_NOTE}</p>
${vsTierBlock(g, skill)}
<a class="more-link" href="/g/${g.slug}">${esc(guideName(g))} 전체 보기 ›</a>
${stickyBuy(ps[0])}`,
      }),
    );
  }
}

// ---------- 메인 페이지 ----------
const deals = tracked.filter((e) => e.a.verdict.cls === 'good');


// 에누리식 상품 타일: 큰 이미지, 이름, 배지, 점수, 가격(기록이 있을 때)
function ptile({ p, hist, a }) {
  const image = imageOf(p.id, hist);
  const sc = scoreOf[p.id];
  const rocket = picks[p.id]?.rocket;
  return `<a class="ptile" href="/p/${p.id}">
<div class="pt-img">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="212" height="212">` : `<span class="ph">${esc(catName[p.category]?.slice(0, 1) ?? '')}</span>`}</div>
<div class="pt-body"><span class="pt-cat">${esc(catName[p.category])}</span><h3>${esc(p.name)}</h3>
<div class="pt-badges">${rocket ? '<span class="tag rocket">로켓배송</span>' : ''}${sc ? `<span class="tag score">편집 점수 ${sc.toFixed(1)}</span>` : ''}</div>
${priceTag(p.id, a)}${priceLine(p.id, 'pt-won')}<p class="pt-cta">특징·비교 보기 ›</p></div>
</a>`;
}
function prow(items) { return `<div class="prow">${items.map(ptile).join('')}</div>`; }

// 움직이는 비교 배너: 가이드마다 한 장, 상품 4개의 종합 점수 막대
const BANNER_TONES = { driver: 'tone-a', putter: 'tone-b', ball: 'tone-c', rangefinder: 'tone-d', shoes: 'tone-e', set: 'tone-f' };
function banner(g, i) {
  const ps = g.picks.filter((pk) => byId[pk.id]);
  const ranked = [...ps].sort((x, y) => (y.scores ? avg(y.scores) : 0) - (x.scores ? avg(x.scores) : 0));
  const top = ranked[0];
  const tone = BANNER_TONES[byId[ps[0].id].p.category] ?? 'tone-a';
  return `<a class="slide ${tone}${i === 0 ? ' on' : ''}" href="/g/${g.slug}" aria-label="${esc(g.title)}">
<div class="sl-text">
<span class="sl-badge">${ps.length}종 비교</span>
<h2>${esc(shortTitle(g.title))}</h2>
<p class="sl-sub">${esc(g.title.split(':')[1]?.trim() ?? '')}</p>
${top?.scores ? `<p class="sl-top">종합 1위 <b>${esc(byId[top.id].p.name)}</b> <span>${avg(top.scores).toFixed(1)}점</span></p>` : ''}
<ul class="sl-bars">${ranked
    .map((pk) => {
      const s = pk.scores ? avg(pk.scores) : 0;
      return `<li><span class="nm">${esc(byId[pk.id].p.name)}</span><span class="bar"><i style="width:${(s / 5) * 100}%"></i></span><b>${s.toFixed(1)}</b></li>`;
    })
    .join('')}</ul>
<span class="sl-cta">비교 전체 보기 ›</span>
</div>
<div class="sl-imgs">${ranked.filter((pk) => imageOf(pk.id, byId[pk.id].hist)).slice(0, 4).map((pk) => `<img src="${esc(imageOf(pk.id, byId[pk.id].hist))}" alt="" loading="${i === 0 ? 'eager' : 'lazy'}">`).join('')}</div>
</a>`;
}

// 홈: ① 한 문장 소개 + 카테고리 바로가기 ② 내 실력에 맞는 장비 찾기 ③ 대표 가이드 ④ 최근 가격 하락(기록이 있을 때) ⑤ 고지
const homeCats = cats
  .map((c) => `<a href="/c/${c.id}"><span class="ci">${catIcon(c)}</span><span>${esc(c.name)}</span></a>`)
  .join('');
// 장비 찾기 데이터: 가이드 속 판매처 있는 상품 (아이템·성별·실력·가격대)
const finderData = {
  items: pageGuides.flatMap((g) =>
    rankedPicks(g).map((pk) => {
      const { p, hist } = byId[pk.id];
      const sp = freshPrice(p.id);
      return { c: p.category, g: g.gender ?? '공용', s: pk.skill ?? '', lv: priceLevel(p.id)?.n ?? 0, n: p.name, i: imageOf(p.id, hist) ?? '', u: `/p/${p.id}`, r: pk.role, sc: +totalScore(pk).toFixed(1), pr: sp?.won ?? 0, pd: sp ? dayLabel(sp.d) : '', x: pk.unisex ? 1 : 0, l: outHref(p.id) ?? '', w: warned(g, pk) ? 1 : 0 };
    }),
  ),
  pages: pageGuides.map((g) => ({ c: guideCat(g)?.id, g: g.gender ?? '공용', u: `/g/${g.slug}`, sk: Object.fromEntries(skillGroups(g).map((x) => [x.skill, skillPath(g, x.skill)])) })),
};
const finderCats = cats.filter((c) => pageGuides.some((g) => guideCat(g)?.id === c.id));
const FEATURED = ['driver-recommend-2026', 'womens-driver-recommend', 'iron-recommend', 'womens-iron-recommend', 'putter-recommend', 'wedge-recommend'];
const featured = FEATURED.map((slug) => pageGuides.find((g) => g.slug === slug)).filter(Boolean);
// 최근 가격 하락: API 기록이 7일 이상 쌓인 상품 중 7일 전보다 3% 이상 내린 것
const drops = tracked
  .filter((e) => e.a.change7 != null && e.a.change7 < 0 && Math.abs(e.a.change7) / (e.a.cur - e.a.change7) >= 0.03 && sellable(e.p.id))
  .sort((x, y) => x.a.change7 / (x.a.cur - x.a.change7) - y.a.change7 / (y.a.cur - y.a.change7))
  .slice(0, 8);

writeText(
  join(OUT, 'index.html'),
  layout({
    title: SITE_NAME,
    desc: `드라이버·우드·유틸리티·아이언·웨지·퍼터부터 골프공·거리측정기·골프화까지 ${cats.length}개 골프용품을 실력(초심자~프로)·성별·가격대별로 비교합니다. 장단점과 주관적 편집 점수, 쿠팡 판매가를 함께 정리했습니다.`,
    path: '/',
    body: `<section class="hhero">
<h1>골프용품을 <em>실력·성별·가격대</em>별로 비교해, 나에게 맞는 모델과 쿠팡 판매가를 한 번에 보여 드립니다.</h1>
<p>${pageGuides.length}개 비교 가이드 · ${entries.filter((e) => sellable(e.p.id)).length}개 상품 · 점수는 주관적 참고 점수이며 순위는 같은 실력 단계 안에서만 매깁니다.</p>
<nav class="hcats" aria-label="카테고리 바로가기">${homeCats}</nav>
</section>

<section class="finder" id="finder"><h2>내 실력에 맞는 장비 찾기</h2>
<form class="finder-f" onsubmit="return false">
<label>아이템<select name="c">${finderCats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
<label>성별<select name="g"><option value="">전체</option><option>남성</option><option>여성</option></select></label>
<label>실력<select name="s"><option value="">전체</option>${SKILLS.map((x) => `<option>${x}</option>`).join('')}</select></label>
<label>예산<select name="lv"><option value="0">전체</option>${LEVELS.slice(1).map((l, i) => `<option value="${i + 1}">${l}</option>`).join('')}</select></label>
</form>
<div class="finder-r" id="finderR"></div>
<script type="application/json" id="finderData">${JSON.stringify(finderData).replace(/</g, '\\u003c')}</script>
</section>

<section class="block" id="guides"><div class="block-h"><h2>대표 비교 가이드</h2><span>실력 단계별 5종씩 비교</span></div>${guideGrid(featured)}
<details class="allguides"><summary>모든 비교 가이드 보기 (${pageGuides.length}개)</summary><ul>${pageGuides.map((g) => `<li><a href="/g/${g.slug}">${esc(guideName(g))}</a> <small>${rankedPicks(g).length}종</small></li>`).join('')}</ul></details></section>

${drops.length ? `<section class="block drops"><div class="block-h"><h2>최근 가격 하락</h2><span>7일 전 기록보다 내린 상품</span></div>${prow(drops)}</section>` : ''}

<section class="hnote"><p>※ ${SCORE_NOTE}</p><p>※ ${PRICE_NOTE}</p></section>`,
  }),
);

// ---------- 검색 ----------
writeText(
  join(OUT, 'assets', 'search.json'),
  JSON.stringify({
    products: entries.map((e) => ({
      id: e.p.id,
      n: e.p.name,
      k: `${e.p.query} ${catName[e.p.category]} ${(e.p.must ?? []).join(' ')} ${(e.p.mustAny ?? []).join(' ')}`,
      c: catName[e.p.category],
      u: `/p/${e.p.id}`,
      i: imageOf(e.p.id, e.hist) ?? '',
      d: e.p.summary,
      s: scoreOf[e.p.id] ? +scoreOf[e.p.id].toFixed(1) : null,
      r: !!picks[e.p.id]?.rocket,
      l: outHref(e.p.id) ?? e.p.external?.url ?? '',
      st: links[e.p.id] ? '쿠팡' : e.p.external?.store ?? '',
      pr: null,
      lv: priceLevel(e.p.id)?.label ?? '',
      lvn: priceLevel(e.p.id)?.n ?? 0,
    })),
    guides: pageGuides.map((g) => ({
      t: g.title,
      u: `/g/${g.slug}`,
      k: g.desc,
      crit: g.criteria ?? [],
      picks: rankedPicks(g)
        .map((pk) => ({ id: pk.id, n: byId[pk.id].p.name, role: pk.role, s: pk.scores ? +avg(pk.scores).toFixed(1) : null, sc: pk.scores ?? [], pro: pk.pros?.[0] ?? '', con: pk.cons?.[0] ?? '', i: imageOf(pk.id, byId[pk.id].hist) ?? '', u: `/p/${pk.id}` }))
        .sort((x, y) => (y.s ?? 0) - (x.s ?? 0)),
    })),
  }),
);
writeText(
  join(OUT, 'search.html'),
  layout({
    title: '검색',
    desc: `${SITE_NAME} 검색`,
    path: '/search',
    body: `<h1 id="sTitle">검색</h1><div id="sResults" class="sresults"></div>`,
  }).replace('<meta name="description"', '<meta name="robots" content="noindex">\n<meta name="description"'),
);

// ---------- 운영 안내 ----------
// 운영자 소개·문의는 config/site.json 의 about.operator / about.contact 를 채우면 표시된다 (비어 있으면 숨김)
const ABOUT = SITE.about ?? {};
writeText(
  join(OUT, 'about.html'),
  layout({
    title: '운영 안내: 점수·가격 수집·업데이트 방법',
    desc: `${SITE_NAME}가 골프용품 점수를 매기는 방법, 쿠팡 판매가를 확인·기록하는 방법, 업데이트 주기와 제휴 안내입니다.`,
    path: '/about',
    ld: [crumbLd([['홈', '/'], ['운영 안내', '/about']])],
    body: `<h1>운영 안내</h1>
<nav class="toc"><a href="#what">사이트 소개</a>${ABOUT.operator ? '<a href="#operator">운영자</a>' : ''}<a href="#score">점수 매기는 방법</a><a href="#price">가격 수집 방법</a><a href="#update">업데이트 주기</a><a href="#ad">제휴 안내</a></nav>
<section class="prose" id="what">
<h2>무엇을 하는 사이트인가요?</h2>
<p>드라이버부터 골프공·거리측정기까지 ${cats.length}개 골프용품을 실력 단계(초심자·중급·고급·프로)와 성별, 가격대로 나눠 비교합니다. 제조사 공개 정보와 보도된 투어 소식, 일반적인 사용자 평가를 모아 정리한 <b>비교 정보</b>이며, 이 사이트가 제품을 직접 시타·측정한 결과는 아닙니다.</p>
</section>
${ABOUT.operator ? `<section class="prose" id="operator"><h2>운영자 소개</h2>${String(ABOUT.operator).split('\n').map((t) => `<p>${esc(t)}</p>`).join('')}${ABOUT.contact ? `<p>문의: ${esc(ABOUT.contact)}</p>` : ''}</section>` : ''}
<section class="prose" id="score">
<h2>점수 매기는 방법</h2>
<ul>
<li>가이드마다 4개 비교 항목(예: 드라이버는 관용성·타구감·초보 적합·가성비)을 정하고, 각 항목을 5점 만점으로 매깁니다.</li>
<li>편집 점수는 4개 항목 점수를 <b>같은 비중(각 25%)으로 평균</b>한 값입니다.</li>
<li>실력 단계마다 기대하는 성능이 달라(예: 초심자는 관용성, 프로는 조작성), <b>순위는 같은 실력 단계 안에서만</b> 매깁니다. 단계가 다른 제품을 한 줄로 세운 '종합 순위'는 두지 않습니다.</li>
<li>점수 근거: 제조사 공개 사양, 보도된 투어 사용 소식(출처 표기), 일반적인 사용자 평가, 확인 시점의 판매가. 직접 측정한 시험 결과가 아니며 개인의 체형·스윙에 따라 체감은 다릅니다.</li>
<li>비거리 점수(드라이버)는 헤드 설계로 본 거리 잠재력에 대한 주관적 참고값(10점 만점)입니다.</li>
<li>쿠팡에 국내 정품 판매처가 없는 모델은 가격을 확인할 수 없어 순위에서 빼고 '판매처 없음'으로 따로 표시합니다.</li>
</ul>
<p class="note">※ ${SCORE_NOTE}</p>
</section>
<section class="prose" id="price">
<h2>가격 수집 방법</h2>
<p>${PRICE_NOTE}</p>
<ul>
${(NOTICES.priceDetails?.[PRICE_MODE] ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}
<li>"사기 좋은 때" 판단: 역대 최저가와 2% 이내면 '역대 최저가 근처', 최근 30일 평균보다 5% 이상 낮으면 '평소보다 저렴', 5% 이상 높으면 '평소보다 비쌈', 기록이 7일 미만이면 '데이터 수집 중'입니다.</li>
<li>해외직구·구매대행·병행수입 상품은 비교와 가격 기록에서 뺍니다.</li>
</ul>
</section>
<section class="prose" id="update">
<h2>업데이트 주기</h2>
<ul>
<li>가이드와 상품 정보: 신모델 출시나 판매처 변경이 있을 때 고치며, 각 페이지 상단에 '마지막 업데이트' 날짜를 적습니다.</li>
<li>가격: API 승인 뒤 매일 자동 기록, 사이트는 하루 한 번 다시 만들어집니다. 가격만 바뀐 경우에는 '마지막 업데이트' 날짜를 바꾸지 않습니다.</li>
<li>가격대 단계와 동점 순위에 쓰는 기준가는 가격이 10% 이상 변했을 때나 주 1회 정기 재계산 때만 바뀌어, 순위가 매일 흔들리지 않습니다.</li>
</ul>
</section>
<section class="prose" id="ad">
<h2>제휴 안내</h2>
<p>${DISCLOSURE} 링크를 통해 구매하셔도 구매자에게 추가 비용은 없습니다. 쿠팡 외 판매처(공식몰) 링크는 제휴 링크가 아니며 수수료를 받지 않습니다.</p>
<p>상품 이미지는 쿠팡 파트너스가 제공하는 이미지이며, 설명 그림은 이 사이트가 직접 그린 개념도입니다.</p>
</section>`,
  }),
);

// ---------- 없어진 페이지 주소 이동 (Cloudflare Pages _redirects) ----------
// 상품이 3종 미만이라 만들지 않는 실력별 페이지 → 상위 가이드, 합쳐진 가이드 → 합친 가이드
const REDIRECTS = [
  ...pageGuides.flatMap((g) => SKILLS.filter((sk) => g.picks.some((pk) => pk.skill === sk) && !skillGroups(g).some((x) => x.skill === sk)).map((sk) => `${skillPath(g, sk)} /g/${g.slug} 301`)),
  ...guides.filter((g) => g.mergeInto).map((g) => `/g/${g.slug} /g/${g.mergeInto}#vokey 301`),
  ...VS_GONE,
];
const STATIC_REDIRECTS = [
    '/c/set / 301',
    '/g/beginner-full-set / 301',
    '/g/budget-golf-ball /c/ball 301',
    '/p/pgm-vct3-set / 301',
    '/p/callaway-xr-set / 301',
    '/p/xxio14-set / 301',
    '/p/taylormade-rbz-sl2-set / 301',
    '/p/honma-d1-ball /c/ball 301',
    '/p/srixon-distance-ball /c/ball 301',
    '/p/callaway-supersoft-ball /c/ball 301',
    '/p/titleist-velocity-ball /c/ball 301',
    '/p/taylormade-sim2-max-women-driver /c/driver 301',
    '/p/nike-infinity-g-shoes /c/shoes 301',
    '/p/voicecaddie-laser-fit2 /c/rangefinder 301',
    '/p/scotty-cameron-phantom-putter /c/putter 301',
];
rawWrite(join(OUT, '_redirects'), [...STATIC_REDIRECTS, ...REDIRECTS].join('\n') + '\n');

// ---------- 검색엔진용 파일 ----------
// 사이트맵 lastmod = 콘텐츠 업데이트일 (가격만 바뀐 날은 반영하지 않는다)
// 초보 Q&A 글 (/qa)
const QA_URLS = DEMO ? [] : writeQaPages({ list: QA.list, layout, writeText, esc, OUT, crumbLd, faqLd, updatedTag, guideName, guideBySlug: (s) => pageGuides.find((g) => g.slug === s), siteUrl: SITE_URL, siteName: SITE_NAME });
// A vs B 비교 페이지
writeVsPages();
// 일본 골프채 정가 비교 (/jp, 새 섹션)
const JP_URLS = DEMO ? [] : writeJpPages({ layout, writeText, esc, won, OUT, crumbLd, updatedTag, hasProduct: (id) => !!entryById[id], productName: (id) => entryById[id]?.p.name ?? id });
const urls = [
  '/',
  '/about',
  ...QA_URLS,
  ...pageGuides.map((g) => `/g/${g.slug}`),
  ...pageGuides.flatMap((g) => skillGroups(g).map((x) => skillPath(g, x.skill))),
  ...cats.map((c) => `/c/${c.id}`),
  ...entries.map((e) => `/p/${e.p.id}`),
  ...VS_PAIRS.map((v) => v.path),
  ...JP_URLS,
].map((u) => [u, pageDates[u] ?? TODAY]);

// URL 보호: 한 번 공개한 주소(config/url-manifest.json)가 사라지면 경고하고, _redirects 에 301 이 없으면 빌드를 멈춘다
if (!DEMO) {
  const MANIFEST = join(ROOT, 'config', 'url-manifest.json');
  const known = readJson(MANIFEST, null);
  const now = new Set(urls.map(([u]) => u));
  const redirectFrom = new Map([...STATIC_REDIRECTS, ...REDIRECTS].map((l) => l.split(/\s+/)).map(([f, t, c]) => [f, { t, c }]));
  // 한 번이라도 공개한 주소 중 지금 없는 것은 모두 301 이 있어야 한다. 경고는 직전 빌드 이후 새로 사라진 주소만
  const gone = (known?.urls ?? []).filter((u) => !now.has(u));
  const missing = gone.filter((u) => redirectFrom.get(u)?.c !== '301');
  const newlyGone = (known?.live ?? []).filter((u) => !now.has(u));
  if (newlyGone.length) console.warn(`경고: 직전 빌드에 있던 주소 ${newlyGone.length}개가 사라졌습니다.\n${newlyGone.map((u) => `  ${u} → ${redirectFrom.get(u)?.t ?? '(리다이렉트 없음)'}`).join('\n')}`);
  if (missing.length) {
    console.error(`빌드 중단: 사라진 주소에 301 리다이렉트가 없습니다. _redirects 규칙을 추가하세요.\n${missing.map((u) => '  ' + u).join('\n')}`);
    process.exit(1);
  }
  // 삭제된 페이지도 IndexNow 로 알린다
  for (const u of Object.keys(prevState?.pages ?? {})) if (!state.pages[u] && !SEEDING) state.pending.push({ url: u, kind: 'removed', d: TODAY });
  const all = [...new Set([...(known?.urls ?? []), ...now, ...(known ? [] : [...redirectFrom.keys()])])].sort();
  writeFileSync(MANIFEST, JSON.stringify({ _설명: 'build.mjs 가 관리. urls: 한 번이라도 공개한 주소(사라지면 _redirects 에 301 이 있어야 빌드 통과), live: 직전 빌드의 주소(새로 사라진 주소 경고용).', urls: all, live: [...now].sort() }, null, 2) + '\n');
  // 같은 주소가 여러 번 쌓이지 않게 정리
  const seen = new Set();
  state.pending = state.pending.reverse().filter((x) => !seen.has(x.url) && seen.add(x.url)).reverse();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  if (state.pending.length) console.log(`IndexNow 대기열: ${state.pending.length}개 (node src/indexnow.mjs 로 전송)`);
}
// 클릭 추적용 이동 표 (functions/go/[id].js 가 읽는다)
rawWrite(join(OUT, 'assets', 'go.json'), JSON.stringify(Object.fromEntries(config.products.map((p) => [p.id, rawLink(p.id)]).filter(([, v]) => v))));
// AI 검색·도우미용 안내 (llms.txt): 사이트가 무엇이고 어떤 페이지가 있는지 AI 가 읽기 쉬운 형태로
if (!DEMO) {
  const line = (g) => {
    const ps = rankedPicks(g);
    const pr = priceRange(ps.map((pk) => pk.id));
    return `- [${guideName(g)}](${SITE_URL}/g/${g.slug}): ${ps.length}종${pr ? `, 쿠팡 판매가 ${won(pr.min)}~${won(pr.max)}` : ''}. ${g.desc}`;
  };
  const skillLines = pageGuides.flatMap((g) => skillGroups(g).map((x) => `- [${guideName(g).replace(' 비교 및 선택 가이드', '')} ${SKILL_WORD[x.skill]}](${SITE_URL}${skillPath(g, x.skill)}): ${x.ids.length}종`));
  rawWrite(
    join(OUT, 'llms.txt'),
    `# ${SITE_NAME}

> 골프용품(드라이버·우드·유틸리티·아이언·웨지·퍼터·골프공·거리측정기·GPS 시계·스윙 분석기·골프화·골프백·장갑·연습용품)을 실력 단계(초보·중급자·상급자·프로)와 성별, 가격대(저가~프리미엄)별로 비교하는 한국어 사이트입니다.

- 점수: ${SCORE_NOTE}
- 순위: 실력 단계가 다른 제품끼리는 순위를 매기지 않고, 같은 실력 단계 안에서만 매깁니다. 초보 기준(로프트·샤프트)에 맞지 않는 연결 상품은 '옵션 확인 필요'로 표시하고 순위에서 뺍니다.
- 가격: ${PRICE_NOTE}
- 제휴: ${DISCLOSURE} 상품 링크는 쿠팡 파트너스 링크입니다.
- 운영 안내(점수·가격 수집 방법): ${SITE_URL}/about

## 비교 가이드
${pageGuides.map(line).join('\n')}

## 실력별 비교
${skillLines.join('\n')}

${QA.list.length ? `## 초보 Q&A
${QA.list.map((a) => `- [${a.title}](${SITE_URL}/qa/${a.slug}): ${a.desc}`).join('\n')}

` : ''}## 1:1 비교 (A vs B)
${VS_PAIRS.map((v) => `- [${vsName(v.a)} vs ${vsName(v.b)}](${SITE_URL}${v.path})`).join('\n')}

## 일본 골프채 정가 비교
${JP_URLS.length ? `- [일본 골프채 가격 비교: 일본 정가 vs 한국 정가](${SITE_URL}/jp): 일본 제조사 정가와 한국 공식 정가를 환율로 비교, 직구 세금은 관세청 안내 링크
- [일본 골프채 직구 세금·통관 안내](${SITE_URL}/jp/customs)` : ''}

## 카테고리
${cats.map((c) => `- [${c.name}](${SITE_URL}/c/${c.id})`).join('\n')}
`,
  );
}
// 빌드 버전 파일
rawWrite(join(OUT, 'version.json'), JSON.stringify({ commit: BUILD_COMMIT, builtAt: `${BUILD_AT} KST` }));
// IndexNow 키 파일
if (SITE.indexNowKey && !DEMO) rawWrite(join(OUT, `${SITE.indexNowKey}.txt`), SITE.indexNowKey);
rawWrite(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([u, d]) => `<url><loc>${SITE_URL}${u}</loc><lastmod>${d}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeText(join(OUT, 'robots.txt'), DEMO ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /go/\nDisallow: /admin\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

{
  const n = pageGuides.reduce((s2, g) => s2 + g.picks.filter((pk) => byId[pk.id] && issuesOf(g, pk).length).length, 0);
  if (n) console.log(`참고: 초보 기준(로프트·샤프트)에 맞지 않는 연결 상품 ${n}개 — node src/audit.mjs 로 목록 확인, config/variants.json 으로 교체`);
}
console.log(`사이트 생성 완료: 상품 ${entries.length}개 (가격 기록 ${tracked.length}개, 가이드 ${entries.length - tracked.length}개) → site/${DEMO ? ' (샘플 데이터)' : ''}`);
