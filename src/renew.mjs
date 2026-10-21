// 2026-10 리뉴얼: 큰 메뉴(메가 메뉴)·분류 목록(필터·정렬)·상품 상세 구매 상자
// 메뉴 구성은 해외 골프몰 구성을 참고하되 우리 품목만 두고(세일·의류·카트 등 없음), 지금 운영 중인 비교 콘텐츠는 '가이드' 메뉴 하나로 모았다.
// 주소(/c/·/p/·/g/)는 바꾸지 않는다(검색 순위 보호). 가격은 쿠팡 파트너스 공식 API·직접 확인한 쿠팡 판매가만 쓴다.

export const MENU = [
  { key: 'clubs', name: '클럽', cats: ['driver', 'wood', 'utility', 'iron', 'wedge', 'putter'] },
  { key: 'shoes', name: '골프화', cats: ['shoes'] },
  { key: 'ball', name: '골프공', cats: ['ball'] },
  { key: 'bag', name: '골프백', cats: ['bag'] },
  { key: 'gps', name: '거리측정기·GPS', cats: ['rangefinder', 'gps', 'launch'] },
  { key: 'acc', name: '용품', cats: ['glove', 'practice'] },
  { key: 'brand', name: '브랜드' },
  { key: 'guide', name: '가이드' },
];

// 상품 이름 첫 낱말 = 브랜드 (예: '핑 G440 드라이버' → 핑)
export const brandOfName = (name) => String(name).split(/\s+/)[0];

// 상품 하나의 목록용 정보 (필터·정렬 값 포함)
export function itemInfo(ctx, e) {
  const { p } = e;
  const sp = ctx.freshPrice(p.id);
  const gs = ctx.pageGuides.filter((g) => g.picks.some((pk) => pk.id === p.id));
  const genders = [...new Set(gs.map((g) => (g.gender && g.gender !== '공용' ? g.gender : '공용')))];
  return {
    id: p.id,
    name: p.name,
    brand: brandOfName(p.name),
    image: ctx.imageOf(p.id, e.hist) ?? '',
    skill: ctx.skillOf(p.id) ?? '',
    gender: genders.length ? genders : ['공용'],
    lvl: ctx.priceLevel(p.id)?.n ?? 0,
    price: sp?.won ?? 0,
    priceD: sp?.d ?? '',
    score: ctx.scoreOf[p.id] ?? 0,
    rocket: !!ctx.picks[p.id]?.rocket,
    sellable: ctx.sellable(p.id),
    year: p.year ?? '',
    cat: p.category,
  };
}

// ---------- 큰 메뉴 ----------
export function megaNav(ctx) {
  const { esc, cats, entries } = ctx;
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const count = (cid) => entries.filter((e) => e.p.category === cid).length;
  const brandsIn = (cids, n = 12) => {
    const m = new Map();
    for (const e of entries) if (cids.includes(e.p.category)) m.set(brandOfName(e.p.name), (m.get(brandOfName(e.p.name)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const col = (h, links) => (links.length ? `<div class="mg-col"><p class="mg-h">${esc(h)}</p>${links.join('')}</div>` : '');
  const a = (href, text, small = '') => `<a href="${href}">${esc(text)}${small ? `<small>${esc(small)}</small>` : ''}</a>`;
  const guideLink = (g) => {
    const c = ctx.guideCat(g);
    const who = g.gender && g.gender !== '공용' ? `${g.gender} ` : '';
    return a(`/g/${g.slug}`, `${who}${g.menuName ?? c?.name ?? ''}`, `${ctx.rankedPicks(g).length}종 비교`);
  };
  const panel = (m) => {
    if (m.key === 'brand') {
      const all = brandsIn(cats.map((c) => c.id), 60);
      return `<div class="mg-panel mg-brands"><p class="mg-h">브랜드 <small>상품 수</small></p><div class="mg-bgrid">${all.map(([b, n]) => a(`/search?q=${encodeURIComponent(b)}`, b, String(n))).join('')}</div></div>`;
    }
    if (m.key === 'guide') {
      const byCat = cats.map((c) => ctx.guidesFor(c.id)).flat();
      const uniq = [...new Set(byCat)];
      const half = Math.ceil(uniq.length / 2);
      return `<div class="mg-panel">${col('비교 가이드', uniq.slice(0, half).map(guideLink))}${col(' ', uniq.slice(half).map(guideLink))}${col('초보 Q&A', [a('/qa', '골프 초보 Q&A 전체'), ...ctx.qa.slice(0, 5).map((q) => a(`/qa/${q.slug}`, q.kw))])}${col('더 보기', [a('/#guides', '대표 비교 가이드'), ...(ctx.hasJp ? [a('/jp', '일본 골프채 정가 비교')] : []), a('/about', '운영 안내·점수 기준')])}</div>`;
    }
    const cids = m.cats.filter((id) => catById[id]);
    const gs = [...new Set(cids.flatMap((id) => ctx.guidesFor(id)))];
    const men = gs.filter((g) => g.gender === '남성');
    const women = gs.filter((g) => g.gender === '여성');
    const uni = gs.filter((g) => !g.gender || g.gender === '공용');
    const skillCol = gs
      .filter((g) => ctx.skillGroups(g).length && g.gender !== '여성')
      .slice(0, 2)
      .map((g) => col(`실력별 ${ctx.guideCat(g)?.name ?? ''}`, ctx.skillGroups(g).map((s) => a(ctx.skillPath(g, s.skill), `${s.skill}용`, `${s.ids.length}종`))))
      .join('');
    const brandCol = col(
      '인기 브랜드',
      brandsIn(cids, 10).map(([b]) => a(cids.length === 1 ? `/c/${cids[0]}?brand=${encodeURIComponent(b)}` : `/search?q=${encodeURIComponent(b)}`, b)),
    );
    return `<div class="mg-panel">${col(cids.length > 1 ? '종류' : '전체 상품', cids.map((id) => a(`/c/${id}`, `${catById[id].name} 전체`, `${count(id)}개`)))}${col('남성', men.map(guideLink))}${col('여성', women.map(guideLink))}${col(uni.length && (men.length || women.length) ? '남녀공용' : '비교 가이드', uni.map(guideLink))}${skillCol}${brandCol}</div>`;
  };
  const href = (m) => (m.cats ? `/c/${m.cats[0]}` : m.key === 'guide' ? '/#guides' : '/search');
  return `<nav class="mega" aria-label="상품 분류"><div class="wrap mega-in">
<button type="button" class="mg-burger" id="mgBurger" aria-expanded="false" aria-controls="mgList">☰ 메뉴</button>
<ul class="mg-list" id="mgList">${MENU.map((m) => `<li class="mg-item mg-${m.key}"><a class="mg-top" href="${href(m)}">${esc(m.name)}</a><button type="button" class="mg-open" aria-label="${esc(m.name)} 하위 메뉴 열기" aria-expanded="false">›</button>${panel(m)}</li>`).join('')}</ul>
</div></nav>`;
}

// ---------- 분류 목록 (필터·정렬) ----------
const LV = ['', '저가', '중가', '고가', '프리미엄'];
const SK = ['초심자', '중급', '고급', '프로'];
export function productCard(ctx, it) {
  const { esc, won } = ctx;
  const sk = it.skill ? `<span class="skill sk-${SK.indexOf(it.skill) + 1}">${esc(it.skill)}</span>` : '';
  const lv = it.lvl ? `<span class="lvl lvl-${it.lvl}" title="가격대: ${LV[it.lvl]}"><i>${'₩'.repeat(it.lvl)}</i><s>${'₩'.repeat(4 - it.lvl)}</s><em>${LV[it.lvl]}</em></span>` : '';
  return `<a class="pc" href="/p/${esc(it.id)}" data-brand="${esc(it.brand)}" data-skill="${esc(it.skill)}" data-gender="${esc(it.gender.join(' '))}" data-lvl="${it.lvl}" data-price="${it.price}" data-score="${it.score.toFixed(2)}" data-rocket="${it.rocket ? 1 : 0}" data-name="${esc(it.name)}">
<span class="pc-img">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" decoding="async" width="212" height="212">` : ''}${it.rocket ? '<span class="pc-rocket">로켓배송</span>' : ''}</span>
<span class="pc-brand">${esc(it.brand)}</span>
<b class="pc-name">${esc(it.name)}</b>
<span class="pc-tags tierline">${sk}${lv}</span>
${it.score ? `<span class="pc-score"><i style="--w:${(it.score / 5) * 100}%"></i>편집 점수 ${it.score.toFixed(1)}</span>` : ''}
<!--phist-->${it.price ? `<span class="pc-price"><b>${won(it.price)}</b><small>쿠팡 · ${+it.priceD.slice(5, 7)}.${+it.priceD.slice(8, 10)} 확인</small></span>` : `<span class="pc-price none">${it.sellable ? '쿠팡에서 가격 확인' : '판매처 확인'}</span>`}<!--/phist-->
</a>`;
}

export function listBlock(ctx, c, items) {
  const { esc } = ctx;
  const infos = items.map((e) => itemInfo(ctx, e)).sort((x, y) => y.score - x.score);
  const uniq = (xs) => [...new Set(xs)].filter(Boolean);
  const countBy = (f, v) => infos.filter((x) => f(x, v)).length;
  const group = (key, label, values, f, fmt = (v) => v) =>
    values.length > 1
      ? `<fieldset class="plp-g"><legend>${esc(label)}</legend>${values
          .map((v) => `<label><input type="checkbox" name="${key}" value="${esc(v)}"> ${esc(fmt(v))} <small>${countBy(f, v)}</small></label>`)
          .join('')}</fieldset>`
      : '';
  const brands = uniq(infos.map((x) => x.brand)).sort((a, b) => countBy((x, v) => x.brand === v, b) - countBy((x, v) => x.brand === v, a));
  const filters = [
    group('gender', '성별', uniq(infos.flatMap((x) => x.gender)).sort(), (x, v) => x.gender.includes(v), (v) => (v === '공용' ? '남녀공용' : v)),
    group('skill', '실력 단계', SK.filter((s) => infos.some((x) => x.skill === s)), (x, v) => x.skill === v),
    group('lvl', '가격대', [1, 2, 3, 4].filter((n) => infos.some((x) => x.lvl === n)).map(String), (x, v) => String(x.lvl) === v, (v) => LV[+v]),
    group('brand', '브랜드', brands, (x, v) => x.brand === v),
    infos.some((x) => x.rocket) ? `<fieldset class="plp-g"><legend>배송</legend><label><input type="checkbox" name="rocket" value="1"> 로켓배송만 <small>${infos.filter((x) => x.rocket).length}</small></label></fieldset>` : '',
  ].join('');
  return `<section class="plp" id="list" data-plp>
<div class="plp-bar"><p class="plp-n"><b id="plpN">${infos.length}</b>개 상품</p>
<button type="button" class="plp-ftoggle" id="plpFt" aria-expanded="false" aria-controls="plpF">필터</button>
<label class="plp-sort">정렬 <select id="plpSort"><option value="score">편집 점수 높은 순</option><option value="low">낮은 가격 순</option><option value="high">높은 가격 순</option><option value="name">이름 순</option></select></label></div>
<div class="plp-body">
<aside class="plp-f" id="plpF" aria-label="필터"><div class="plp-fh"><b>필터</b><button type="button" id="plpReset">초기화</button></div>${filters}</aside>
<div class="plp-grid" id="plpGrid">${infos.map((it) => productCard(ctx, it)).join('')}</div>
</div>
<p class="note plp-note">가격은 쿠팡 판매가를 확인한 날짜와 함께 보여 줍니다. 현재 가격·옵션은 쿠팡 판매 페이지에서 확인하세요. 편집 점수는 이 사이트의 주관적인 참고 점수입니다.</p>
</section>`;
}

// ---------- 상품 상세 구매 상자 (오른쪽) ----------
export function buyBox(ctx, p) {
  const { esc, won } = ctx;
  const sp = ctx.freshPrice(p.id);
  const href = ctx.outHref(p.id);
  if (!href) return '';
  return `<div class="bbox">
<p class="bbox-k">쿠팡 ${sp?.kind === 'api' ? '최저가' : '판매가'}</p>
<!--phist-->${sp ? `<p class="bbox-price"><b>${won(sp.won)}</b></p><p class="bbox-d">${+sp.d.slice(5, 7)}월 ${+sp.d.slice(8, 10)}일 확인 · 현재 가격과 다를 수 있음</p>` : '<p class="bbox-d">최근 확인한 가격이 없습니다. 쿠팡에서 현재 가격을 확인하세요.</p>'}<!--/phist-->
<a class="btn bbox-btn" href="${esc(href)}" target="_blank" rel="sponsored nofollow noopener">쿠팡에서 ${sp ? '이 가격' : '현재 가격'} 보기</a>
${ctx.picks[p.id]?.rocket ? '<p class="bbox-r"><span class="tag rocket">로켓배송</span> 연결 상품 기준</p>' : ''}
<p class="bbox-n">쿠팡 파트너스 링크입니다. 구매 시 이 사이트가 수수료를 받을 수 있으며, 구매자 가격은 같습니다.</p>
</div>`;
}

// 상품 정보 표 (브랜드·실력·가격대·가이드 사양)
export function infoTable(ctx, p) {
  const { esc } = ctx;
  const rows = [['브랜드', brandOfName(p.name)]];
  const sk = ctx.skillOf(p.id);
  if (sk) rows.push(['추천 실력', sk]);
  const lv = ctx.priceLevel(p.id);
  if (lv) rows.push(['가격대', `${lv.label} (${ctx.catName(p.category)} 비교 기준)`]);
  const mp = ctx.mainPick(p.id);
  if (mp) (mp.g.specRows ?? []).forEach((label, i) => mp.pk.specs?.[i] && !/^TBD$/.test(mp.pk.specs[i]) && rows.push([label.replace('연결 상품 ', '연결 상품 '), String(mp.pk.specs[i])]));
  return `<table class="pd-tbl"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
}

// 상세 화면 탭(같은 페이지 안 이동)
export const pdTabs = (tabs) => `<nav class="pd-tabs" aria-label="상품 정보 메뉴">${tabs.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</nav>`;

// ---------- 홈: 순환 배너(많이 본 상품) + 실시간 베스트(방문수 순위) ----------
const TONE = { driver: ['#0e2a1d', '#1f6b45'], wood: ['#10233a', '#22557f'], utility: ['#1f1b33', '#4b3f7a'], iron: ['#232323', '#5a5a5a'], wedge: ['#2c2014', '#7a5a2e'], putter: ['#0f2b2e', '#1f6a70'], ball: ['#2a1630', '#6a2f73'], rangefinder: ['#14202c', '#2f5576'], gps: ['#1c1c1c', '#3d4b5c'], launch: ['#1d1f2b', '#3f4e8a'], shoes: ['#2b1d16', '#7a4a2e'], bag: ['#132a22', '#2f6a55'], glove: ['#2a2a1a', '#6a6a33'], practice: ['#1a2a14', '#3f6a2e'] };
const menuOf = (cat) => MENU.find((m) => m.cats?.includes(cat))?.key ?? 'acc';

export function homeHero(ctx, items) {
  const { esc, won } = ctx;
  const slides = items
    .map((it, i) => {
      const [a, b] = TONE[it.cat] ?? TONE.driver;
      return `<a class="hs" href="/p/${esc(it.id)}" style="--a:${a};--b:${b}" aria-label="${esc(it.name)}"${i > 2 ? ' data-lazy="1"' : ''}>
<span class="hs-img">${it.image ? `<img src="${esc(it.image)}" alt="" ${i < 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="512" height="512">` : ''}</span>
<span class="hs-txt"><small>${esc(it.kicker)}</small><b>${esc(it.name)}</b><span>${esc(it.sub)}</span>${it.price ? `<em><!--phist-->${won(it.price)}<!--/phist--> <i>쿠팡 판매가</i></em>` : ''}</span></a>`;
    })
    .join('');
  return `<section class="hhero2" aria-label="많이 본 상품" data-hero>
<div class="hs-track" id="hsTrack">${slides}</div>
<button type="button" class="hs-nav prev" id="hsPrev" aria-label="이전">‹</button><button type="button" class="hs-nav next" id="hsNext" aria-label="다음">›</button>
<p class="hs-count"><button type="button" id="hsPause" aria-label="자동 넘김 멈춤">❚❚</button> <span id="hsN">1</span> / ${items.length}</p>
</section>`;
}

export function homeQuick(ctx) {
  const { esc, cats, entries } = ctx;
  return `<nav class="hquick" aria-label="분류 바로가기">${cats
    .map((c) => {
      const e = entries.find((x) => x.p.category === c.id && ctx.imageOf(x.p.id, x.hist));
      return `<a href="/c/${c.id}"><span>${e ? `<img src="${esc(ctx.imageOf(e.p.id, e.hist))}" alt="" loading="lazy" decoding="async" width="64" height="64">` : ''}</span>${esc(c.name)}</a>`;
    })
    .join('')}</nav>`;
}

export function homeBest(ctx, ranked, all) {
  const { esc } = ctx;
  const tabs = [['all', '전체'], ...MENU.filter((m) => m.cats).map((m) => [m.key, m.name])];
  const data = Object.fromEntries(all.map((it) => [it.id, it]));
  const cards = ranked.slice(0, 20).map((it, i) => productCard(ctx, it).replace('<a class="pc"', `<a class="pc" data-m="${menuOf(it.cat)}"`).replace('<span class="pc-img">', `<span class="pc-img"><span class="pc-rank">${i + 1}</span>`)).join('');
  return `<section class="hbest" id="best" data-best>
<div class="block-h"><h2>실시간 베스트</h2><span id="bestSpan">최근 방문 많은 순</span></div>
<nav class="hbest-tabs" role="tablist">${tabs.map(([k, t], i) => `<button type="button" role="tab" data-k="${k}"${i === 0 ? ' class="on" aria-selected="true"' : ''}>${esc(t)}</button>`).join('')}</nav>
<div class="plp-grid hbest-grid" id="bestGrid">${cards}</div>
<p class="note">사람들이 이 사이트에서 많이 본 상품 순서입니다(개인 정보 없이 페이지 방문 합계만 사용). 가격은 쿠팡 판매가를 확인한 날짜 기준입니다.</p>
<script type="application/json" id="bestData">${JSON.stringify(data).replace(/</g, '\u003c')}</script>
</section>`;
}
