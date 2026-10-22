// 상품 상세 이미지(세로로 긴 한 장)의 원본 HTML. src/detail-render.mjs 가 크롬 헤드리스로 캡처해 content/detail/{id}.webp 로 만든다.
// 내용은 사이트 데이터(가이드 평가·사양·장단점·구매 전 확인)만 쓴다. 제조사·판매자 이미지와 글은 쓰지 않는다(쿠팡 API 대표 사진만).
// 폭 860px 기준(2배 해상도로 캡처). 글꼴은 윈도우 기본 맑은 고딕(캡처는 이 PC 에서 한다).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SK = ['초심자', '중급', '고급', '프로'];

export function detailHtml(d) {
  const ladder = SK.map((s, i) => `<div class="st${s === d.skill ? ' on' : ''}"><i>${i + 1}</i><b>${s}</b></div>`).join('<span class="ar"></span>');
  const bars = (d.criteria ?? [])
    .map((c, i) => {
      const v = d.scores?.[i];
      if (!v) return '';
      return `<div class="bar"><span class="bl">${esc(c)}</span><span class="bt"><i style="width:${v * 20}%"></i></span><span class="bv">${v}<small>/5</small></span></div>`;
    })
    .join('');
  const specs = (d.specs ?? []).filter(([, v]) => v && !/^TBD$/.test(v));
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;width:860px;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#16241b;background:#fff;-webkit-font-smoothing:antialiased}
.sec{padding:64px 64px}
.k{font-size:20px;font-weight:700;letter-spacing:.12em;color:#1f7a4d;margin:0 0 10px}
h2{font-size:40px;line-height:1.25;margin:0 0 28px;letter-spacing:-.02em}
.hero{background:linear-gradient(160deg,#0f2a1c 0%,#1c4a32 60%,#22603f 100%);color:#fff;padding:70px 64px 0;text-align:center;overflow:hidden}
.hero .brand{font-size:22px;font-weight:700;letter-spacing:.3em;color:#9fd8b8;margin:0}
.hero h1{font-size:54px;line-height:1.2;margin:14px 0 14px;letter-spacing:-.03em}
.hero .tag{display:inline-block;font-size:24px;font-weight:700;color:#0f2a1c;background:#e9c46a;border-radius:999px;padding:10px 26px;margin:0 0 30px}
.hero .chips{display:flex;justify-content:center;gap:12px;margin:0 0 36px}
.hero .chip{font-size:20px;border:1.5px solid rgba(255,255,255,.45);border-radius:999px;padding:8px 18px}
.hero .ph{width:560px;height:560px;margin:0 auto;background:#fff;border-radius:50% 50% 0 0;display:flex;align-items:flex-end;justify-content:center;padding:50px 50px 30px}
.hero .ph img{width:440px;height:440px;object-fit:contain}
.who{background:#f6f3ea}
.quote{font-size:30px;line-height:1.55;font-weight:700;margin:0 0 40px;padding-left:24px;border-left:8px solid #1f7a4d}
.ladder{display:flex;align-items:center;gap:0}
.st{flex:1;text-align:center;padding:20px 8px;border-radius:18px;background:#fff;border:2px solid #e2ddd0;color:#8a8a7c}
.st i{display:block;font-style:normal;font-size:18px;margin-bottom:4px}
.st b{font-size:26px}
.st.on{background:#1f7a4d;border-color:#1f7a4d;color:#fff;transform:scale(1.08);box-shadow:0 10px 24px rgba(31,122,77,.3)}
.ar{width:26px;height:2px;background:#d8d2c2;flex:0 0 26px}
.note{font-size:18px;color:#7a7a6c;margin:22px 0 0}
.score-big{display:flex;align-items:baseline;gap:12px;margin:0 0 30px}
.score-big b{font-size:88px;line-height:1;color:#1f7a4d;letter-spacing:-.04em}
.score-big span{font-size:24px;color:#7a7a6c}
.bar{display:grid;grid-template-columns:200px 1fr 90px;align-items:center;gap:20px;margin:0 0 20px}
.bl{font-size:26px;font-weight:700}
.bt{height:22px;background:#edf2ee;border-radius:99px;overflow:hidden}
.bt i{display:block;height:100%;background:linear-gradient(90deg,#3aa673,#1f7a4d);border-radius:99px}
.bv{font-size:30px;font-weight:800;text-align:right}
.bv small{font-size:18px;color:#7a7a6c;font-weight:600}
.spec{background:#0f2a1c;color:#fff}
.spec .k{color:#9fd8b8}
.tbl{border-top:2px solid rgba(255,255,255,.6)}
.row{display:grid;grid-template-columns:240px 1fr;gap:20px;padding:24px 0;border-bottom:1px solid rgba(255,255,255,.18);font-size:26px}
.row span{color:#9fd8b8;font-weight:700}
.row b{font-weight:700}
.pc{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.card{border-radius:24px;padding:32px 30px}
.card h3{font-size:28px;margin:0 0 18px;display:flex;align-items:center;gap:12px}
.card h3 i{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;font-style:normal;font-size:26px;color:#fff}
.card ul{margin:0;padding:0;list-style:none}
.card li{font-size:23px;line-height:1.5;padding:12px 0;border-top:1px solid rgba(0,0,0,.08)}
.plus{background:#e8f4ed}.plus h3 i{background:#1f7a4d}
.minus{background:#fbefe6}.minus h3 i{background:#c4622d}
.verdict{margin:34px 0 0;padding:30px 34px;border-radius:24px;background:#16241b;color:#fff;font-size:27px;line-height:1.55;font-weight:700}
.verdict small{display:block;font-size:19px;color:#9fd8b8;margin-bottom:8px;letter-spacing:.1em}
.chk{background:#f6f3ea}
.chk ol{margin:0;padding:0;list-style:none;counter-reset:c}
.chk li{counter-increment:c;display:grid;grid-template-columns:56px 1fr;gap:16px;align-items:start;font-size:24px;line-height:1.5;padding:18px 0;border-top:1px solid #e2ddd0}
.chk li::before{content:counter(c);display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#16241b;color:#fff;font-weight:800;font-size:22px}
.foot{padding:34px 64px 44px;background:#0f2a1c;color:#9fd8b8;font-size:18px;display:flex;justify-content:space-between;gap:20px}
.foot b{color:#fff;font-size:22px}
</style><body>
<section class="hero">
<p class="brand">${esc(d.brand)}</p>
<h1>${esc(d.name)}</h1>
${d.short ? `<p class="tag">${esc(d.short)}</p>` : ''}
<div class="chips">${d.skill ? `<span class="chip">${esc(d.skill)} 추천</span>` : ''}${d.rank ? `<span class="chip">${esc(d.rank)}</span>` : ''}${d.level ? `<span class="chip">${esc(d.level)}</span>` : ''}</div>
${d.image ? `<div class="ph"><img src="${esc(d.image)}"></div>` : '<div style="height:40px"></div>'}
</section>
${d.forWhom ? `<section class="sec who"><p class="k">WHO IS IT FOR</p><h2>이런 분께 맞습니다</h2><p class="quote">${esc(d.forWhom)}</p>${d.skill ? `<div class="ladder">${ladder}</div><p class="note">ATL골프기어가 ${esc(d.guide)}에서 분류한 실력 단계입니다.</p>` : ''}</section>` : ''}
${bars ? `<section class="sec"><p class="k">EDITOR SCORE</p><h2>항목별 편집 점수</h2><div class="score-big"><b>${d.total.toFixed(1)}</b><span>/ 5 종합</span></div>${bars}<p class="note">편집 점수는 ATL골프기어의 주관적인 참고 점수이며 공식 평가가 아닙니다.</p></section>` : ''}
${specs.length ? `<section class="sec spec"><p class="k">SPEC</p><h2>핵심 사양</h2><div class="tbl">${specs.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div><p class="note" style="color:#9fd8b8">'연결 상품' 항목은 이 사이트가 연결한 쿠팡 판매 상품 기준입니다.</p></section>` : ''}
${d.pros?.length || d.cons?.length ? `<section class="sec"><p class="k">PROS &amp; CONS</p><h2>강점과 감안할 점</h2><div class="pc">
<div class="card plus"><h3><i>+</i>강점</h3><ul>${(d.pros ?? []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
<div class="card minus"><h3><i>−</i>감안할 점</h3><ul>${(d.cons ?? []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
${d.verdict ? `<p class="verdict"><small>한 줄 결론</small>${esc(d.verdict)}</p>` : ''}</section>` : ''}
${d.checks?.length ? `<section class="sec chk"><p class="k">CHECK POINT</p><h2>구매 전 꼭 확인하세요</h2><ol>${d.checks.slice(0, 5).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>` : ''}
<div class="foot"><span><b>${esc(d.site || '초이스골프')}</b><br>golfprice.unclepony.com</span><span style="text-align:right">기준일 ${esc(d.date)}<br>사진: 쿠팡 판매 상품 이미지</span></div>
</body></html>`;
}
