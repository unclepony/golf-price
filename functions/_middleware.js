// 옛 주소(golf-price.pages.dev) → 새 주소(golfprice.unclepony.com) 영구 이동(301). 경로·쿼리는 그대로 넘긴다.
// 미리보기 배포(<해시>.golf-price.pages.dev)는 이동하지 않는다. 검색 순위는 301 로 새 주소에 넘어간다 — 이 파일은 지우지 않는다.
const OLD_HOST = 'golf-price.pages.dev';
const NEW_ORIGIN = 'https://golfprice.unclepony.com';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === OLD_HOST) {
    return new Response(null, { status: 301, headers: { Location: NEW_ORIGIN + url.pathname + url.search, 'Cache-Control': 'public, max-age=86400' } });
  }
  return next();
}
