// 상품 설정과 가격 기록으로 정적 사이트(site/)를 만든다.
// 가격 기록이 없는 상품은 구매 가이드 페이지로, 있는 상품은 가격 추이 페이지로 만든다.
// 사용: node src/build.mjs        → 실제 데이터 (data/)
//       node src/build.mjs --demo → 샘플 데이터 (data-demo/)
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig, loadLinks, historyDir, readJson, writeText, todayKst } from './lib.mjs';

const DEMO = process.argv.includes('--demo');
const SITE_URL = (process.env.SITE_URL || 'https://golf-price.pages.dev').replace(/\/$/, '');
const SITE = readJson(join(ROOT, 'config', 'site.json'), {});
const SITE_NAME = SITE.name || 'ATL골프기어';
const LOGO_SVG = readFileSync(join(ROOT, 'src', 'figures', 'logo.svg'), 'utf8').replace(/role="img" aria-label="[^"]*"/, 'aria-hidden="true"');
const OUT = join(ROOT, 'site');
const DISCLOSURE = '이 사이트는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
const PRICE_NOTE = '가격은 쿠팡 상품 검색 결과 중 조건에 맞는 새 상품의 최저가를 하루 한 번 기록한 값으로, 옵션(샤프트, 사이즈 등)과 시점에 따라 실제 판매가와 다를 수 있습니다.';

const config = loadConfig();
const links = loadLinks();
const picks = readJson(join(ROOT, 'config', 'picks.json'), {});
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
  return src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '<span>⛳</span>';
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
<button type="button" class="hd-ico" id="recentBtn"><span class="hd-ico-i">🕘</span>최근 본 상품<b id="recentCount"></b></button>
<a class="hd-ico" href="/#guides"><span class="hd-ico-i">📊</span>비교 가이드</a>
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
                `<a href="/g/${g.slug}"><span class="gender g-${esc(g.gender ?? '공용')}">${esc(g.gender && g.gender !== '공용' ? g.gender : '남녀공용')}</span><span class="qsub-t"><b>${esc(g.gender && g.gender !== '공용' ? `${g.gender} ${c.name}` : c.name)}</b><small>비교 및 선택 가이드</small></span></a>`,
            )
            .join('')}<a href="/c/${c.id}" class="qsub-all">${esc(c.name)} 전체 비교 ›</a></div>`
        : '';
      return `<div class="qitem"><a href="/c/${c.id}">${esc(c.name)}</a>${sub}</div>`;
    })
    .join('')}<a href="/#guides" class="hl">비교·추천</a></div>
</div></nav>`;
}

function layout({ title, desc, path, body, recent }) {
  const full = title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE_URL}${path}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}${path}">
${DEMO ? '<meta name="robots" content="noindex">' : path === '/' ? VERIFY : ''}
<link rel="stylesheet" href="/assets/style.css">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
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
</footer>
<script src="/assets/app.js" defer></script>
</body>
</html>
`;
}

const imageOf = (id, hist) => hist?.latest?.image ?? picks[id]?.image;
// 확인일 기준 쿠팡 판매가 (API 가격 기록이 있으면 그 값을 우선)
const PRICE_DATE = SITE.priceCheckedAt ?? '';
const priceDateLabel = PRICE_DATE ? `${+PRICE_DATE.slice(5, 7)}.${+PRICE_DATE.slice(8, 10)}` : '';
const pickPrice = (id) => picks[id]?.price ?? null;
// 가격 수준: 같은 비교 안에서 가장 싼 상품 대비 상대 단계 (숫자 가격은 표시하지 않음)
const LEVELS = ['', '합리적', '보통', '높은 편', '최고가'];
function priceLevel(id) {
  const g = guides.find((x) => x.picks.some((pk) => pk.id === id));
  if (!g) return null;
  const prices = g.picks.map((pk) => pickPrice(pk.id)).filter(Boolean);
  const p = pickPrice(id);
  if (!p || !prices.length) return null;
  const r = p / Math.min(...prices);
  const n = r <= 1.3 ? 1 : r <= 2 ? 2 : r <= 3 ? 3 : 4;
  return { n, label: LEVELS[n], marks: '₩'.repeat(n) };
}
const levelBadge = (id) => {
  const lv = priceLevel(id);
  return lv ? `<span class="lvl lvl-${lv.n}"><i>${lv.marks}</i>${lv.label}</span>` : '';
};
// 가격 수준 + 쿠팡 링크
function levelLink(id, hist, extra = '쿠팡에서 가격 보기 ›') {
  const lv = priceLevel(id);
  const link = links[id] ?? hist?.latest?.link;
  if (!lv) return '';
  const inner = `<span class="lvl lvl-${lv.n}"><i>${lv.marks}</i>${lv.label}</span>${link ? `<small>${extra}</small>` : ''}`;
  return link ? `<a class="lvl-link" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener">${inner}</a>` : `<span class="lvl-link">${inner}</span>`;
}
function priceTag(id, a, cls = 'pt-price') {
  const b = levelBadge(id);
  return b ? `<p class="${cls}">${b}</p>` : '';
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
  const link = links[id] ?? hist?.latest?.link;
  if (!link) return '';
  const linked = links[id] ? picks[id]?.title : hist?.latest?.title;
  return `${linked ? `<p class="linked">연결 상품: ${esc(linked)}</p>` : ''}
<a class="btn" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener">쿠팡에서 가격 확인하기</a>
<p class="note">위 버튼은 쿠팡 파트너스 링크입니다. ${DISCLOSURE}</p>`;
}

function card({ p, hist, a }) {
  const image = imageOf(p.id, hist);
  const img = image
    ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">`
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

// ---------- 데이터 읽기 ----------
const dir = historyDir(DEMO);
const entries = config.products.map((p) => {
  const hist = readJson(join(dir, `${p.id}.json`));
  return { p, hist, a: hist?.points?.length ? analyze(hist.points) : null };
});
const tracked = entries.filter((e) => e.a);
const updated = tracked.map((e) => e.a.last.d).sort().at(-1) ?? todayKst();

rmSync(OUT, { recursive: true, force: true });
writeText(join(OUT, 'assets', 'style.css'), readFileSync(join(ROOT, 'src', 'style.css'), 'utf8'));
writeText(join(OUT, 'assets', 'app.js'), readFileSync(join(ROOT, 'src', 'app.js'), 'utf8'));
writeText(join(OUT, 'assets', 'logo.svg'), readFileSync(join(ROOT, 'src', 'figures', 'logo.svg'), 'utf8'));

// ---------- 비교·추천 가이드 데이터와 타일 ----------
const guides = readJson(join(ROOT, 'config', 'guides.json'), { guides: [] }).guides;
const byId = Object.fromEntries(entries.map((e) => [e.p.id, e]));
const SCORE_NOTE = '점수는 제조사 공개 정보, 보도된 투어 소식, 일반적인 사용자 평가와 현재 판매가를 바탕으로 이 사이트가 매긴 주관적인 참고 점수입니다. 직접 측정한 시험 결과나 공식 평가가 아니며, 개인의 체형·스윙에 따라 체감은 다를 수 있습니다.';
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const dots = (n) => `<span class="dots" aria-label="5점 중 ${n}점">${'●'.repeat(n)}<i>${'●'.repeat(5 - n)}</i></span>`;
function guideTile(g) {
  const imgs = g.picks.map((pk) => byId[pk.id] && imageOf(pk.id, byId[pk.id].hist)).filter(Boolean).slice(0, 4);
  return `<a class="gcard" href="/g/${g.slug}">
<div class="gthumb">${imgs.map((src) => `<img src="${esc(src)}" alt="" loading="lazy">`).join('')}</div>
<div class="ginfo"><span class="badge good">${g.picks.length}개 비교</span><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p></div>
</a>`;
}
const guideGrid = (list) => `<div class="ggrid">${list.map(guideTile).join('')}</div>`;

const shortTitle = (t) => t.split(':')[0].trim();
// 상품별 최고 편집 점수 (가이드 점수 중 가장 높은 값)
const scoreOf = {};
for (const g of guides) for (const pk of g.picks) if (pk.scores?.length) scoreOf[pk.id] = Math.max(scoreOf[pk.id] ?? 0, avg(pk.scores));
// 가이드 안 상품을 종합 점수 순으로
const rankedPicks = (g) =>
  g.picks.filter((pk) => byId[pk.id]).sort((x, y) => (y.scores ? avg(y.scores) : 0) - (x.scores ? avg(x.scores) : 0));
// 가격대: 가이드 안에서 가장 싼 상품 대비 상대 비교 (2026-10 쿠팡 판매가 기준)
function priceTier(g, id) {
  const prices = g.picks.map((pk) => picks[pk.id]?.price).filter(Boolean);
  const p = picks[id]?.price;
  if (!p || !prices.length) return '';
  const r = p / Math.min(...prices);
  return '₩'.repeat(r <= 1.3 ? 1 : r <= 2 ? 2 : r <= 3 ? 3 : 4);
}
// 비교 인포그래픽 표: 제품을 열로, 비교 항목을 행으로
function infographic(g, highlight) {
  const ps = rankedPicks(g);
  const crit = g.criteria ?? [];
  const col = (pk, i) => {
    const { p, hist } = byId[pk.id];
    const image = imageOf(p.id, hist);
    return `<th class="${pk.id === highlight ? 'hl' : ''}"><a href="/p/${p.id}">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">` : ''}<span class="ig-rank">${i + 1}위</span><b>${esc(p.name)}</b><span class="ig-role">${esc(pk.role)}</span></a></th>`;
  };
  const row = (icon, label, cell, cls = '') =>
    `<tr class="${cls}"><th scope="row"><span class="ig-ico">${icon}</span>${label}</th>${ps.map((pk) => `<td class="${pk.id === highlight ? 'hl' : ''}">${cell(pk)}</td>`).join('')}</tr>`;
  return `<div class="ig-wrap"><div class="ig-head"><p class="ig-kicker">${esc(SITE_NAME)} 비교표</p><h3>${esc(shortTitle(g.title))} <span>${ps.length}종 한눈에 비교</span></h3></div>
<div class="tablewrap ig-scroll"><table class="ig"><thead><tr><th class="ig-corner"></th>${ps.map(col).join('')}</tr></thead><tbody>
${row('🏆', '종합 점수', (pk) => (pk.scores ? `<b class="ig-total">${avg(pk.scores).toFixed(1)}</b><span class="bar"><i style="width:${(avg(pk.scores) / 5) * 100}%"></i></span>` : '-'), 'r-total')}
${row('💬', '한마디', (pk) => `<b class="ig-short">${esc(pk.short ?? pk.role)}</b>`)}
${(g.specRows ?? []).map((label, si) => row('📐', esc(label.replace('연결 상품 ', '')), (pk) => `<span class="ig-spec">${esc(pk.specs?.[si] ?? '-')}</span>`)).join('')}
${row('👍', '강점', (pk) => `<span class="ig-plus">${esc(pk.plus ?? pk.pros?.[0] ?? '-')}</span>`)}
${row('👎', '약점', (pk) => `<span class="ig-minus">${esc(pk.minus ?? pk.cons?.[0] ?? '-')}</span>`)}
${crit.length ? row('📊', '항목별', (pk) => (pk.scores ? `<span class="ig-crits">${crit.map((c, i) => `<span><em>${esc(c.split('·')[0])}</em>${dots(pk.scores[i])}</span>`).join('')}</span>` : '-')) : ''}
${row('💰', '가격대', (pk) => levelLink(pk.id, byId[pk.id].hist, '쿠팡 ›'), 'r-price')}
</tbody></table></div>
<p class="note">점수는 주관적 참고 점수(공식 평가 아님) · 가격대는 이 비교 안에서의 상대 수준 · 가격대를 누르면 쿠팡(파트너스 링크)으로 이동</p></div>`;
}
const guidesFor = (catId) => guides.filter((g) => g.picks.some((pk) => byId[pk.id]?.p.category === catId));
const genderLabel = (g, c) => (g.gender && g.gender !== '공용' ? `${g.gender} ${c.name} 비교` : `${c.name} 비교`);
const guideCat = (g) => cats.find((c) => c.id === byId[g.picks[0]?.id]?.p.category);
const guideName = (g) => {
  const c = guideCat(g);
  return `${g.gender && g.gender !== '공용' ? `${g.gender} ` : ''}${c?.name ?? ''} 비교 및 선택 가이드`;
};

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
<div class="gal-main"><img id="galMain" src="${esc(imgs[0])}" alt="${esc(p.name)}"></div>
${imgs.length > 1 ? `<div class="gal-thumbs">${imgs.map((src, i) => `<button type="button" class="gal-t${i === 0 ? ' on' : ''}" data-src="${esc(src)}" aria-label="사진 ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
<p class="gal-note">쿠팡 판매 상품 사진 · 판매처마다 옵션 구성이 다를 수 있습니다</p>
</div>`;
}
const guidesOf = (id) => guides.filter((g) => g.picks.some((pk) => pk.id === id));
function analysis(p) {
  return guidesOf(p.id)
    .map((g) => {
      const ranked = rankedPicks(g);
      const rank = ranked.findIndex((pk) => pk.id === p.id) + 1;
      const pk = ranked[rank - 1];
      const total = pk.scores ? avg(pk.scores) : null;
      return `<section class="ana">
<div class="ana-head">
<div class="ana-score"><b>${total ? total.toFixed(1) : '-'}</b><small>/ 5</small><span>편집 점수</span></div>
<div><p class="ana-kicker">${esc(shortTitle(g.title))} ${ranked.length}종 비교</p><h2>${rank === 1 ? '🥇 ' : ''}${ranked.length}개 중 <em>${rank}위</em> · ${esc(pk.role)}</h2>
${pk.verdict ? `<p class="ana-verdict">“${esc(pk.verdict)}”</p>` : ''}</div>
</div>
<div class="ana-grid">
<div class="ana-crit">${(g.criteria ?? []).map((c, i) => `<div class="ana-row"><span>${esc(c)}</span><span class="bar"><i style="width:${(pk.scores?.[i] ?? 0) * 20}%"></i></span><b>${pk.scores?.[i] ?? '-'}</b></div>`).join('')}</div>
<div class="ana-pc"><p class="pro">${(pk.pros ?? []).map((t) => `＋ ${esc(t)}`).join('<br>')}</p><p class="con">${(pk.cons ?? []).map((t) => `－ ${esc(t)}`).join('<br>')}</p></div>
</div>
${infographic(g, p.id)}
<a class="more-link" href="/g/${g.slug}">${esc(shortTitle(g.title))} 비교 전체 보기 ›</a>
</section>`;
    })
    .join('');
}

// ---------- 상품 페이지 ----------
for (const { p, hist, a } of entries) {
  const cat = cats.find((c) => c.id === p.category);
  const crumb = `<nav class="crumb"><a href="/">홈</a> › <a href="/c/${p.category}">${esc(cat.name)}</a></nav>`;
  const points = p.points?.length ? `<ul class="checks">${p.points.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const guideLink = `<p class="more"><a href="/c/${p.category}">${esc(cat.name)} 고르는 법 보기 →</a></p>`;
  let body, title, desc;

  if (a) {
    title = `${p.name} 최저가·가격 추이`;
    desc = `${p.name} 오늘 최저가 ${won(a.cur)}. 역대 최저 ${won(a.allMin)}, 30일 평균 ${won(a.avg30)}. ${a.verdict.label}.`;
    body = `${crumb}
<h1>${esc(p.name)} 가격 추이</h1>
<section class="hero">
<p class="label">오늘 최저가 <small>(${md(a.last.d)} 기준)</small></p>
<p class="big">${won(a.cur)}</p>
<p class="verdict ${a.verdict.cls}"><b>${a.verdict.label}</b> · ${esc(a.verdict.text)}</p>
${buyButton(p.id, hist)}
</section>
<section class="stats">
<div><span>30일 평균</span><b>${won(a.avg30)}</b></div>
<div><span>30일 최저</span><b>${won(a.min30)}</b></div>
<div><span>역대 최저</span><b>${won(a.allMin)}</b></div>
<div><span>7일 변화</span><b class="${a.change7 < 0 ? 'down' : a.change7 > 0 ? 'up' : ''}">${a.change7 == null ? '-' : (a.change7 > 0 ? '+' : '') + won(a.change7)}</b></div>
</section>
<section>
<h2>최저가 추이 <small>(${a.days}일 기록)</small></h2>
${chart(hist.points, a.allMin)}
</section>
<section><h2>이런 분께 맞아요</h2><p>${esc(p.summary)}</p>${points}${guideLink}</section>
${analysis(p)}
${newsBlock(p.id)}
<p class="note">${PRICE_NOTE}</p>`;
  } else {
    title = `${p.name} 특징과 구매 전 확인할 점`;
    desc = `${p.name}: ${p.summary}`;
    const sc = scoreOf[p.id];
    const top = guidesOf(p.id).map((g) => ({ g, r: rankedPicks(g).findIndex((pk) => pk.id === p.id) + 1 }));
    body = `${crumb}
<section class="pd">
${gallery(p, hist)}
<div class="pd-info">
<span class="pt-cat">${esc(cat.name)}</span>
<h1>${esc(p.name)}</h1>
<div class="pt-badges">${picks[p.id]?.rocket ? '<span class="tag rocket">로켓배송</span>' : ''}${sc ? `<span class="tag score">편집 점수 ${sc.toFixed(1)}</span>` : ''}${top.map(({ g, r }) => `<span class="tag rank">${esc(shortTitle(g.title))} ${r}위</span>`).join('')}</div>
${priceLevel(p.id) ? `<div class="pd-price"><span>가격대 <small>(${esc(cat.name)} 비교 기준)</small></span>${levelLink(p.id, hist, '쿠팡에서 현재 가격 확인 ›')}</div>` : ''}
<p class="pd-sum">${esc(p.summary)}</p>
${points ? `<h2 class="sub">구매 전 확인할 점</h2>${points}` : ''}
${buyButton(p.id, hist)}
</div>
</section>
${analysis(p)}
${newsBlock(p.id)}
<section class="prose"><h2>${esc(cat.name)} 고르는 법</h2><p>${esc(cat.intro)}</p>${figure(p.category)}<ul>${cat.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
<p class="note">가격 추이 기록은 준비 중입니다. 가격은 판매 페이지에서 확인하세요.</p>`;
  }
  writeText(
    join(OUT, 'p', `${p.id}.html`),
    layout({ title, desc, path: `/p/${p.id}`, body, recent: { id: p.id, n: p.name, i: imageOf(p.id, hist) ?? '' } }),
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
      desc: `${c.name} 상위 모델을 점수와 장단점으로 비교했습니다. ${items.map((e) => e.p.name).join(', ')}`,
      path: `/c/${c.id}`,
      body: `<nav class="crumb"><a href="/">홈</a> › ${esc(c.name)}</nav>
<h1>${esc(c.name)} 비교</h1>
${related.length > 1 ? `<nav class="gtabs">${related.map((g) => `<a href="#g-${g.slug}">${esc(genderLabel(g, c))}</a>`).join('')}</nav>` : ''}
${related.map((g) => `<section id="g-${g.slug}" class="cat-cmp">${related.length > 1 ? `<h2 class="cat-cmp-h"><span class="gender g-${esc(g.gender ?? '공용')}">${esc(g.gender ?? '공용')}</span>${esc(c.name)} 비교</h2>` : ''}${infographic(g)}<a class="more-link" href="/g/${g.slug}">장단점·고르는 법 전체 보기 ›</a></section>`).join('')}
<section><h2>${esc(c.name)} 전체 상품</h2>${prow(items)}</section>
<section class="prose"><h2>${esc(c.name)} 고르는 법</h2><p>${esc(c.intro)}</p>${figure(c.id)}<ul>${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`,
    }),
  );
}

// ---------- 비교·추천 가이드 페이지 ----------
for (const g of guides) {
  const picksIn = g.picks.filter((pk) => byId[pk.id]);
  const crit = g.criteria ?? [];
  const totalOf = (pk) => (pk.scores?.length ? avg(pk.scores) : null);
  const best = Math.max(...picksIn.map((pk) => totalOf(pk) ?? 0));
  const scoreRows = picksIn
    .map((pk) => {
      const { p, hist } = byId[pk.id];
      const image = imageOf(p.id, hist);
      const link = links[p.id] ?? hist?.latest?.link;
      const total = totalOf(pk);
      return `<tr>
<td class="pcell">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : ''}<a href="/p/${p.id}">${esc(p.name)}</a><br><span class="badge mid">${esc(pk.role)}</span></td>
${crit.map((_, i) => `<td class="sc">${pk.scores ? dots(pk.scores[i]) : '-'}</td>`).join('')}
<td class="total">${total ? `<b>${total.toFixed(1)}</b><small>/5</small>${total === best ? '<br><span class="badge good">종합 1위</span>' : ''}` : '-'}</td>
<td>${link ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener">쿠팡 보기</a>` : ''}</td>
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
      return `<section class="pick"><h2>${esc(p.name)} <small>${esc(pk.role)}</small>${total ? ` <span class="badge good">${total.toFixed(1)}/5</span>` : ''}</h2>
<div class="pick-body">${image ? `<img class="pick-img" src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">` : ''}<div>
<p>${esc(p.summary)}</p><p><b>이런 분께:</b> ${esc(pk.forWhom)}</p>${newsBlock(p.id, 'h3')}${buyButton(p.id, hist)}</div></div></section>`;
    })
    .join('');
  writeText(
    join(OUT, 'g', `${g.slug}.html`),
    layout({
      title: `${guideName(g)}${g.title.includes(':') ? `: ${g.title.split(':').slice(1).join(':').trim()}` : ''}`,
      desc: g.desc,
      path: `/g/${g.slug}`,
      body: `<nav class="crumb"><a href="/">홈</a> › <a href="/c/${guideCat(g)?.id}">${esc(guideCat(g)?.name ?? '')}</a>${g.gender && g.gender !== '공용' ? ` › ${esc(g.gender)}` : ''}</nav>
<p class="g-kicker">${g.gender ? `<span class="gender g-${esc(g.gender)}">${esc(g.gender === '공용' ? '남녀공용' : g.gender)}</span>` : ''}${esc(guideName(g))}</p>
<h1>${esc(g.title)}</h1>
<section class="prose"><p>${esc(g.intro)}</p></section>
<nav class="toc"><a href="#cmp">비교표</a><a href="#scores">항목별 점수</a><a href="#models">모델별 분석</a><a href="#choose">선택 가이드</a><a href="#faq">자주 묻는 질문</a></nav>
<section id="cmp">${infographic(g)}</section>
<section id="scores"><h2>한눈에 비교: 항목별 점수</h2><div class="tablewrap"><table class="scores"><thead><tr><th>모델</th>${crit.map((c) => `<th>${esc(c)}</th>`).join('')}<th>종합</th><th></th></tr></thead><tbody>${scoreRows}</tbody></table></div>
<p class="note score-note">※ ${SCORE_NOTE}</p>
<p class="note">${DISCLOSURE}</p></section>
<div id="models">${cards}</div>
<section id="choose" class="choose"><h2>선택 가이드: 이렇게 고르세요</h2>
<div class="choose-pick">${rankedPicks(g)
        .map((pk) => `<a href="/p/${pk.id}"><span class="badge mid">${esc(pk.role)}</span><b>${esc(byId[pk.id].p.name)}</b><small>${esc(pk.forWhom)}</small></a>`)
        .join('')}</div>
${figure(guideCat(g)?.id)}
<div class="prose">${g.sections.map((s) => `<h3>${esc(s.h)}</h3><p>${esc(s.p)}</p>`).join('')}</div></section>
<section id="faq" class="prose"><h2>자주 묻는 질문</h2>${g.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>
<section><h2>다른 비교·추천 가이드</h2>${guideGrid(guides.filter((o) => o.slug !== g.slug))}</section>`,
    }),
  );
}

// ---------- 메인 페이지 ----------
const deals = tracked.filter((e) => e.a.verdict.cls === 'good');


// 에누리식 상품 타일: 큰 이미지, 이름, 배지, 점수, 가격(기록이 있을 때)
function ptile({ p, hist, a }) {
  const image = imageOf(p.id, hist);
  const sc = scoreOf[p.id];
  const rocket = picks[p.id]?.rocket;
  return `<a class="ptile" href="/p/${p.id}">
<div class="pt-img">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">` : '<span class="ph">⛳</span>'}</div>
<div class="pt-body"><span class="pt-cat">${esc(catName[p.category])}</span><h3>${esc(p.name)}</h3>
<div class="pt-badges">${rocket ? '<span class="tag rocket">로켓배송</span>' : ''}${sc ? `<span class="tag score">편집 점수 ${sc.toFixed(1)}</span>` : ''}</div>
${priceTag(p.id, a)}<p class="pt-cta">특징·비교 보기 ›</p></div>
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
<div class="sl-imgs">${ranked.map((pk) => `<img src="${esc(imageOf(pk.id, byId[pk.id].hist) ?? '')}" alt="" loading="${i === 0 ? 'eager' : 'lazy'}">`).join('')}</div>
</a>`;
}

const sideCats = cats
  .map((c) => `<a href="/c/${c.id}"><span class="ci">${catIcon(c)}</span>${esc(c.name)}</a>`)
  .join('');
const rocketItems = entries.filter((e) => picks[e.p.id]?.rocket);
const suggestItems = entries.filter((e) => scoreOf[e.p.id]).sort((x, y) => scoreOf[y.p.id] - scoreOf[x.p.id]).slice(0, 12);
const tabs = cats
  .map((c, i) => `<button type="button" role="tab" class="tab${i === 0 ? ' on' : ''}" data-tab="${c.id}" aria-selected="${i === 0}">${esc(c.name)}</button>`)
  .join('');
const panels = cats
  .map((c, i) => `<div class="tabpanel${i === 0 ? ' on' : ''}" data-panel="${c.id}">${prow(entries.filter((e) => e.p.category === c.id))}<a class="more-link" href="/c/${c.id}">${esc(c.name)} 고르는 법과 전체 보기 ›</a></div>`)
  .join('');

writeText(
  join(OUT, 'index.html'),
  layout({
    title: SITE_NAME,
    desc: '골프용품을 꼼꼼히 비교해 나에게 맞는 최고의 제품을 찾아 드립니다. 드라이버, 퍼터, 골프공, 거리측정기, 골프화, 풀세트 비교·추천과 장단점, 점수 비교.',
    path: '/',
    body: `<h1 class="sr-only">${SITE_NAME}: 골프용품 비교·추천</h1>
<div class="home-top">
<aside class="side" aria-label="골프 카테고리"><p class="side-h">골프 카테고리</p>${sideCats}<a href="/#guides" class="side-guide">📊 비교·추천 가이드</a></aside>
<div class="mhero">
<div class="slides" id="slides">${guides.map(banner).join('')}</div>
<div class="sl-ctrl"><button type="button" class="sl-prev" aria-label="이전 배너">‹</button><span class="sl-dots">${guides.map((_, i) => `<button type="button" class="dot${i === 0 ? ' on' : ''}" aria-label="${i + 1}번째 배너"></button>`).join('')}</span><button type="button" class="sl-next" aria-label="다음 배너">›</button></div>
</div>
</div>

<section class="mission">
<div><b>${esc(SITE.tagline ?? '골프용품, 꼼꼼히 비교하고 고르세요')}</b>
<p>인기 골프용품을 4개 이상씩 묶어 장단점과 항목별 점수로 비교하고, 나에게 맞는 최고의 제품을 찾아 드립니다.${tracked.length ? ' 가격은 매일 기록해 지금이 살 때인지도 알려드려요.' : ' 고른 제품은 쿠팡에서 바로 가격을 확인할 수 있어요.'}</p></div>
<ul><li><b>${guides.length}</b>개 비교 가이드</li><li><b>${entries.length}</b>개 상품</li><li><b>${cats.length}</b>개 카테고리</li></ul>
</section>

${deals.length ? `<section class="block"><div class="block-h"><h2>🔥 지금 사기 좋은 상품</h2></div>${prow(deals)}</section>` : ''}

<section class="block"><div class="block-h"><h2>이런 상품 어때요?</h2><span>비교 가이드 편집 점수가 높은 순</span></div>${prow(suggestItems)}</section>

${rocketItems.length ? `<section class="block"><div class="block-h"><h2>🚀 로켓배송으로 빨리 받는 상품</h2></div><div class="hscroll">${prow(rocketItems)}</div></section>` : ''}

<section class="block" id="cats"><div class="block-h"><h2>카테고리별 상품</h2></div>
<div class="tabs" role="tablist">${tabs}</div>${panels}</section>

<section class="block" id="guides"><div class="block-h"><h2>비교·추천 가이드</h2><span>4개 이상 제품을 장단점과 점수로 비교</span></div>${guideGrid(guides)}</section>

<section class="block today"><div class="block-h"><h2>⭐ 오늘의 추천 상품</h2><span>비교 가이드에서 종합 1위를 차지한 제품</span></div>
<div class="today-grid">${guides
      .map((g) => {
        const top = rankedPicks(g)[0];
        if (!top) return '';
        const { p, hist } = byId[top.id];
        const image = galleryOf(p, hist)[0] ?? imageOf(p.id, hist);
        return `<a class="tcard" href="/p/${p.id}">
<div class="tc-img">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">` : ''}<span class="tc-ribbon">${esc(shortTitle(g.title))} 1위</span></div>
<div class="tc-body"><span class="pt-cat">${esc(catName[p.category])}</span><h3>${esc(p.name)}</h3>
${priceTag(p.id, byId[top.id].a, 'tc-price')}
<p class="tc-score"><b>${top.scores ? avg(top.scores).toFixed(1) : '-'}</b><small>/5 편집 점수</small></p>
${top.verdict ? `<p class="tc-verdict">${esc(top.verdict)}</p>` : ''}
<span class="pt-cta">상세 비교 보기 ›</span></div>
</a>`;
      })
      .join('')}</div></section>

<p class="note score-note">※ ${SCORE_NOTE}</p>`,
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
      l: links[e.p.id] ?? e.hist?.latest?.link ?? '',
      pr: null,
      lv: priceLevel(e.p.id)?.label ?? '',
      lvn: priceLevel(e.p.id)?.n ?? 0,
    })),
    guides: guides.map((g) => ({
      t: g.title,
      u: `/g/${g.slug}`,
      k: g.desc,
      crit: g.criteria ?? [],
      picks: g.picks
        .filter((pk) => byId[pk.id])
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
writeText(
  join(OUT, 'about.html'),
  layout({
    title: '운영 안내',
    desc: `${SITE_NAME}의 가격 기록 방법과 제휴 안내`,
    path: '/about',
    body: `<h1>운영 안내</h1>
<section class="prose">
<h2>무엇을 하는 사이트인가요?</h2>
<p>인기 골프용품의 특징과 고르는 법을 정리하고, 가격을 매일 기록해 지금이 살 때인지 알려드립니다.</p>
<h2>가격은 어떻게 기록하나요?</h2>
<p>${PRICE_NOTE}</p>
<h2>"사기 좋은 때"는 어떻게 판단하나요?</h2>
<ul>
<li><b>역대 최저가 근처</b>: 기록된 최저가와 2% 이내</li>
<li><b>평소보다 저렴</b>: 최근 30일 평균보다 5% 이상 낮음</li>
<li><b>평소보다 비쌈</b>: 최근 30일 평균보다 5% 이상 높음</li>
<li><b>데이터 수집 중</b>: 기록이 7일 미만</li>
</ul>
<h2>제휴 안내</h2>
<p>${DISCLOSURE} 링크를 통해 구매하셔도 구매자에게 추가 비용은 없습니다.</p>
</section>`,
  }),
);

// ---------- 없어진 페이지 주소 이동 (Cloudflare Pages _redirects) ----------
writeText(
  join(OUT, '_redirects'),
  [
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
  ].join('\n') + '\n',
);

// ---------- 검색엔진용 파일 ----------
const urls = ['/', '/about', ...guides.map((g) => `/g/${g.slug}`), ...cats.map((c) => `/c/${c.id}`), ...entries.map((e) => `/p/${e.p.id}`)];
writeText(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `<url><loc>${SITE_URL}${u}</loc><lastmod>${updated}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeText(join(OUT, 'robots.txt'), DEMO ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`사이트 생성 완료: 상품 ${entries.length}개 (가격 기록 ${tracked.length}개, 가이드 ${entries.length - tracked.length}개) → site/${DEMO ? ' (샘플 데이터)' : ''}`);
