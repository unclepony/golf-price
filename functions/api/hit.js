// 방문·쿠팡 클릭 집계 /api/hit — Cloudflare Pages Functions (D1 바인딩 이름 CLICKS)
// 사이트 스크립트(assets/app.js)가 navigator.sendBeacon 으로 보낸다. 쿠팡 링크 자체는 바꾸지 않는다(사용자는 파트너스 링크로 바로 이동).
// - 저장: 날짜·종류·키·횟수 합계만 (migrations/0002_stats.sql). IP·쿠키·브라우저 정보·사용자 ID 는 저장하지 않는다
// - 사이트맵에 없는 경로·다른 사이트에서 온 요청·검색 로봇은 세지 않는다
// - 이 함수는 쿠팡에 어떤 요청도 보내지 않는다
const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|facebookexternalhit|embedly|python|curl|wget|httpclient/i;
let PATHS = null; // 사이트맵의 경로
let HREF2ID = null; // 쿠팡 링크 → 상품ID (assets/go.json 을 뒤집음)

async function tables(env, url) {
  if (!PATHS) {
    const xml = await env.ASSETS.fetch(new URL('/sitemap.xml', url)).then((r) => (r.ok ? r.text() : '')).catch(() => '');
    PATHS = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => norm(new URL(m[1]).pathname)));
    const go = await env.ASSETS.fetch(new URL('/assets/go.json', url)).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    HREF2ID = new Map(Object.entries(go).map(([id, href]) => [href, id]));
  }
}
const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, '').replace(/\.html$/, '') : p) || '/';
const day = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 시간 날짜

function source(ref, host) {
  if (!ref) return '직접·북마크';
  let h;
  try { h = new URL(ref).hostname.replace(/^www\.|^m\./, ''); } catch { return '기타'; }
  if (h === host) return '';
  const known = [
    [/(^|\.)google\./, '구글'], [/naver\.com$/, '네이버'], [/(daum\.net|kakao\.com)$/, '다음·카카오'], [/bing\.com$/, '빙'],
    [/(chatgpt\.com|openai\.com)$/, 'ChatGPT'], [/perplexity\.ai$/, 'Perplexity'], [/(claude\.ai)$/, 'Claude'], [/gemini\.google\.com$/, 'Gemini'],
    [/(youtube\.com|youtu\.be)$/, '유튜브'], [/(instagram\.com|facebook\.com|threads\.net|x\.com|t\.co)$/, 'SNS'], [/duckduckgo\.com$/, 'DuckDuckGo'], [/yahoo\./, '야후'],
  ];
  for (const [re, name] of known) if (re.test(h)) return name;
  return h.slice(0, 60);
}
function device(ua) {
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) return '태블릿';
  if (/Mobi|iPhone|Android/i.test(ua)) return '모바일';
  return 'PC';
}

export async function onRequestPost({ request, env, waitUntil }) {
  const done = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (!env.CLICKS) return done;
  const url = new URL(request.url);
  const h = request.headers;
  const origin = h.get('origin');
  if ((origin && new URL(origin).host !== url.host) || BOT.test(h.get('user-agent') ?? '')) return done;
  const raw = await request.text();
  if (raw.length > 2000) return done;
  let b;
  try { b = JSON.parse(raw); } catch { return done; }
  await tables(env, url);
  const path = norm(String(b.p ?? '').slice(0, 200));
  if (!PATHS.has(path)) return done;

  const d = day();
  const rows = [];
  if (b.t === 'pv') {
    rows.push(['pv', path]);
    if (b.v) {
      const src = source(String(b.r ?? ''), url.hostname.replace(/^www\./, ''));
      rows.push(['visit', path], ['ref', src || '직접·북마크'], ['dev', device(h.get('user-agent') ?? '')], ['cty', String(request.cf?.country ?? '??').slice(0, 4)]);
    }
  } else if (b.t === 'out') {
    const href = String(b.h ?? '');
    const id = HREF2ID.get(href) ?? /^\/go\/([\w-]+)/.exec(href)?.[1] ?? '(알 수 없음)';
    rows.push(['out', `${path}|${id}`], ['pos', String(b.w ?? '기타').replace(/[^\p{L}\p{N} ·]/gu, '').slice(0, 20) || '기타']);
  } else return done;

  const sql = 'INSERT INTO stats (day, kind, k, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, kind, k) DO UPDATE SET n = n + 1';
  waitUntil(env.CLICKS.batch(rows.map(([kind, k]) => env.CLICKS.prepare(sql).bind(d, kind, k))).catch(() => {}));
  return done;
}
