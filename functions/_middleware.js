// 옛 주소 → 새 주소 영구 이동(301). 경로·쿼리는 그대로 넘긴다. 검색 순위는 301 로 새 주소에 넘어간다 — 이 파일은 지우지 않는다.
// - golf-price.pages.dev(첫 주소) → 2026-10-17 golfprice.unclepony.com → 2026-10-22 choicegolf.unclepony.com(이름 초이스골프로 변경)
// - 옛 주소 두 곳 모두 새 주소로 한 번에(301 한 번) 보낸다. 미리보기 배포(<해시>.golf-price.pages.dev)는 이동하지 않는다.
const OLD_HOSTS = new Set(['golf-price.pages.dev', 'golfprice.unclepony.com']);
const NEW_ORIGIN = 'https://choicegolf.unclepony.com';

// AI·검색 로봇이 읽어 간 쪽 기록(2026-11-19 관제탑, 수익 방안 5번): ChatGPT 손님이 어느 쪽으로 오는지는 알지만
// ChatGPT 가 어느 쪽을 읽어 가는지는 몰랐다. stats 표에 kind='bot', k='로봇|경로' 로 하루 합계만 쌓는다(IP·개인 정보 없음).
// - ChatGPT-User = 손님 질문에 답하려고 그때 읽는 것, OAI-SearchBot = ChatGPT 검색 색인, bingbot = Bing 색인
// - 글(HTML) 쪽과 llms.txt·sitemap.xml·robots.txt 만 센다. 기록은 응답 뒤에 하고, 실패해도 응답에는 영향이 없다.
const BOTS = [['ChatGPT-User', /ChatGPT-User/i], ['OAI-SearchBot', /OAI-SearchBot/i], ['GPTBot', /GPTBot/i], ['bingbot', /bingbot/i], ['PerplexityBot', /PerplexityBot/i], ['Perplexity-User', /Perplexity-User/i], ['ClaudeBot', /ClaudeBot/i], ['Claude-User', /Claude-User/i], ['Claude-SearchBot', /Claude-SearchBot/i], ['Googlebot', /Googlebot/i], ['Yeti', /Yeti/i]];
const BOT_PATH = /^\/(|about|qa(\/[\w-]+)?|jp(\/[\w-]+)*|[cgp]\/[\w-]+|vs\/[\w-]+|llms\.txt|sitemap\.xml|sitemap-products\.xml|robots\.txt)$/;
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export async function onRequest({ request, next, env, waitUntil }) {
  const url = new URL(request.url);
  if (OLD_HOSTS.has(url.hostname)) {
    return new Response(null, { status: 301, headers: { Location: NEW_ORIGIN + url.pathname + url.search, 'Cache-Control': 'public, max-age=86400' } });
  }
  try {
    if (env?.CLICKS && request.method === 'GET') {
      const ua = request.headers.get('user-agent') ?? '';
      const bot = BOTS.find(([, re]) => re.test(ua))?.[0];
      const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
      if (bot && BOT_PATH.test(path)) {
        waitUntil(env.CLICKS.prepare('INSERT INTO stats (day, kind, k, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, kind, k) DO UPDATE SET n = n + 1').bind(kstDay(), 'bot', `${bot}|${path}`.slice(0, 200)).run().catch(() => {}));
      }
    }
  } catch { /* 기록 실패는 무시 */ }
  return next();
}
