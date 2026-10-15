// 상품 설정과 가격 기록으로 정적 사이트(site/)를 만든다.
// 가격 기록이 없는 상품은 구매 가이드 페이지로, 있는 상품은 가격 추이 페이지로 만든다.
// 사용: node src/build.mjs        → 실제 데이터 (data/)
//       node src/build.mjs --demo → 샘플 데이터 (data-demo/)
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig, loadLinks, historyDir, readJson, writeText, todayKst } from './lib.mjs';

const DEMO = process.argv.includes('--demo');
const SITE_URL = (process.env.SITE_URL || 'https://golf-price.pages.dev').replace(/\/$/, '');
const SITE_NAME = '골프 최저가 기록장';
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
function layout({ title, desc, path, body }) {
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
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⛳</text></svg>">
</head>
<body>
<p class="disclosure">${DISCLOSURE}</p>
${DEMO ? '<p class="demo">샘플 데이터로 만든 미리보기입니다. 표시된 가격은 실제 가격이 아닙니다.</p>' : ''}
<header class="top"><div class="wrap"><a class="brand" href="/">⛳ ${SITE_NAME}</a><nav><a href="/about">운영 안내</a></nav></div></header>
<main class="wrap">
${body}
</main>
<footer class="wrap foot">
<p>${DISCLOSURE}</p>
<p>${PRICE_NOTE} 구매 전 판매 페이지에서 가격과 옵션을 꼭 확인하세요.</p>
</footer>
</body>
</html>
`;
}

const imageOf = (id, hist) => hist?.latest?.image ?? picks[id]?.image;

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
${newsBlock(p.id)}
<p class="note">${PRICE_NOTE}</p>`;
  } else {
    title = `${p.name} 특징과 구매 전 확인할 점`;
    desc = `${p.name}: ${p.summary}`;
    const image = imageOf(p.id, hist);
    body = `${crumb}
<h1>${esc(p.name)}</h1>
<section class="hero${image ? ' with-img' : ''}">
${image ? `<img class="hero-img" src="${esc(image)}" alt="${esc(p.name)}">` : ''}
<div>
<p>${esc(p.summary)}</p>
${points ? `<h2 class="sub">구매 전 확인할 점</h2>${points}` : ''}
${buyButton(p.id, hist)}
</div>
</section>
${newsBlock(p.id)}
<section class="prose"><h2>${esc(cat.name)} 고르는 법</h2><p>${esc(cat.intro)}</p>${figure(p.category)}<ul>${cat.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
<p class="note">가격 추이 기록은 준비 중입니다. 가격은 판매 페이지에서 확인하세요.</p>`;
  }
  writeText(join(OUT, 'p', `${p.id}.html`), layout({ title, desc, path: `/p/${p.id}`, body }));
}

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
const guidesFor = (catId) => guides.filter((g) => g.picks.some((pk) => byId[pk.id]?.p.category === catId));

// ---------- 분류 페이지 ----------
for (const c of cats) {
  const items = entries.filter((e) => e.p.category === c.id);
  const related = guidesFor(c.id);
  writeText(
    join(OUT, 'c', `${c.id}.html`),
    layout({
      title: `${c.name} 고르는 법과 추천 모델`,
      desc: `${c.intro} ${items.map((e) => e.p.name).join(', ')}`,
      path: `/c/${c.id}`,
      body: `<nav class="crumb"><a href="/">홈</a></nav>
<h1>${esc(c.name)} 고르는 법</h1>
<section class="prose"><p>${esc(c.intro)}</p>${figure(c.id)}<ul>${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
<section><h2>추천 ${esc(c.name)}</h2>${grid(items)}</section>
${related.length ? `<section><h2>${esc(c.name)} 비교·추천 가이드</h2>${guideGrid(related)}</section>` : ''}`,
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
      title: g.title,
      desc: g.desc,
      path: `/g/${g.slug}`,
      body: `<nav class="crumb"><a href="/">홈</a> › 비교·추천</nav>
<h1>${esc(g.title)}</h1>
<section class="prose"><p>${esc(g.intro)}</p>${figure(byId[g.picks[0]?.id]?.p.category)}</section>
<section><h2>한눈에 비교: 항목별 점수</h2><div class="tablewrap"><table class="scores"><thead><tr><th>모델</th>${crit.map((c) => `<th>${esc(c)}</th>`).join('')}<th>종합</th><th></th></tr></thead><tbody>${scoreRows}</tbody></table></div>
<p class="note score-note">※ ${SCORE_NOTE}</p>
<p class="note">${DISCLOSURE}</p></section>
<section><h2>장단점 비교</h2><div class="tablewrap"><table class="proscons"><thead><tr><th>모델</th><th>장점</th><th>단점</th></tr></thead><tbody>${proRows}</tbody></table></div></section>
${cards}
<section class="prose">${g.sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('')}</section>
<section class="prose"><h2>자주 묻는 질문</h2>${g.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>
<section><h2>다른 비교·추천 가이드</h2>${guideGrid(guides.filter((o) => o.slug !== g.slug))}</section>`,
    }),
  );
}

// ---------- 메인 페이지 ----------
const deals = tracked.filter((e) => e.a.verdict.cls === 'good');
const sections = cats
  .map((c) => {
    const items = entries.filter((e) => e.p.category === c.id);
    return `<section id="${c.id}"><h2><a href="/c/${c.id}">${esc(c.name)}</a></h2>${grid(items)}</section>`;
  })
  .join('');
writeText(
  join(OUT, 'index.html'),
  layout({
    title: SITE_NAME,
    desc: '드라이버, 아이언, 퍼터, 골프공, 거리측정기, 골프화 고르는 법과 가격 정보. 지금 사도 되는지 알려드립니다.',
    path: '/',
    body: `<section class="intro">
<h1>골프용품, 지금 사도 될까?</h1>
<p>인기 골프용품의 특징과 고르는 법을 정리하고, 가격을 기록해 살 때인지 알려드립니다.${tracked.length ? ` <small>가격 업데이트 ${updated}</small>` : ''}</p>
<nav class="chips">${cats.map((c) => `<a href="/c/${c.id}">${esc(c.name)}</a>`).join('')}</nav>
</section>
${deals.length ? `<section><h2>🔥 지금 사기 좋은 상품</h2>${grid(deals)}</section>` : ''}
${guides.length ? `<section><h2>비교·추천 가이드</h2>${guideGrid(guides)}</section>` : ''}
${sections}`,
  }),
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
