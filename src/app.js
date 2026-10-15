// ATL골프기어 화면 동작: 검색(자동완성·결과), 골프 카테고리 메뉴, 최근 본 상품, 움직이는 배너, 탭
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s\-_·.()]/g, '');

  // ---------- 검색 데이터 ----------
  let dataP;
  const loadData = () => (dataP ??= fetch('/assets/search.json').then((r) => r.json()));

  function find(data, q) {
    const words = q.split(/\s+/).map(norm).filter(Boolean);
    if (!words.length) return { products: [], guides: [] };
    const hit = (txt) => words.every((w) => norm(txt).includes(w));
    const products = data.products.filter((p) => hit(`${p.n} ${p.k} ${p.c}`));
    const ids = new Set(products.map((p) => p.id));
    const guides = data.guides.filter((g) => hit(`${g.t} ${g.k}`) || g.picks.some((pk) => ids.has(pk.id)));
    return { products, guides };
  }

  // ---------- 자동완성 ----------
  const q = $('#q');
  const sug = $('#suggest');
  if (q && sug) {
    let timer;
    const render = async () => {
      const v = q.value.trim();
      if (!v) return (sug.hidden = true);
      const { products, guides } = find(await loadData(), v);
      const rows = [
        ...guides.slice(0, 3).map((g) => `<a href="${g.u}" class="sg"><span class="sg-c">비교</span><span class="sg-n">${esc(g.t)}</span></a>`),
        ...products.slice(0, 6).map((p) => `<a href="${p.u}" class="sg">${p.i ? `<img src="${esc(p.i)}" alt="">` : ''}<span class="sg-n">${esc(p.n)}</span><span class="sg-c">${esc(p.c)}${p.s ? ` · ${p.s.toFixed(1)}점` : ''}</span></a>`),
      ];
      sug.innerHTML = rows.length
        ? rows.join('') + `<a class="sg all" href="/search?q=${encodeURIComponent(v)}">'${esc(v)}' 검색 결과 전체 보기 ›</a>`
        : '<p class="sg-empty">검색 결과가 없습니다.</p>';
      sug.hidden = false;
    };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
    q.addEventListener('focus', () => { loadData(); if (q.value.trim()) render(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) sug.hidden = true; });
    const params = new URLSearchParams(location.search);
    if (location.pathname.startsWith('/search') && params.get('q')) q.value = params.get('q');
  }

  // ---------- 검색 결과 페이지: 비교 정보 + 상품 정보 ----------
  const sRes = $('#sResults');
  if (sRes) {
    const v = new URLSearchParams(location.search).get('q')?.trim() ?? '';
    $('#sTitle').textContent = v ? `'${v}' 검색 결과` : '검색';
    if (v) {
      loadData().then((data) => {
        const { products, guides } = find(data, v);
        const ids = new Set(products.map((p) => p.id));
        const guideHtml = guides
          .map(
            (g) => `<article class="scmp">
<div class="scmp-h"><span class="tag score">${g.picks.length}종 비교</span><a href="${g.u}"><h2>${esc(g.t)}</h2></a></div>
<table class="scmp-t"><thead><tr><th>순위</th><th>모델</th>${g.crit.map((c) => `<th>${esc(c)}</th>`).join('')}<th>종합</th><th>장점 · 단점</th></tr></thead><tbody>
${g.picks
  .map(
    (pk, i) => `<tr class="${ids.has(pk.id) ? 'match' : ''}"><td class="rk">${i + 1}</td>
<td class="pcell">${pk.i ? `<img src="${esc(pk.i)}" alt="">` : ''}<a href="${pk.u}">${esc(pk.n)}</a><br><span class="badge mid">${esc(pk.role)}</span></td>
${pk.sc.map((s) => `<td class="sc"><span class="dots">${'●'.repeat(s)}<i>${'●'.repeat(5 - s)}</i></span></td>`).join('')}
<td class="total"><b>${pk.s != null ? pk.s.toFixed(1) : '-'}</b></td>
<td class="t"><span class="pro">＋ ${esc(pk.pro)}</span><br><span class="con">－ ${esc(pk.con)}</span></td></tr>`,
  )
  .join('')}
</tbody></table>
<a class="more-link" href="${g.u}">장단점 전체와 고르는 법 보기 ›</a>
</article>`,
          )
          .join('');
        const prodHtml = products
          .map(
            (p) => `<article class="sprod">
<a class="sprod-img" href="${p.u}">${p.i ? `<img src="${esc(p.i)}" alt="${esc(p.n)}">` : ''}</a>
<div class="sprod-body"><span class="pt-cat">${esc(p.c)}</span><a href="${p.u}"><h3>${esc(p.n)}</h3></a>
<div class="pt-badges">${p.r ? '<span class="tag rocket">로켓배송</span>' : ''}${p.s ? `<span class="tag score">편집 점수 ${p.s.toFixed(1)}</span>` : ''}</div>
<p>${esc(p.d)}</p></div>
<div class="sprod-act">${p.lv ? `<span class="lvl lvl-${p.lvn}"><i>${'₩'.repeat(p.lvn)}</i>${esc(p.lv)}</span>` : ''}<a class="btn sm" href="${p.u}">상세·비교 보기</a>${p.l ? `<a class="btn sm ghost" href="${esc(p.l)}" target="_blank" rel="${p.st === '쿠팡' ? 'sponsored ' : ''}nofollow noopener">${p.st === '쿠팡' ? '쿠팡 가격 확인' : `${esc(p.st)} 보기`}</a>` : ''}</div>
</article>`,
          )
          .join('');
        sRes.innerHTML =
          (guideHtml ? `<section><h2 class="s-h">비교 정보</h2>${guideHtml}</section>` : '') +
          (prodHtml ? `<section><h2 class="s-h">상품 정보 <small>${products.length}개</small></h2>${prodHtml}<p class="note">쿠팡 가격 확인 버튼은 쿠팡 파트너스 링크이며, 이 사이트는 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다.</p></section>` : '') ||
          '<p class="empty">검색 결과가 없습니다. 드라이버, 퍼터, 골프공처럼 종류로 검색해 보세요.</p>';
      });
    }
  }

  // ---------- 골프 카테고리 메뉴 ----------
  const catBtn = $('#catBtn');
  const catMenu = $('#catMenu');
  if (catBtn && catMenu) {
    catBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      catMenu.hidden = !catMenu.hidden;
      catBtn.setAttribute('aria-expanded', String(!catMenu.hidden));
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.allcat')) { catMenu.hidden = true; catBtn.setAttribute('aria-expanded', 'false'); } });
  }

  // ---------- 최근 본 상품 (이 브라우저에만 저장) ----------
  const KEY = 'recentProducts';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const cur = $('main[data-recent]');
  if (cur) {
    try {
      const item = JSON.parse(cur.dataset.recent);
      write([item, ...read().filter((x) => x.id !== item.id)].slice(0, 12));
    } catch {}
  }
  const rBtn = $('#recentBtn');
  const rPanel = $('#recentPanel');
  const rCount = $('#recentCount');
  const list = read();
  if (rCount) rCount.textContent = list.length ? list.length : '';
  if (rBtn && rPanel) {
    rBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const items = read();
      rPanel.innerHTML = items.length
        ? `<p class="rp-h">최근 본 상품</p>${items.map((x) => `<a href="/p/${esc(x.id)}">${x.i ? `<img src="${esc(x.i)}" alt="">` : ''}<span>${esc(x.n)}</span></a>`).join('')}`
        : '<p class="rp-h">최근 본 상품이 없습니다.</p>';
      rPanel.hidden = !rPanel.hidden;
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.hd-icons')) rPanel.hidden = true; });
  }

  // ---------- 움직이는 비교 배너 ----------
  const slides = $$('#slides .slide');
  if (slides.length > 1) {
    const dots = $$('.sl-dots .dot');
    let i = 0;
    let t;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('on', k === i));
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const play = () => { if (!reduce) { clearInterval(t); t = setInterval(() => show(i + 1), 5000); } };
    $('.sl-prev')?.addEventListener('click', () => { show(i - 1); play(); });
    $('.sl-next')?.addEventListener('click', () => { show(i + 1); play(); });
    dots.forEach((d, k) => d.addEventListener('click', () => { show(k); play(); }));
    const hero = $('.mhero');
    hero?.addEventListener('mouseenter', () => clearInterval(t));
    hero?.addEventListener('mouseleave', play);
    play();
  }

  // ---------- 상세 페이지 사진 갤러리 ----------
  const galMain = $('#galMain');
  $$('.gal-t').forEach((b) =>
    b.addEventListener('click', () => {
      if (galMain) galMain.src = b.dataset.src;
      $$('.gal-t').forEach((x) => x.classList.toggle('on', x === b));
    }),
  );

  // ---------- 카테고리 탭 ----------
  $$('.tab').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.disabled) return;
      const scope = b.closest('.tabs-wrap') || b.closest('#cats') || document;
      $$('.tab', scope).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
      $$('.tabpanel', scope).forEach((p) => p.classList.toggle('on', p.dataset.panel === b.dataset.tab));
    }),
  );
})();
