// /admin/data?days=N — 모니터링 페이지가 읽는 집계 JSON (잠금: _middleware.js)
const kst = (offset = 0) => new Date(Date.now() + 9 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);

export async function onRequestGet({ request, env }) {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  if (!env.CLICKS) return json({ error: 'D1 바인딩 CLICKS 가 없습니다. README 의 D1 준비를 먼저 하세요.' }, 503);
  const url = new URL(request.url);
  // ?day=YYYY-MM-DD 이면 그 하루만 (매일 분석 자료 저장용: src/stats-save.mjs)
  const one = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : null;
  const days = one ? 1 : Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '7', 10) || 7, 1), 365);
  const from = one ?? kst(-(days - 1)), to = one ?? kst();
  const shift = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
  const prevFrom = shift(from, -days), prevTo = shift(from, -1);
  const all = async (sql, ...p) => (await env.CLICKS.prepare(sql).bind(...p).all()).results;
  try {
    const [daily, rows, prev] = await Promise.all([
      all("SELECT day, kind, SUM(n) AS n FROM stats WHERE day BETWEEN ?1 AND ?2 AND kind IN ('pv','visit','out') GROUP BY day, kind", from, to),
      all('SELECT kind, k, SUM(n) AS n FROM stats WHERE day BETWEEN ?1 AND ?2 GROUP BY kind, k', from, to),
      all("SELECT kind, SUM(n) AS n FROM stats WHERE day BETWEEN ?1 AND ?2 AND kind IN ('pv','visit','out') GROUP BY kind", prevFrom, prevTo),
    ]);
    const names = await env.ASSETS.fetch(new URL('/assets/search.json', url)).then((r) => r.json()).catch(() => ({ products: [], guides: [] }));
    return json({
      from, to, days,
      daily, rows, prev,
      products: Object.fromEntries(names.products.map((p) => [p.id, p.n])),
      pages: Object.fromEntries([['/', '홈'], ['/about', '운영 안내'], ...names.products.map((p) => [p.u, p.n]), ...names.guides.map((g) => [g.u, g.t])]),
    });
  } catch (e) {
    return json({ error: `D1 조회 실패: ${e.message}. migrations/0002_stats.sql 을 D1 콘솔에서 실행했는지 확인하세요.` }, 500);
  }
}
