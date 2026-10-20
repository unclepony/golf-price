// /admin — 운영자 전용 모니터링 페이지 (잠금: _middleware.js, 데이터: /admin/data)
// 페이지별 방문·유입 경로·기기·국가와 쿠팡 클릭률(쿠팡 클릭 ÷ 페이지뷰)을 보여 준다.
// 아래 화면 스크립트는 템플릿 문자열(백틱·${})을 쓰지 않는다 — String.raw 안에 들어가기 때문.
const PAGE = String.raw`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>사이트 모니터링</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16202a;--sub:#5d6b78;--line:#e3e7ec;--acc:#127a52;--acc2:#e0731f;--bar:#cfe6da;--up:#127a52;--down:#c0392b}
@media (prefers-color-scheme:dark){:root{--bg:#11161b;--card:#1a2129;--ink:#e6ebf0;--sub:#93a1ae;--line:#2a333d;--acc:#3fbf87;--acc2:#f0954a;--bar:#25463a;--up:#3fbf87;--down:#ef6b5b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:16px}
header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}
h1{font-size:18px;margin:0}
h1 small{font-weight:400;color:var(--sub);font-size:13px;margin-left:6px}
.seg{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--card)}
.seg button{border:0;background:none;color:var(--ink);padding:7px 12px;font:inherit;cursor:pointer}
.seg button.on{background:var(--acc);color:#fff}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.kpi b{display:block;font-size:22px;margin:2px 0}
.kpi span{color:var(--sub);font-size:12px}
.kpi.hl{border-color:var(--acc)}
.up{color:var(--up)}.down{color:var(--down)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:14px;min-width:0}
.card h2{font-size:15px;margin:0 0 10px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.grid2 .card,.grid3 .card{margin-bottom:0}
.rowgap{margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left;white-space:normal;word-break:break-all}
th{color:var(--sub);font-weight:600;font-size:12px}
td a{color:inherit}
td small{color:var(--sub);display:block}
.tw{overflow-x:auto}
.mini{display:inline-block;height:6px;background:var(--acc);border-radius:3px;vertical-align:middle;margin-left:6px;opacity:.7}
.legend{display:flex;gap:14px;color:var(--sub);font-size:12px;margin-bottom:6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
svg text{fill:var(--sub);font-size:10px}
.note{color:var(--sub);font-size:12px;line-height:1.6}
.err{background:#fdecea;color:#8a1c12;border-radius:8px;padding:12px}
label.me{display:flex;gap:6px;align-items:center;color:var(--sub);font-size:13px;cursor:pointer}
.empty{color:var(--sub);text-align:center;padding:18px}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.grid2,.grid3{grid-template-columns:1fr}.kpi.hl{grid-column:1/-1}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>사이트 모니터링<small id="range"></small></h1>
  <div class="seg" id="seg">
    <button data-d="1">오늘</button><button data-d="7" class="on">7일</button><button data-d="30">30일</button><button data-d="90">90일</button>
  </div>
  <label class="me"><input type="checkbox" id="me"> 이 브라우저의 방문은 세지 않기</label>
</header>
<div id="msg"></div>
<div class="kpis" id="kpis"></div>
<div class="card"><h2>날짜별 추이</h2><div class="legend"><span><i style="background:var(--bar)"></i>페이지뷰</span><span><i style="background:var(--acc)"></i>방문</span><span><i style="background:var(--acc2)"></i>쿠팡 클릭</span></div><div id="chart"></div></div>
<div class="card"><h2>페이지별 트래픽과 쿠팡 클릭률</h2><div class="tw" id="pages"></div></div>
<div class="grid2 rowgap">
  <div class="card"><h2>쿠팡 클릭 많은 상품</h2><div class="tw" id="prods"></div></div>
  <div class="card"><h2>클릭한 버튼 위치</h2><div class="tw" id="pos"></div></div>
  <div class="card"><h2>쿠팡 외 제휴 클릭 (아고다 등)</h2><div class="tw" id="aff"></div></div>
</div>
<div class="card"><h2>유입 경로 — 어디서 들어와서 얼마나 쿠팡으로 갔나</h2><div class="tw" id="ref"></div></div>
<div class="grid2 rowgap">
  <div class="card"><h2>들어온 외부 페이지</h2><div class="tw" id="refurl"></div><p class="note">다른 사이트는 보통 도메인까지만 알려 줍니다. 캠페인(utm) 링크는 출처 / 매체 / 캠페인으로 보입니다.</p></div>
  <div class="card"><h2>검색어</h2><div class="tw" id="kw"></div><p class="note">네이버·다음·빙 등이 검색어를 넘길 때만 보입니다. 구글은 검색어를 넘기지 않으니 구글 서치콘솔에서 확인하세요.</p></div>
</div>
<div class="card"><h2>유입 경로별 첫 페이지</h2><div class="tw" id="refland"></div></div>
<div class="card"><h2>사이트 안 이동 — 어느 페이지에서 어디로 갔나</h2><div class="tw" id="nav"></div><p class="note">첫 페이지만 보고 나가는지, 쿠팡 버튼이 있는 비교 페이지로 넘어가는지 봅니다.</p></div>
<div class="card"><h2>페이지를 떠날 때 — 얼마나 내려 보고, 얼마나 머물렀나</h2><div class="tw" id="eng"></div><p class="note">'첫 화면'은 아래로 거의 안 내린 것, '끝까지'는 95% 이상 내린 것. 탭을 숨기거나 닫을 때 한 번 셉니다.</p></div>
<div class="grid2 rowgap">
  <div class="card"><h2>기기</h2><div id="dev"></div></div>
  <div class="card"><h2>국가</h2><div id="cty"></div></div>
</div>
<p class="note">
  <b>쿠팡 클릭률</b> = 쿠팡 링크 클릭 ÷ 페이지뷰. <b>방문당 클릭률</b> = 쿠팡 링크 클릭 ÷ 방문(브라우저 탭에서 처음 연 페이지 1회). 화살표는 바로 앞 같은 기간과 비교한 값입니다.<br>
  하루 단위 합계만 저장하며 IP·쿠키·사용자 ID 는 저장하지 않습니다. 검색 로봇, 광고 차단기를 쓰거나 스크립트를 끈 방문은 빠지므로 쿠팡 파트너스 리포트의 클릭 수와 조금 다를 수 있습니다. 실제 수익·주문은 쿠팡 파트너스 리포트에서 확인하세요.
</p>
</div>
<script>
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (n) { return Number(n || 0).toLocaleString('ko-KR'); };
  var pct = function (a, b) { return b ? (a / b * 100).toFixed(a / b < 0.1 ? 2 : 1) + '%' : '–'; };

  var me = $('#me');
  try { me.checked = localStorage.getItem('gp_nostat') === '1'; } catch (e) {}
  me.addEventListener('change', function () { try { me.checked ? localStorage.setItem('gp_nostat', '1') : localStorage.removeItem('gp_nostat'); } catch (e) {} });

  var days = 7;
  try { days = +localStorage.getItem('gp_admin_days') || 7; } catch (e) {}
  $('#seg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    days = +b.dataset.d; try { localStorage.setItem('gp_admin_days', days); } catch (e2) {}
    load();
  });

  function delta(cur, prev, isRate) {
    if (!prev) return '<span>이전 기간 데이터 없음</span>';
    var d = isRate ? (cur - prev) * 100 : (cur - prev) / prev * 100;
    var cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + Math.abs(d).toFixed(1) + (isRate ? '%p' : '%') + '</span> <span>이전 ' + (isRate ? (prev * 100).toFixed(2) + '%' : num(prev)) + '</span>';
  }
  function table(head, rows, empty) {
    if (!rows.length) return '<div class="empty">' + (empty || '아직 데이터가 없습니다') + '</div>';
    return '<table><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function shares(list) {
    var total = list.reduce(function (s, x) { return s + x.n; }, 0);
    return table(['', '방문', '비율'], list.slice(0, 15).map(function (x) {
      return [esc(x.k), num(x.n), pct(x.n, total) + '<span class="mini" style="width:' + Math.round(x.n / total * 60) + 'px"></span>'];
    }));
  }
  function chart(d) {
    var w = 1080, h = 200, pad = 26, n = d.length;
    var max = Math.max.apply(null, d.map(function (x) { return x.pv; }).concat([1]));
    var maxO = Math.max.apply(null, d.map(function (x) { return x.out; }).concat([1]));
    var bw = (w - pad * 2) / n;
    var s = '<svg viewBox="0 0 ' + w + ' ' + (h + 24) + '" width="100%" role="img" aria-label="날짜별 추이">';
    d.forEach(function (x, i) {
      var X = pad + i * bw, gap = Math.min(4, bw * 0.2);
      var hp = x.pv / max * h, hv = x.visit / max * h;
      s += '<rect x="' + (X + gap / 2) + '" y="' + (h - hp) + '" width="' + (bw - gap) + '" height="' + hp + '" fill="var(--bar)"><title>' + x.day + ' 페이지뷰 ' + x.pv + ' · 방문 ' + x.visit + ' · 쿠팡 클릭 ' + x.out + '</title></rect>';
      s += '<rect x="' + (X + bw * 0.3) + '" y="' + (h - hv) + '" width="' + (bw * 0.4) + '" height="' + hv + '" fill="var(--acc)" pointer-events="none"></rect>';
      if (n <= 31 || i % Math.ceil(n / 15) === 0) s += '<text x="' + (X + bw / 2) + '" y="' + (h + 14) + '" text-anchor="middle">' + x.day.slice(5).replace('-', '.') + '</text>';
    });
    var pts = d.map(function (x, i) { return (pad + i * bw + bw / 2) + ',' + (h - x.out / maxO * h * 0.9); }).join(' ');
    s += '<polyline points="' + pts + '" fill="none" stroke="var(--acc2)" stroke-width="2" pointer-events="none"></polyline>';
    s += '<text x="2" y="10">' + num(max) + '</text><text x="' + (w - 2) + '" y="10" text-anchor="end" style="fill:var(--acc2)">클릭 ' + num(maxO) + '</text>';
    return s + '</svg>';
  }

  function render(j) {
    $('#range').textContent = j.from === j.to ? j.to : j.from + ' ~ ' + j.to;
    Array.prototype.forEach.call(document.querySelectorAll('#seg button'), function (b) { b.classList.toggle('on', +b.dataset.d === j.days); });
    var by = {}; j.rows.forEach(function (r) { (by[r.kind] = by[r.kind] || []).push(r); });
    Object.keys(by).forEach(function (k) { by[k].sort(function (a, b) { return b.n - a.n; }); });
    var sum = function (k) { return (by[k] || []).reduce(function (s, x) { return s + x.n; }, 0); };
    var prev = {}; j.prev.forEach(function (r) { prev[r.kind] = r.n; });
    var pv = sum('pv'), vi = sum('visit'), out = sum('out');
    $('#kpis').innerHTML = [
      ['페이지뷰', num(pv), delta(pv, prev.pv)],
      ['방문', num(vi), delta(vi, prev.visit)],
      ['쿠팡 클릭', num(out), delta(out, prev.out)],
      ['쿠팡 클릭률 (클릭÷페이지뷰)', pct(out, pv), delta(pv ? out / pv : 0, prev.pv ? (prev.out || 0) / prev.pv : 0, true), 'hl'],
      ['방문당 클릭률 (클릭÷방문)', pct(out, vi), delta(vi ? out / vi : 0, prev.visit ? (prev.out || 0) / prev.visit : 0, true)],
    ].map(function (k) { return '<div class="kpi ' + (k[3] || '') + '"><span>' + k[0] + '</span><b>' + k[1] + '</b>' + k[2] + '</div>'; }).join('');

    var days = {}; for (var t = Date.parse(j.from); t <= Date.parse(j.to); t += 864e5) { var dd = new Date(t).toISOString().slice(0, 10); days[dd] = { day: dd, pv: 0, visit: 0, out: 0 }; }
    j.daily.forEach(function (r) { if (days[r.day]) days[r.day][r.kind] = r.n; });
    $('#chart').innerHTML = pv || out ? chart(Object.keys(days).sort().map(function (k) { return days[k]; })) : '<div class="empty">아직 데이터가 없습니다</div>';

    var pages = {};
    var P = function (p) { return pages[p] = pages[p] || { p: p, pv: 0, visit: 0, seen: 0, out: 0 }; };
    (by.pv || []).forEach(function (r) { P(r.k).pv = r.n; });
    (by.visit || []).forEach(function (r) { P(r.k).visit = r.n; });
    (by.seen || []).forEach(function (r) { P(r.k).seen = r.n; });
    var prods = {};
    (by.out || []).forEach(function (r) {
      var i = r.k.lastIndexOf('|'), p = r.k.slice(0, i), id = r.k.slice(i + 1);
      P(p).out += r.n; prods[id] = (prods[id] || 0) + r.n;
    });
    var plist = Object.keys(pages).map(function (k) { return pages[k]; }).sort(function (a, b) { return b.pv - a.pv || b.out - a.out; });
    $('#pages').innerHTML = table(['페이지', '페이지뷰', '방문 시작', '쿠팡 버튼 봄', '쿠팡 클릭', '클릭률', '버튼 본 뒤 클릭률'], plist.slice(0, 60).map(function (x) {
      var title = j.pages[x.p];
      return ['<a href="' + esc(x.p) + '" target="_blank" rel="noopener">' + esc(title || x.p) + '</a>' + (title ? '<small>' + esc(x.p) + '</small>' : ''), num(x.pv), num(x.visit), num(x.seen), num(x.out), pct(x.out, x.pv), x.seen ? pct(x.out, x.seen) : '-'];
    }));
    $('#prods').innerHTML = table(['상품', '클릭', '비율'], Object.keys(prods).sort(function (a, b) { return prods[b] - prods[a]; }).slice(0, 30).map(function (id) {
      return [(j.products[id] ? '<a href="/p/' + esc(id) + '" target="_blank" rel="noopener">' + esc(j.products[id]) + '</a>' : esc(id)), num(prods[id]), pct(prods[id], out)];
    }), '아직 쿠팡 클릭이 없습니다');
    $('#pos').innerHTML = table(['위치', '클릭', '비율'], (by.pos || []).map(function (x) { return [esc(x.k), num(x.n), pct(x.n, out)]; }), '아직 쿠팡 클릭이 없습니다');
    $('#aff').innerHTML = table(['페이지', '링크', '클릭'], (by.aff || []).slice(0, 30).map(function (x) {
      var i = x.k.lastIndexOf('|'), p = x.k.slice(0, i);
      return ['<a href="' + esc(p) + '" target="_blank" rel="noopener">' + esc(j.pages[p] || p) + '</a>', esc(x.k.slice(i + 1)), num(x.n)];
    }), '아직 제휴 클릭이 없습니다');
    var outref = {}; (by.outref || []).forEach(function (r) { outref[r.k] = r.n; });
    var refs = by.ref || [];
    Object.keys(outref).forEach(function (k) { if (!refs.some(function (r) { return r.k === k; })) refs.push({ k: k, n: 0 }); });
    $('#ref').innerHTML = table(['유입 경로', '방문', '비율', '쿠팡 클릭', '방문당 클릭률'], refs.map(function (x) {
      return [esc(x.k), num(x.n), pct(x.n, vi) + '<span class="mini" style="width:' + Math.round(vi ? x.n / vi * 60 : 0) + 'px"></span>', num(outref[x.k] || 0), pct(outref[x.k] || 0, x.n)];
    }));
    $('#refurl').innerHTML = table(['외부 페이지', '방문'], (by.refurl || []).slice(0, 30).map(function (x) {
      return [x.k.indexOf(' / ') >= 0 ?esc(x.k) : '<a href="https://' + esc(x.k) + '" target="_blank" rel="noopener noreferrer">' + esc(x.k) + '</a>', num(x.n)];
    }), '아직 외부 사이트에서 들어온 방문이 없습니다');
    $('#kw').innerHTML = table(['검색어', '검색엔진', '방문'], (by.kw || []).slice(0, 30).map(function (x) {
      var i = x.k.indexOf('|'); return [esc(x.k.slice(i + 1)), esc(x.k.slice(0, i)), num(x.n)];
    }), '아직 넘어온 검색어가 없습니다');
    $('#refland').innerHTML = table(['유입 경로', '첫 페이지', '방문'], (by.refland || []).slice(0, 40).map(function (x) {
      var i = x.k.indexOf('|'), p = x.k.slice(i + 1);
      return [esc(x.k.slice(0, i)), '<a href="' + esc(p) + '" target="_blank" rel="noopener">' + esc(j.pages[p] || p) + '</a>', num(x.n)];
    }));
    $('#nav').innerHTML = table(['앞 페이지', '다음 페이지', '이동'], (by.nav || []).slice(0, 40).map(function (x) {
      var i = x.k.indexOf('|'), a = x.k.slice(0, i), b = x.k.slice(i + 1);
      return ['<a href="' + esc(a) + '" target="_blank" rel="noopener">' + esc(j.pages[a] || a) + '</a>', '<a href="' + esc(b) + '" target="_blank" rel="noopener">' + esc(j.pages[b] || b) + '</a>', num(x.n)];
    }), '아직 사이트 안 이동이 없습니다');
    var eng = {}, DS = ['첫 화면', '25%', '50%', '75%', '끝까지'];
    var E = function (p) { return eng[p] = eng[p] || { p: p, n: 0, d: {}, quick: 0 }; };
    (by.depth || []).forEach(function (r) { var i = r.k.lastIndexOf('|'), e = E(r.k.slice(0, i)); e.n += r.n; e.d[r.k.slice(i + 1)] = r.n; });
    (by.stay || []).forEach(function (r) { var i = r.k.lastIndexOf('|'); if (r.k.slice(i + 1) === '10초 미만') E(r.k.slice(0, i)).quick += r.n; });
    $('#eng').innerHTML = table(['페이지', '떠난 페이지뷰'].concat(DS, ['10초 안에 떠남']), Object.keys(eng).map(function (k) { return eng[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 40).map(function (x) {
      return ['<a href="' + esc(x.p) + '" target="_blank" rel="noopener">' + esc(j.pages[x.p] || x.p) + '</a>', num(x.n)].concat(DS.map(function (d) { return pct(x.d[d] || 0, x.n); }), [pct(x.quick, x.n)]);
    }), '아직 자료가 없습니다');
    $('#dev').innerHTML = shares(by.dev || []);
    $('#cty').innerHTML = shares(by.cty || []);
  }

  function load() {
    $('#msg').innerHTML = '';
    fetch(location.origin + '/admin/data?days=' + days, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.error) throw new Error(j.error); render(j); })
      .catch(function (e) { $('#msg').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }
  load();
})();
</script>
</body>
</html>`;

export function onRequestGet() {
  return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
