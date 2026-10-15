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
const PRICE_NOTE = '표시 가격은 쿠팡 파트너스 링크를 만들 때 확인한 쿠팡 판매가이며 확인 날짜를 함께 적었습니다. 옵션(샤프트, 사이즈 등)과 시점에 따라 현재 판매가와 다를 수 있습니다. 쿠팡 파트너스 API 승인 뒤에는 하루 한 번 최저가를 자동 기록해 가격 추이와 역대 최저가를 보여 드립니다.';

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
  return src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span>${esc(c.name.slice(0, 1))}</span>`;
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
const BUILD_DAY = todayKst();
const PRICE_STALE_DAYS = 14; // 이보다 오래된 가격은 흐리게 '오래된 가격'으로 표시
const dayLabel = (d) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const daysAgo = (d) => Math.round((Date.parse(BUILD_DAY) - Date.parse(d)) / 864e5);
// 보여 줄 가격: API 일별 기록이 있으면 최근 최저가, 없으면 링크 생성 때 확인한 쿠팡 판매가
function shownPrice(id) {
  const a = entryById[id]?.a;
  if (a) return { won: a.cur, d: a.last.d, kind: 'api', allMin: a.allMin };
  const pk = picks[id];
  if (!pk?.price || !links[id]) return null;
  return { won: pk.price, d: pk.checked ?? PRICE_DATE, kind: 'snap' };
}
function priceLine(id, cls = 'price-line') {
  const sp = shownPrice(id);
  if (!sp) return extOf(id) ? `<p class="${cls} none"><small>쿠팡 판매처 없음 · 가격 정보 없음</small></p>` : '';
  const stale = daysAgo(sp.d) > PRICE_STALE_DAYS;
  return `<p class="${cls}${stale ? ' stale' : ''}"><b>${won(sp.won)}</b><small>${sp.kind === 'api' ? '최근 최저가' : '쿠팡 판매가'} · ${dayLabel(sp.d)} 확인${stale ? ' · 오래된 가격' : ''} · 현재 가격과 다를 수 있음</small></p>`;
}
const priceShort = (id) => {
  const sp = shownPrice(id);
  return sp ? `<span class="pshort${daysAgo(sp.d) > PRICE_STALE_DAYS ? ' stale' : ''}">${won(sp.won)}<small>${+sp.d.slice(5, 7)}.${+sp.d.slice(8, 10)} 확인</small></span>` : '';
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
const extOf = (id) => config.products.find((x) => x.id === id)?.external ?? null;
function levelLink(id, hist, extra = '쿠팡에서 가격 보기 ›') {
  const lv = priceLevel(id);
  const link = links[id] ?? hist?.latest?.link;
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
  const link = links[id] ?? hist?.latest?.link;
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
const byId = Object.fromEntries(entries.map((e) => [e.p.id, e]));
const SCORE_NOTE = '점수는 제조사 공개 정보, 보도된 투어 소식, 일반적인 사용자 평가와 현재 판매가를 바탕으로 이 사이트가 매긴 주관적인 참고 점수입니다. 직접 측정한 시험 결과나 공식 평가가 아니며, 개인의 체형·스윙에 따라 체감은 다를 수 있습니다.';
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const dots = (n) => `<span class="dots" aria-label="5점 중 ${n}점">${'●'.repeat(n)}<i>${'●'.repeat(5 - n)}</i></span>`;
function guideTile(g) {
  const imgs = rankedPicks(g).map((pk) => imageOf(pk.id, byId[pk.id].hist)).filter(Boolean).slice(0, 4);
  return `<a class="gcard" href="/g/${g.slug}">
<div class="gthumb">${imgs.map((src) => `<img src="${esc(src)}" alt="" loading="lazy">`).join('')}</div>
<div class="ginfo"><span class="badge good">${rankedPicks(g).length}종 비교</span><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p></div>
</a>`;
}
const guideGrid = (list) => `<div class="ggrid">${list.map(guideTile).join('')}</div>`;

const shortTitle = (t) => t.split(':')[0].trim();
// 쿠팡 링크(또는 API 기록 링크)가 있는 상품만 순위·대표 모델·실력별 페이지에 넣는다. 공식몰만 있는 상품은 '판매처 없음' 참고 목록으로
const sellable = (id) => !!(links[id] ?? byId[id]?.hist?.latest?.link);
// 다른 가이드에 합쳐진 가이드(mergeInto)는 따로 페이지를 만들지 않는다
const pageGuides = guides.filter((g) => !g.mergeInto);
const mergedInto = (g) => guides.filter((m) => m.mergeInto === g.slug);
// 실력 단계가 다른 제품끼리는 한 줄로 세우지 않는다: 같은 단계 안에서의 순위만 쓴다
const skillIdx = (pk) => (pk.skill ? SKILLS.indexOf(pk.skill) : 9);
const totalScore = (pk) => (pk.scores?.length ? avg(pk.scores) : 0);
function stageRank(g, id) {
  const pk = g.picks.find((x) => x.id === id);
  if (!pk || !sellable(id)) return null;
  const same = rankedPicks(g).filter((x) => (x.skill ?? null) === (pk.skill ?? null));
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
const rankedPicks = (g) => g.picks.filter((pk) => byId[pk.id] && sellable(pk.id)).sort((x, y) => totalScore(y) - totalScore(x));
// 표 안 정렬: 실력 단계 순 → 단계 안 점수 순
const stagedPicks = (g) => [...rankedPicks(g)].sort((x, y) => skillIdx(x) - skillIdx(y) || totalScore(y) - totalScore(x));
// 실력 단계별 대표(1위): 남녀 공용으로 끌어온 모델보다 해당 가이드 전용 모델을 우선
const stageTop = (g, skill) => {
  const ps = rankedPicks(g).filter((pk) => pk.skill === skill);
  return ps.find((pk) => !pk.unisex) ?? ps[0];
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
    return `<th class="${pk.id === highlight ? 'hl' : ''}"><a href="/p/${p.id}">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="noimg">${esc(catName[p.category] ?? '')}<small>${esc(extOf(p.id)?.store ?? '')}</small></span>`}<span class="ig-rank">${esc(stageRank(g, pk.id)?.label ?? '')}</span><b>${esc(p.name)}</b><span class="ig-role">${esc(pk.role)}</span>${unisexBadge(pk)}</a></th>`;
  };
  const row = (icon, label, cell, cls = '') =>
    `<tr class="${cls}"><th scope="row">${label}</th>${ps.map((pk) => `<td class="${pk.id === highlight ? 'hl' : ''}">${cell(pk)}</td>`).join('')}</tr>`;
  return `<div class="ig-wrap"><div class="ig-head"><p class="ig-kicker">${esc(SITE_NAME)} 비교표</p><h3>${esc(opts.title ?? shortTitle(g.title))} <span>${reps ? `전체 ${rankedPicks(g).length}종 · 실력 단계별 추천 1위` : `${ps.length}종 한눈에 비교`}</span></h3></div>
<div class="tablewrap ig-scroll"><table class="ig" style="min-width:${150 + ps.length * 150}px"><thead><tr><th class="ig-corner"></th>${ps.map(col).join('')}</tr></thead><tbody>
${ps.some((pk) => pk.dist) ? row('', '비거리', (pk) => (pk.dist ? `<b class="ig-total">${pk.dist}<small>/10</small></b><span class="bar dist"><i style="width:${pk.dist * 10}%"></i></span>` : '-')) : ''}
${row('', '편집 점수', (pk) => (pk.scores ? `<b class="ig-total">${avg(pk.scores).toFixed(1)}</b><span class="bar"><i style="width:${(avg(pk.scores) / 5) * 100}%"></i></span>` : '-'), 'r-total')}
${row('', '실력·가격대', (pk) => `<span class="tierline">${pk.skill ? `<span class="skill sk-${SKILLS.indexOf(pk.skill) + 1}">${pk.skill}</span>` : skillBadge(pk.id)}${levelBadge(pk.id)}</span>`)}
${row('', '한마디', (pk) => `<b class="ig-short">${esc(pk.short ?? pk.role)}</b>`)}
${(g.specRows ?? []).map((label, si) => row('', esc(label.replace('연결 상품 ', '')), (pk) => `<span class="ig-spec">${esc(pk.specs?.[si] ?? '-')}</span>`)).join('')}
${row('', '강점', (pk) => `<span class="ig-plus">${esc(pk.plus ?? pk.pros?.[0] ?? '-')}</span>`)}
${row('', '약점', (pk) => `<span class="ig-minus">${esc(pk.minus ?? pk.cons?.[0] ?? '-')}</span>`)}
${crit.length ? row('', '항목별', (pk) => (pk.scores ? `<span class="ig-crits">${crit.map((c, i) => `<span><em>${esc(c.split('·')[0])}</em>${dots(pk.scores[i])}</span>`).join('')}</span>` : '-')) : ''}
${row('', '가격', (pk) => `${levelLink(pk.id, byId[pk.id].hist, '쿠팡 ›')}${priceShort(pk.id)}`, 'r-price')}
</tbody></table></div>
${reps ? `<p class="ig-more">${skillGroups(g).map((x) => `<a href="${skillPath(g, x.skill)}"><span class="skill sk-${SKILLS.indexOf(x.skill) + 1}">${x.skill}</span> ${x.ids.length}종 전체 비교 ›</a>`).join('')}</p>` : ''}${reps ? oldModelNote(g, reps) : ''}<p class="note">점수는 주관적 참고 점수(공식 평가 아님) · 순위는 같은 실력 단계 안에서만 매깁니다 · 가격은 링크 생성 시 확인한 쿠팡 판매가로 현재 가격과 다를 수 있음 · 가격을 누르면 쿠팡(파트너스 링크)으로 이동</p></div>`;
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
  return `<aside class="crit-box"><b>점수 기준</b><p>${crit.map((c) => `${esc(c)} ${w}%`).join(' · ')}를 각 5점 만점으로 매긴 뒤 평균한 <b>주관적 편집 점수</b>입니다.${g.picks.some((pk) => pk.skill) ? ' 실력 단계마다 기대하는 성능이 달라, <b>순위는 같은 실력 단계 안에서만</b> 매깁니다.' : ''} <a href="/about#score">점수 매기는 방법</a></p></aside>`;
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
      return `<a href="/p/${p.id}">${sk(s)}<span class="dist-tl">${esc(s)} 비거리 추천</span>${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : ''}<b>${esc(p.name)}</b><span class="dist-n">${pk.dist}<small>/10</small></span>${levelBadge(p.id)}</a>`;
    })
    .join('')}</div>` : ''}
<ol class="dist-list">${sorted
    .map((pk) => {
      const { p, hist } = byId[pk.id];
      const image = imageOf(p.id, hist);
      return `<li><a href="/p/${p.id}">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : '<span class="dimg"></span>'}<span class="dname"><b>${esc(p.name)}</b><span class="tierline">${pk.skill ? sk(pk.skill) : ''}${levelBadge(p.id)}</span></span><span class="bar dist"><i style="width:${pk.dist * 10}%"></i></span><b class="dnum">${pk.dist}</b></a></li>`;
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
<div class="gal-main"><img id="galMain" src="${esc(imgs[0])}" alt="${esc(p.name)}"></div>
${imgs.length > 1 ? `<div class="gal-thumbs">${imgs.map((src, i) => `<button type="button" class="gal-t${i === 0 ? ' on' : ''}" data-src="${esc(src)}" aria-label="사진 ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
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
<div><p class="ana-kicker">${esc(guideName(g))}${unisexBadge(pk)}</p><h2>${sr ? `<em>${esc(sr.label)}</em>${sr.skill ? ` <small>(${esc(sr.skill)} ${sr.n}종 중)</small>` : ''}` : '<em>순위 제외</em> <small>(쿠팡 판매처 없음)</small>'} · ${esc(pk.role)}</h2>
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

// 가격 기록 영역: API 일별 기록이 있으면 추이 그래프(30일·90일)와 역대 최저가 대비 현재가, 없으면 수집 예정 안내
function priceHistory(p, hist, a) {
  if (!sellable(p.id)) return '';
  if (!a) return `<section class="phist empty"><h2>가격 추이</h2><p>아직 일별 가격 기록이 없습니다. 쿠팡 파트너스 API 승인 뒤 하루 한 번 최저가를 기록해 최근 30일·90일 추이와 역대 최저가를 이곳에 보여 드립니다.</p><p class="note">${PRICE_NOTE}</p></section>`;
  const vsMin = pct(a.cur, a.allMin);
  const panel = (days, on) => {
    const from = addDays(a.last.d, -days);
    const pts = hist.points.filter((pt) => pt.d >= from);
    return `<div class="tabpanel${on ? ' on' : ''}" data-panel="ph${days}">${pts.length > 1 ? chart(pts, a.allMin) : '<p class="note">기록이 더 쌓이면 그래프가 표시됩니다.</p>'}</div>`;
  };
  return `<section class="phist tabs-wrap"><h2>가격 추이 <small>(${a.days}일 기록 · ${dayLabel(a.last.d)} 기준)</small></h2>
<p class="verdict ${a.verdict.cls}"><b>${a.verdict.label}</b> · ${esc(a.verdict.text)}</p>
<section class="stats">
<div><span>최근 최저가</span><b>${won(a.cur)}</b></div>
<div><span>역대 최저가</span><b>${won(a.allMin)}</b></div>
<div><span>역대 최저 대비</span><b class="${vsMin > 0 ? 'up' : ''}">${vsMin > 0.05 ? `+${vsMin.toFixed(1)}%` : '최저가'}</b></div>
<div><span>30일 평균</span><b>${won(a.avg30)}</b></div>
</section>
<div class="tabs" role="tablist"><button type="button" class="tab on" data-tab="ph30">최근 30일</button><button type="button" class="tab" data-tab="ph90">최근 90일</button></div>
${panel(30, true)}${panel(90, false)}
<p class="note">${PRICE_NOTE}</p></section>`;
}

// ---------- 상품 페이지 ----------
for (const { p, hist, a } of entries) {
  const cat = cats.find((c) => c.id === p.category);
  const crumb = `<nav class="crumb"><a href="/">홈</a> › <a href="/c/${p.category}">${esc(cat.name)}</a></nav>`;
  const points = p.points?.length ? `<ul class="checks">${p.points.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const guideLink = `<p class="more"><a href="/c/${p.category}">${esc(cat.name)} 고르는 법 보기 →</a></p>`;
  let body, title, desc;

  {
    title = `${p.name} 특징·비교${shownPrice(p.id) ? '·쿠팡 판매가' : ''}`;
    desc = `${p.name}: ${p.summary}`;
    const sc = scoreOf[p.id];
    const top = guidesOf(p.id).filter((g) => !g.mergeInto).map((g) => ({ g, sr: stageRank(g, p.id) }));
    body = `${crumb}
<section class="pd">
${gallery(p, hist)}
<div class="pd-info">
<span class="pt-cat">${esc(cat.name)}</span>
<h1>${esc(p.name)}</h1>
<div class="pt-badges">${picks[p.id]?.rocket ? '<span class="tag rocket">로켓배송</span>' : ''}${sc ? `<span class="tag score">편집 점수 ${sc.toFixed(1)}</span>` : ''}${top.map(({ g, sr }) => (sr ? `<span class="tag rank">${esc(guideName(g).replace(' 비교 및 선택 가이드', ''))} ${esc(sr.label)}</span>` : '')).join('')}${sellable(p.id) ? '' : '<span class="tag none">쿠팡 판매처 없음</span>'}</div>
<div class="pd-price">${priceLine(p.id, 'pd-won')}${priceLevel(p.id) ? `<span>가격대 <small>(${esc(cat.name)} 비교 기준)</small></span>${levelLink(p.id, hist, '쿠팡에서 현재 가격 보기 ›')}` : ''}</div>
<p class="pd-sum">${esc(p.summary)}</p>
${points ? `<h2 class="sub">구매 전 확인할 점</h2>${points}` : ''}
${buyButton(p.id, hist)}
</div>
</section>
${analysis(p)}
${newsBlock(p.id)}
<section class="prose"><h2>${esc(cat.name)} 고르는 법</h2><p>${esc(cat.intro)}</p>${figure(p.category)}<ul>${cat.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
${priceHistory(p, hist, a)}`;
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
${related.map((g) => `<section id="g-${g.slug}" class="cat-cmp">${related.length > 1 ? `<h2 class="cat-cmp-h"><span class="gender g-${esc(g.gender ?? '공용')}">${esc(g.gender ?? '공용')}</span>${esc(c.name)} 비교</h2>` : ''}${infographic(g)}${tierCompare(g)}<a class="more-link" href="/g/${g.slug}">장단점·고르는 법 전체 보기 ›</a></section>`).join('')}
<section><h2>${esc(c.name)} 전체 상품</h2>${prow(items)}</section>
<section class="prose"><h2>${esc(c.name)} 고르는 법</h2><p>${esc(c.intro)}</p>${figure(c.id)}<ul>${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`,
    }),
  );
}

// ---------- 비교·추천 가이드 페이지 ----------
for (const g of pageGuides) {
  const picksIn = stagedPicks(g);
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
${criteriaBox(g)}
<nav class="toc">${mergedInto(g).some((m) => m.grinds) ? '<a href="#vokey">보키 그라인드 비교</a>' : ''}<a href="#cmp">비교표</a><a href="#tiers">수준별 비교</a>${g.picks.some((pk) => pk.dist) ? '<a href="#dist">비거리 비교</a>' : ''}<a href="#scores">항목별 점수</a><a href="#models">모델별 분석</a><a href="#choose">선택 가이드</a><a href="#faq">자주 묻는 질문</a></nav>
<section id="cmp">${infographic(g)}${offerlessList(g)}</section>
${skillNav(g)}<div id="tiers">${tierCompare(g)}</div>
<div id="dist">${distCompare(g)}</div>
<section id="scores"><h2>한눈에 비교: 항목별 점수</h2><div class="tablewrap"><table class="scores"><thead><tr><th>모델</th>${crit.map((c) => `<th>${esc(c)}</th>`).join('')}<th>종합</th><th></th></tr></thead><tbody>${scoreRows}</tbody></table></div>
<p class="note score-note">※ ${SCORE_NOTE}</p>
<p class="note">${DISCLOSURE}</p></section>
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
<section id="faq" class="prose"><h2>자주 묻는 질문</h2>${g.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>
<section><h2>다른 비교·추천 가이드</h2>${guideGrid(pageGuides.filter((o) => o.slug !== g.slug))}</section>`,
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
// 실력 단계별 비교 페이지: 해당 실력대 상품을 저가→프리미엄 순으로
for (const g of pageGuides) {
  const c = guideCat(g);
  const who = g.gender && g.gender !== '공용' ? `${g.gender} ` : '';
  for (const { skill, ids } of skillGroups(g)) {
    const ps = rankedPicks(g).filter((pk) => ids.includes(pk.id));
    const levels = LEVELS.filter((l) => l && ps.some((pk) => priceLevel(pk.id)?.label === l));
    const name = `${who}${skill}용 ${c?.name ?? ''}`;
    writeText(
      join(OUT, 'g', `${g.slug}-${SKILL_EN[skill]}.html`),
      layout({
        title: `${name} 비교 추천 ${ps.length}종`,
        desc: `${name} ${ps.length}종을 ${levels.join('·')} 가격대별로 비교했습니다. 장단점, 주관적 점수, 비거리 참고 점수와 쿠팡 가격 확인 링크를 함께 정리했습니다.`,
        path: skillPath(g, skill),
        body: `<nav class="crumb"><a href="/">홈</a> › <a href="/c/${c?.id}">${esc(c?.name ?? '')}</a>${who ? ` › <a href="/g/${g.slug}">${esc(g.gender)}</a>` : ''} › ${esc(skill)}</nav>
<p class="g-kicker"><span class="skill sk-${SKILLS.indexOf(skill) + 1}">${skill}</span>${esc(guideName(g))}</p>
<h1>${esc(name)} 비교 추천 <small>${ps.length}종 · ${esc(levels.join('·'))}</small></h1>
${skillNav(g, skill)}
<section>${infographic(g, null, { ids, byPrice: true, title: `${name}` })}</section>
${distCompare(g, ids)}
<section class="choose"><h2>${esc(skill)}에게 맞는 선택</h2><div class="choose-pick">${ps
          .map((pk) => `<a href="/p/${pk.id}"><span class="tierline">${levelBadge(pk.id)}<span class="badge mid">${esc(pk.role)}</span>${unisexBadge(pk)}</span><b>${esc(byId[pk.id].p.name)}</b><small>${esc(pk.forWhom)}</small><small class="vd">${esc(pk.verdict ?? '')}</small></a>`)
          .join('')}</div></section>
<p class="note score-note">※ ${SCORE_NOTE}</p>
<p class="note">${DISCLOSURE}</p>
<a class="more-link" href="/g/${g.slug}">${esc(guideName(g))} 전체 보기 ›</a>`,
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
<div class="pt-img">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="ph">${esc(catName[p.category]?.slice(0, 1) ?? '')}</span>`}</div>
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
      const sp = shownPrice(p.id);
      return { c: p.category, g: g.gender ?? '공용', s: pk.skill ?? '', lv: priceLevel(p.id)?.n ?? 0, n: p.name, i: imageOf(p.id, hist) ?? '', u: `/p/${p.id}`, r: pk.role, sc: +totalScore(pk).toFixed(1), pr: sp?.won ?? 0, pd: sp ? dayLabel(sp.d) : '', x: pk.unisex ? 1 : 0 };
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

${drops.length ? `<section class="block"><div class="block-h"><h2>최근 가격 하락</h2><span>7일 전 기록보다 내린 상품</span></div>${prow(drops)}</section>` : ''}

<section class="hnote"><p>${DISCLOSURE}</p><p>※ ${SCORE_NOTE}</p><p>※ ${PRICE_NOTE}</p></section>`,
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
      l: links[e.p.id] ?? e.hist?.latest?.link ?? e.p.external?.url ?? '',
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
// 상품이 3종 미만이라 만들지 않는 실력별 페이지 → 상위 가이드, 합쳐진 가이드 → 합친 가이드
const REDIRECTS = [
  ...pageGuides.flatMap((g) => SKILLS.filter((sk) => g.picks.some((pk) => pk.skill === sk) && !skillGroups(g).some((x) => x.skill === sk)).map((sk) => `${skillPath(g, sk)} /g/${g.slug} 301`)),
  ...guides.filter((g) => g.mergeInto).map((g) => `/g/${g.slug} /g/${g.mergeInto}#vokey 301`),
];
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
    ...REDIRECTS,
  ].join('\n') + '\n',
);

// ---------- 검색엔진용 파일 ----------
const urls = ['/', '/about', ...pageGuides.map((g) => `/g/${g.slug}`), ...pageGuides.flatMap((g) => skillGroups(g).map((x) => skillPath(g, x.skill))), ...cats.map((c) => `/c/${c.id}`), ...entries.map((e) => `/p/${e.p.id}`)];
writeText(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `<url><loc>${SITE_URL}${u}</loc><lastmod>${updated}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeText(join(OUT, 'robots.txt'), DEMO ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`사이트 생성 완료: 상품 ${entries.length}개 (가격 기록 ${tracked.length}개, 가이드 ${entries.length - tracked.length}개) → site/${DEMO ? ' (샘플 데이터)' : ''}`);
