// 실시간 베스트 /api/best — 사람들이 많이 본 상품 순위 (Cloudflare Pages Functions, D1 바인딩 CLICKS)
// 기준: 오늘(한국 시간) 상품 페이지(/p/{id}) 페이지뷰 합계. 오늘 자료가 적으면(상품 8개 미만) 최근 3일 합계를 쓴다.
// 개인정보 없음(하루 합계 표만 읽음). 5분 캐시. 쿠팡에는 요청하지 않는다.
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10);

export async function onRequestGet({ env }) {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  if (!env.CLICKS) return json({ items: [], span: 'none' });
  const q = (from) =>
    env.CLICKS.prepare("SELECT k, SUM(n) AS n FROM stats WHERE kind = 'pv' AND k LIKE '/p/%' AND day >= ?1 GROUP BY k ORDER BY n DESC LIMIT 40").bind(from).all();
  let span = 'today';
  let { results } = await q(kst());
  if ((results?.length ?? 0) < 8) {
    span = '3days';
    ({ results } = await q(kst(-2)));
  }
  return json({ span, at: new Date().toISOString(), items: (results ?? []).map((r) => ({ id: r.k.slice(3), n: r.n })) });
}
