// 쿠팡 이동 링크 /go/{상품ID} — Cloudflare Pages Functions
// 상품ID별 클릭 수를 D1(바인딩 이름 CLICKS)에 하루 단위로 세고, 쿠팡 파트너스 링크로 302 이동한다.
// - 개인정보(IP·브라우저 정보·쿠키)는 저장하지 않는다. 저장하는 것: 날짜, 상품ID, 클릭한 이 사이트의 페이지 경로, 횟수
// - 기록은 응답을 보낸 뒤(waitUntil) 해서 이동이 늦어지지 않는다. D1 이 연결되지 않았으면 기록 없이 이동만 한다
// - 검색 로봇·미리 불러오기(prefetch) 요청은 세지 않는다
// - 이 함수는 쿠팡(link.coupang.com)에 요청을 보내지 않는다. 브라우저가 Location 으로 직접 이동한다
let LINKS = null;
const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|facebookexternalhit|embedly/i;

export async function onRequestGet({ params, env, request, waitUntil }) {
  if (!LINKS) {
    LINKS = await env.ASSETS.fetch(new URL('/assets/go.json', request.url))
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  const id = String(params.id ?? '');
  const to = LINKS[id];
  if (!to) return Response.redirect(new URL(`/p/${encodeURIComponent(id)}`, request.url).toString(), 302);

  const h = request.headers;
  const isPrefetch = /prefetch|prerender/i.test(`${h.get('sec-purpose') ?? ''} ${h.get('purpose') ?? ''}`);
  if (env.CLICKS && !isPrefetch && !BOT.test(h.get('user-agent') ?? '')) {
    let from = '';
    try {
      const ref = new URL(h.get('referer') ?? '');
      if (ref.host === new URL(request.url).host) from = ref.pathname.slice(0, 120);
    } catch {}
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 시간 날짜
    waitUntil(
      env.CLICKS.prepare('INSERT INTO clicks (day, pid, page, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, pid, page) DO UPDATE SET n = n + 1')
        .bind(day, id, from)
        .run()
        .catch(() => {}),
    );
  }
  return new Response(null, {
    status: 302,
    headers: { Location: to, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
