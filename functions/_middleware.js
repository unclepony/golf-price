// 옛 주소 → 새 주소 영구 이동(301). 경로·쿼리는 그대로 넘긴다. 검색 순위는 301 로 새 주소에 넘어간다 — 이 파일은 지우지 않는다.
// - golf-price.pages.dev(첫 주소) → 2026-10-17 golfprice.unclepony.com → 2026-10-22 choicegolf.unclepony.com(이름 초이스골프로 변경)
// - 옛 주소 두 곳 모두 새 주소로 한 번에(301 한 번) 보낸다. 미리보기 배포(<해시>.golf-price.pages.dev)는 이동하지 않는다.
const OLD_HOSTS = new Set(['golf-price.pages.dev', 'golfprice.unclepony.com']);
const NEW_ORIGIN = 'https://choicegolf.unclepony.com';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (OLD_HOSTS.has(url.hostname)) {
    return new Response(null, { status: 301, headers: { Location: NEW_ORIGIN + url.pathname + url.search, 'Cache-Control': 'public, max-age=86400' } });
  }
  return next();
}
