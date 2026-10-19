// /jp 섹션: 일본 제조사 정가 vs 한국 공식 정가 비교와 직구 총비용 안내 (새 주소만 추가, 기존 페이지는 건드리지 않는다)
// 데이터: config/jp-models.json(사람이 공식 페이지에서 확인한 정가), config/jp-fx.json(src/jp-fx.mjs, ECB 기준환율)
// 세금은 계산하지 않고 관세청 공식 안내로 연결한다. 통관을 피하는 요령은 쓰지 않는다.
import { join } from 'node:path';
import { ROOT, readJson } from './lib.mjs';

const CUSTOMS = {
  calc: ['관세청 해외직구물품 예상세액 조회', 'https://www.customs.go.kr/kcs/ad/tax/BuyTaxCalculation.do'],
  smallFree: ['관세청 소액면세제도 안내(FAQ)', 'https://www.customs.go.kr/call/ad/crmcc/selectFaqViewPage.do?mi=6822&cnslKnwlSrno=512'],
  listClear: ['관세청 목록통관 안내(FAQ)', 'https://www.customs.go.kr/call/ad/crmcc/selectFaqViewPage.do?mi=6822&cnslKnwlSrno=463'],
  express: ['관세청 특송물품 통관 안내', 'https://www.customs.go.kr/kcs/cm/cntnts/cntntsView.do?mi=2821&cntntsId=819'],
  simple: ['관세청 간이 통관절차 안내', 'https://www.customs.go.kr/kcs/cm/cntnts/cntntsView.do?mi=8457&cntntsId=2807'],
};

// 환율·환산 값은 매일 바뀌므로 콘텐츠 지문에서 빼도록 표시한다(가격만 바뀐 날 '마지막 업데이트'가 바뀌지 않게)
const vol = (s) => `<!--phist-->${s}<!--/phist-->`;

export function writeJpPages({ layout, writeText, esc, won, OUT, crumbLd, updatedTag, hasProduct, productName }) {
  const data = readJson(join(ROOT, 'config', 'jp-models.json'), { models: [] });
  const fx = readJson(join(ROOT, 'config', 'jp-fx.json'), null);
  const models = data.models ?? [];
  if (!models.length || !fx?.krwPer100Jpy) return [];
  const rate = fx.krwPer100Jpy;
  const yen = (n) => `${n.toLocaleString('ko-KR')}엔`;
  const toWon = (y) => Math.round((y * rate) / 100);
  const gapOf = (m) => (m.jpYen && m.krWon ? { won: m.krWon - toWon(m.jpYen), pct: ((m.krWon / toWon(m.jpYen) - 1) * 100) } : null);
  const gapText = (g) => (g.won >= 0 ? `한국이 ${won(g.won)} (${g.pct.toFixed(1)}%) 비쌈` : `한국이 ${won(-g.won)} (${(-g.pct).toFixed(1)}%) 쌈`);
  const ymd = (d) => d.replaceAll('-', '.');
  const ext = (label, url) => `<a href="${esc(url)}" rel="noopener" target="_blank">${esc(label)}</a>`;
  const rateLine = `<p class="note">환율: ${vol(`100엔 = ${rate.toLocaleString('ko-KR')}원 (${ymd(fx.date)} 유럽중앙은행 기준환율로 계산)`)} · 은행에서 실제로 바꾸거나 카드로 결제할 때의 환율과 수수료는 이와 다릅니다.</p>`;
  const warn = `<div class="hero jp-warn"><p><b>⚠ 직구 전에 꼭 확인하세요</b></p><ul>
<li>일본에서 산 제품은 <b>국내 수입사의 A/S·보증을 받지 못하거나 유료</b>일 수 있습니다. 수입사에 먼저 확인하세요.</li>
<li>일본 판매 사양은 샤프트·로프트·그립이 한국 판매 사양과 다를 수 있습니다.</li>
<li>해외에서 사서 들여오면 관세·부가세가 붙을 수 있습니다. 세금은 <a href="/jp/customs">직구 세금 안내</a>와 관세청 공식 안내로 확인하세요.</li>
</ul></div>`;
  const sorted = [...models].sort((a, b) => (gapOf(b)?.pct ?? -1e9) - (gapOf(a)?.pct ?? -1e9));
  const urls = [];

  // ---------- 섹션 첫 화면 ----------
  const rows = sorted
    .map((m) => {
      const g = gapOf(m);
      return `<tr><td class="pcell"><a href="/jp/${m.slug}">${esc(m.name)}</a></td><td>${m.jpYen ? yen(m.jpYen) : '확인 못 함'}</td><td>${m.jpYen ? vol(won(toWon(m.jpYen))) : '-'}</td><td>${m.krWon ? won(m.krWon) : '확인 못 함'}</td><td>${g ? vol(gapText(g)) : '-'}</td></tr>`;
    })
    .join('');
  writeText(
    join(OUT, 'jp.html'),
    layout({
      title: '일본 골프채 가격 비교: 일본 정가 vs 한국 정가 (엔저 환율 반영)',
      desc: `젝시오·스릭슨·미즈노·PRGR·혼마 드라이버의 일본 제조사 정가와 한국 공식 정가를 오늘 환율로 비교합니다. 직구할 때 붙는 세금과 국내 A/S 주의점도 함께 정리했습니다.`,
      path: '/jp',
      ld: [crumbLd([['홈', '/'], ['일본 골프채 가격 비교', '/jp']])],
      body: `<nav class="crumb"><a href="/">홈</a> › 일본 골프채 가격 비교</nav>
<h1>일본 골프채 가격 비교: 일본 정가 vs 한국 정가</h1>
${updatedTag('2026-10-19')}
<p>원·엔 환율이 낮아지면서 "일본에서 사면 얼마나 쌀까?"를 궁금해하는 분이 많습니다. 이 페이지는 같은 모델의 <b>일본 제조사 정가</b>와 <b>한국 공식 수입사 정가</b>를 오늘 환율로 나란히 놓고 비교합니다. 정가는 모두 제조사·수입사 공식 페이지에서 확인한 값이며, 판매점 할인가는 넣지 않았습니다.</p>
${rateLine}
<h2>드라이버 5종 정가 비교 (한국이 더 비싼 순)</h2>
<div class="tablewrap"><table class="jp-t"><thead><tr><th>모델</th><th>일본 정가(세금 포함)</th><th>원화 환산</th><th>한국 정가</th><th>차이</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="note">정가 확인일 ${ymd(models.map((m) => m.checked).sort()[0])} · 실제 판매가는 정가보다 낮은 경우가 많습니다 · 모델마다 기준 샤프트가 다를 수 있어 각 모델 페이지의 '사양 차이'를 함께 보세요.</p>
<h2>정가 차이 = 직구로 아끼는 돈이 아닙니다</h2>
<p>일본 정가가 싸 보여도 직구하면 <b>국제 배송비</b>와 <b>관세·부가세</b>가 더해지고, 국내 A/S를 받지 못할 수 있습니다. 차이가 작은 모델은 국내 정식 제품이 오히려 나을 수 있습니다. 모델 페이지에서 배송비와 세금을 넣어 총비용을 직접 계산해 보세요.</p>
${warn}
<h2>더 보기</h2>
<ul class="guides"><li><a href="/jp/customs"><b>일본 골프채 직구 세금·통관 안내</b><span>관세청 공식 안내 모음</span></a></li><li><a href="/c/driver"><b>국내 드라이버 전체 비교</b><span>실력·가격대별 비교</span></a></li></ul>`,
    }),
  );
  urls.push('/jp');

  // ---------- 모델 페이지 ----------
  for (const m of models) {
    const g = gapOf(m);
    const rel = (m.related ?? []).filter(hasProduct);
    const body = `<nav class="crumb"><a href="/">홈</a> › <a href="/jp">일본 골프채 가격 비교</a> › ${esc(m.name)}</nav>
<h1>${esc(m.name)} 일본 가격 vs 한국 가격</h1>
${updatedTag('2026-10-19')}
<div class="hero"><p class="label">한국 정가와 일본 정가(원화 환산)의 차이</p><p class="big">${g ? vol(gapText(g)) : '비교할 수 없음'}</p>${rateLine}</div>
<h2>정가 비교</h2>
<div class="tablewrap"><table class="jp-t"><tbody>
<tr><th scope="row">일본 정가</th><td>${m.jpYen ? `<b>${yen(m.jpYen)}</b> (원화 약 ${vol(won(toWon(m.jpYen)))})` : '확인 못 함'}<br><small>${esc(m.jpSpec)}</small><br><small>출처: ${m.jpUrl ? ext('일본 공식 페이지', m.jpUrl) : '-'}</small></td></tr>
<tr><th scope="row">한국 정가</th><td>${m.krWon ? `<b>${won(m.krWon)}</b>` : '확인 못 함'}<br><small>${esc(m.krSpec)}</small><br><small>출처: ${m.krUrl ? ext(`${m.krImporter} 공식 페이지`, m.krUrl) : '-'}</small></td></tr>
</tbody></table></div>
<p class="note">정가 확인일 ${ymd(m.checked)} · 일본 이름: ${esc(m.jpName)}</p>
<h2>사양 차이</h2>
<p>${esc(m.diff)}</p>
<h2>직구하면 총 얼마? 직접 계산하기</h2>
<form class="jp-calc" data-rate="${rate}" onsubmit="return false">
<label>일본 구매가(엔) <input type="number" name="y" inputmode="numeric" value="${m.jpYen ?? ''}"></label>
<label>배송비·배송대행비(원) <input type="number" name="s" inputmode="numeric" placeholder="업체 견적을 넣으세요"></label>
<label>관세·부가세(원) <input type="number" name="t" inputmode="numeric" placeholder="관세청 예상세액 조회 결과"></label>
<p class="jp-sum">총비용: <b data-out>-</b>${m.krWon ? ` <small>(한국 정가 ${won(m.krWon)})</small>` : ''}</p>
</form>
<p class="note">세금은 이 사이트가 계산하지 않습니다. ${ext(CUSTOMS.calc[0], CUSTOMS.calc[1])}에서 확인해 넣으세요. 배송비는 업체·무게마다 달라 비워 두었습니다.</p>
${warn}
${rel.length ? `<h2>국내 정식 판매 제품 비교</h2><ul class="guides">${rel.map((id) => `<li><a href="/p/${id}"><b>${esc(productName(id))}</b><span>국내 판매가·특징 보기</span></a></li>`).join('')}</ul>` : ''}
<h2>더 보기</h2>
<ul class="guides"><li><a href="/jp"><b>일본 골프채 정가 비교 전체</b><span>드라이버 ${models.length}종</span></a></li><li><a href="/jp/customs"><b>직구 세금·통관 안내</b><span>관세청 공식 안내 모음</span></a></li><li><a href="/c/driver"><b>국내 드라이버 전체 비교</b><span>실력·가격대별 비교</span></a></li></ul>
<script>(()=>{const f=document.querySelector('.jp-calc');if(!f)return;const r=+f.dataset.rate,o=f.querySelector('[data-out]');const u=()=>{const y=+f.y.value||0,s=+f.s.value||0,t=+f.t.value||0;o.textContent=y?Math.round(y*r/100+s+t).toLocaleString('ko-KR')+'원':'-'};f.addEventListener('input',u);u()})();</script>`;
    writeText(
      join(OUT, 'jp', `${m.slug}.html`),
      layout({
        title: `${m.name} 일본 가격 vs 한국 가격: 정가 비교·직구 총비용`,
        desc: `${m.name}의 일본 제조사 정가${m.jpYen ? `(${yen(m.jpYen)})` : ''}와 한국 정가${m.krWon ? `(${won(m.krWon)})` : ''}를 환율로 비교하고, 배송비·세금을 더한 직구 총비용을 계산해 봅니다. 국내 A/S 주의점 포함.`,
        path: `/jp/${m.slug}`,
        ld: [crumbLd([['홈', '/'], ['일본 골프채 가격 비교', '/jp'], [m.name, `/jp/${m.slug}`]])],
        body,
      }),
    );
    urls.push(`/jp/${m.slug}`);
  }

  // ---------- 직구 세금·통관 안내 ----------
  const li = (k) => `<li>${ext(CUSTOMS[k][0], CUSTOMS[k][1])}</li>`;
  writeText(
    join(OUT, 'jp', 'customs.html'),
    layout({
      title: '일본 골프채 직구 세금·통관 안내 (관세청 공식 안내 모음)',
      desc: '일본에서 골프채를 직구할 때 확인할 면세 기준과 세금 계산 방법을 관세청 공식 안내 링크로 정리했습니다.',
      path: '/jp/customs',
      ld: [crumbLd([['홈', '/'], ['일본 골프채 가격 비교', '/jp'], ['직구 세금·통관 안내', '/jp/customs']])],
      body: `<nav class="crumb"><a href="/">홈</a> › <a href="/jp">일본 골프채 가격 비교</a> › 직구 세금·통관 안내</nav>
<h1>일본 골프채 직구 세금·통관 안내</h1>
${updatedTag('2026-10-19')}
<p>세금과 통관 규칙은 바뀔 수 있어 이 사이트가 직접 계산하지 않습니다. 아래 내용은 관세청 공식 안내의 요지이며, 정확한 금액과 최신 기준은 반드시 관세청에서 확인하세요.</p>
<section class="prose">
<h2>관세청 안내 요지</h2>
<ul>
<li>소액물품 면세 한도는 <b>물품가격 미화 150달러</b>입니다(목록통관 기준은 미국에서 보내는 물품만 200달러).</li>
<li>물품가격에는 물건값과 함께 <b>보내는 나라 안에서 붙는 세금·내륙 운임·보험료</b>가 포함됩니다.</li>
<li>물품가격이 <b>미화 150달러를 넘으면 관세·부가세가 부과</b>됩니다. 이 페이지에서 비교하는 드라이버는 모두 이 금액을 넘습니다.</li>
<li>내야 할 세금은 관세청 예상세액 조회에서 품목과 금액을 넣어 미리 볼 수 있습니다.</li>
</ul>
<h2>관세청 공식 안내</h2>
<ul>${li('calc')}${li('smallFree')}${li('listClear')}${li('express')}${li('simple')}</ul>
<p class="note">이 사이트는 세금을 줄이거나 피하는 방법을 안내하지 않습니다. 신고는 실제 구매 금액 그대로 해야 합니다.</p>
</section>
${warn}
<h2>더 보기</h2>
<ul class="guides"><li><a href="/jp"><b>일본 골프채 정가 비교</b><span>드라이버 ${models.length}종</span></a></li></ul>`,
    }),
  );
  urls.push('/jp/customs');
  return urls;
}
