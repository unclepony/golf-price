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
const OLD_SITE_HOSTS = new Set(['golfprice.unclepony.com', 'golf-price.pages.dev']); // 이전한 옛 주소(2026-10-22)
const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, '').replace(/\.html$/, '') : p) || '/';
const day = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 시간 날짜

// 유입 경로 판정 → { src: 큰 분류, kw: 검색어(넘어올 때만), url: 들어온 외부 페이지(호스트+경로) }
// - 브라우저는 보통 다른 사이트 주소를 '도메인까지만' 넘기므로 url 은 도메인만 남는 경우가 많다. 구글은 검색어를 넘기지 않는다(서치콘솔에서 확인)
// - 카카오톡·네이버 앱·인스타그램 등 앱 안 브라우저는 출처를 안 넘기는 경우가 많아, 출처가 없으면 브라우저 정보로 앱을 알아본다
// - 주소에 utm_source 가 있으면(직접 만든 공유 링크) 그것을 우선한다
const ENGINES = [
  [/gemini\.google\.com$/, 'Gemini'], [/(^|\.)google\./, '구글', 'q'], [/naver\.com$/, '네이버', 'query'], [/(daum\.net|kakao\.com)$/, '다음·카카오', 'q'],
  [/bing\.com$/, '빙', 'q'], [/(chatgpt\.com|openai\.com)$/, 'ChatGPT'], [/perplexity\.ai$/, 'Perplexity'], [/claude\.ai$/, 'Claude'],
  [/(youtube\.com|youtu\.be)$/, '유튜브'], [/(instagram\.com)$/, '인스타그램'], [/(facebook\.com|fb\.com)$/, '페이스북'], [/threads\.(net|com)$/, '스레드'],
  [/(x\.com|t\.co|twitter\.com)$/, 'X(트위터)'], [/duckduckgo\.com$/, 'DuckDuckGo', 'q'], [/yahoo\./, '야후', 'p'], [/zum\.com$/, '줌', 'query'],
];
const APPS = [ // 출처가 비었을 때 브라우저 정보로 판정
  [/KAKAOTALK/i, '카카오톡'], [/NAVER\(inapp|NAVER\//, '네이버 앱'], [/DaumApps/i, '다음 앱'], [/Instagram/i, '인스타그램'],
  [/FBAN|FBAV/i, '페이스북'], [/Line\//, '라인'], [/Band\//i, '밴드'], [/GSA\//, '구글 앱'],
];
const ANDROID_APPS = { 'com.google.android.googlequicksearchbox': '구글 앱', 'com.google.android.gm': 'Gmail', 'com.kakao.talk': '카카오톡', 'com.nhn.android.search': '네이버 앱', 'com.instagram.android': '인스타그램' };

function source(ref, host, ua, qs) {
  const utm = new URLSearchParams(qs || '');
  if (utm.get('utm_source')) {
    const camp = ['utm_source', 'utm_medium', 'utm_campaign'].map((k) => utm.get(k)).filter(Boolean).join(' / ').slice(0, 80);
    return { src: `캠페인: ${utm.get('utm_source').slice(0, 30)}`, url: camp };
  }
  if (!ref) {
    for (const [re, name] of APPS) if (re.test(ua)) return { src: name };
    return { src: '직접·북마크' };
  }
  let u;
  try { u = new URL(ref); } catch { return { src: '기타' }; }
  if (u.protocol === 'android-app:') return { src: ANDROID_APPS[u.hostname] ?? `앱: ${u.hostname.slice(0, 40)}` };
  const h = u.hostname.replace(/^(www|m)\./, '');
  if (h === host || OLD_SITE_HOSTS.has(h)) return { src: '' }; // 옛 주소에서 301 로 넘어온 경우도 사이트 안 이동
  const url = (h + (u.pathname.length > 1 ? u.pathname : '')).slice(0, 120);
  for (const [re, name, qk] of ENGINES) {
    if (re.test(h)) {
      const kw = qk ? (u.searchParams.get(qk) ?? '').trim().slice(0, 60) : '';
      return { src: name, kw, url: qk ? '' : url };
    }
  }
  return { src: h.slice(0, 60), url };
}
function device(ua) {
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) return '태블릿';
  if (/Mobi|iPhone|Android/i.test(ua)) return '모바일';
  return 'PC';
}

// 사람이 아닌 방문·우리 방문은 통계에서 빼고 'skip'(이유별)으로만 센다.
// 2026-10-19: 유튜브·구글 링크 검사기가 영상·프로필 링크마다 2번씩 들어와 유입을 부풀린 것을 확인(비공개 영상 링크도 2번).
// - 데이터센터(클라우드) 망에서 온 방문: 링크 검사기·크롤러·서버 — 사람은 집·회사·휴대폰 망에서 온다
// - 내부 방문: /admin 에 로그인한 브라우저에 붙는 쿠키(upi_internal=1)가 있으면 사장님·관리자 방문
const DC_ASN = new Set([15169, 396982, 19527, 36040, 16509, 14618, 8075, 8068, 14061, 16276, 24940, 63949, 45102, 37963, 132203, 31898, 20473, 9009, 51167, 60781, 16265, 32934, 54113, 202425, 212238, 46606, 40021, 35916, 62567, 136907, 55990, 45090]);
function skipReason(request) {
  if (/(?:^|;\s*)upi_internal=1(?:;|$)/.test(request.headers.get('cookie') ?? '')) return '내부(관리자 브라우저)';
  const asn = request.cf?.asn;
  if (asn && DC_ASN.has(asn)) return `데이터센터 AS${asn} ${String(request.cf?.asOrganization ?? '').slice(0, 30)}`.trim();
  return '';
}

export async function onRequestPost({ request, env, waitUntil }) {
  const done = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (!env.CLICKS) return done;
  const url = new URL(request.url);
  const h = request.headers;
  const ua = h.get('user-agent') ?? '';
  const origin = h.get('origin');
  if ((origin && new URL(origin).host !== url.host) || BOT.test(ua)) return done;
  const skip = skipReason(request);
  if (skip) {
    const sb = await request.json().catch(() => null);
    if (sb?.t === 'pv' && sb.v) waitUntil(env.CLICKS.prepare('INSERT INTO stats (day, kind, k, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, kind, k) DO UPDATE SET n = n + 1').bind(day(), 'skip', skip).run().catch(() => {}));
    return done;
  }
  const raw = await request.text();
  if (raw.length > 3000) return done;
  let b;
  try { b = JSON.parse(raw); } catch { return done; }
  await tables(env, url);
  const path = norm(String(b.p ?? '').slice(0, 200));
  if (!PATHS.has(path)) return done;

  const host = url.hostname.replace(/^www\./, '');
  // 이 방문의 유입 경로: 첫 페이지의 출처·주소 조건을 브라우저 탭이 기억했다가 매 신호에 함께 보낸다(sessionStorage, 서버에 사용자 ID 없음)
  const s = source(String(b.r ?? ''), host, ua, String(b.q ?? '').slice(0, 300));
  const src = s.src || '직접·북마크';
  // 외부 유입 여부(2026-10-22 사장님: 실제 외부 유입만 보고 싶다) — 직접·북마크·카카오톡(지인)·제휴사 관리 화면·운영 페이지에서 온 것은 외부가 아님
  const ext = !/^(직접·북마크|카카오톡)$/.test(src) && !/linkprice.com|ops.unclepony.com/.test(src);
  const d = day();
  const rows = [];
  if (b.t === 'pv') {
    rows.push(['pv', path]);
    if (ext) rows.push(['xpv', path]); // 외부 유입 페이지뷰
    if (b.v) {
      rows.push(['visit', path], ['ref', src], ['refland', `${src}|${path}`], ['dev', device(ua)], ['cty', String(request.cf?.country ?? '??').slice(0, 4)]);
      // 통과한 방문의 네트워크(ASN)·시간대 — 유튜브 링크마다 하루 2번씩 들어오는 방문이 사람인지 검사기인지 망으로 가린다(2026-10-23 관제탑, youtubeking 과 같은 형식, 개인 식별 정보 아님)
      if (request.cf?.asn) rows.push(['asn', `AS${request.cf.asn} ${String(request.cf?.asOrganization ?? '').slice(0, 30)}`.trim()]);
      rows.push(['hour', new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 13)]);
      if (s.kw) rows.push(['kw', `${src}|${s.kw}`]);
      if (s.url) rows.push(['refurl', s.url]);
    } else if (b.f) {
      // 사이트 안 이동: 앞 페이지|이 페이지 (둘 다 사이트맵 경로일 때만)
      const prev = norm(String(b.f).slice(0, 200));
      if (PATHS.has(prev) && prev !== path) rows.push(['nav', `${prev}|${path}`]);
    }
  } else if (b.t === 'out') {
    const href = String(b.h ?? '');
    const id = HREF2ID.get(href) ?? /^\/go\/([\w-]+)/.exec(href)?.[1] ?? '(알 수 없음)';
    if (s.url && src.startsWith('캠페인')) rows.push(['outcamp', `${s.url}|${id}`.slice(0, 160)]); // 영상(utm_campaign)별 쿠팡 클릭
    // 클릭 전에 사람 조작(마우스·터치·키)이 있었나(2026-10-24) — '조작 없이'는 프로그램이 누른 클릭(AI 에이전트·자동화)일 가능성. 키: 조작 여부|유입 경로
    rows.push(['outact', `${b.a === 1 ? '조작 후' : b.a === 0 ? '조작 없이' : '알 수 없음'}|${src}`]);
    rows.push(['out', `${path}|${id}`], ['outref', src], ['pos', String(b.w ?? '기타').replace(/[^\p{L}\p{N} ·]/gu, '').slice(0, 20) || '기타']);
  } else if (b.t === 'aff') {
    // 쿠팡 외 제휴 링크 클릭(예: agoda-tokyo) — 쿠팡 클릭(out)과 따로 센다
    const k = String(b.k ?? '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!k) return done;
    rows.push(['aff', `${path}|${k}`], ['affref', src]);
  } else if (b.t === 'seen') {
    // 쿠팡 버튼이 화면에 처음 보인 페이지뷰(페이지당 1회) — 키: 페이지, 그리고 처음 보인 버튼 위치
    rows.push(['seen', path], ['seenpos', String(b.w ?? '기타').replace(/[^\p{L}\p{N} ·]/gu, '').slice(0, 20) || '기타']);
    // 유입 경로별 '버튼 봄'(2026-10-26) — outref 와 견주면 경로별 '버튼 본 뒤 클릭률'(예: ChatGPT vs 유튜브)이 나온다
    rows.push(['seenref', src]);
  } else if (b.t === 'eng') {
    // 페이지를 떠날 때 한 번: 내려간 깊이·머문 시간 구간(정해진 이름만) — 키: 페이지|구간
    const D = ['첫 화면', '25%', '50%', '75%', '끝까지'], S = ['10초 미만', '10~30초', '30초~1분', '1~3분', '3분 이상'];
    if (D.includes(b.d)) rows.push(['depth', `${path}|${b.d}`]);
    if (S.includes(b.s)) rows.push(['stay', `${path}|${b.s}`]);
    if (!rows.length) return done;
  } else if (b.t === 'act') {
    // 페이지뷰에서 사람이 처음 조작했을 때 한 번(2026-10-23) — 키: 유입 경로|페이지. 같은 키의 pv 와 견주면 '조작 없이 열기만 한' 비율이 나온다
    rows.push(['act', `${src}|${path}`]);
  } else return done;

  const sql = 'INSERT INTO stats (day, kind, k, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, kind, k) DO UPDATE SET n = n + 1';
  waitUntil(env.CLICKS.batch(rows.map(([kind, k]) => env.CLICKS.prepare(sql).bind(d, kind, k))).catch(() => {}));
  return done;
}
