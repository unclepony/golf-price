// /admin 이하 잠금 (HTTP Basic 인증) — 비밀번호는 Cloudflare Pages 환경변수 ADMIN_PASS(암호화 Secret)에만 둔다. 저장소·코드에 넣지 않는다.
// ADMIN_PASS 가 없으면 /admin 은 아예 없는 페이지(404)처럼 보인다. 사용자 이름은 아무거나 넣어도 된다.
const enc = new TextEncoder();
async function same(a, b) {
  // 길이·내용이 달라도 걸리는 시간이 같도록 해시끼리 비교
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  if (!env.ADMIN_PASS) return new Response('Not found', { status: 404 });
  const m = /^Basic\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  let pass = '';
  try { pass = m ? atob(m[1]).split(':').slice(1).join(':') : ''; } catch {}
  if (!(await same(pass, env.ADMIN_PASS))) {
    await new Promise((r) => setTimeout(r, 800)); // 무차별 대입을 느리게
    return new Response('로그인이 필요합니다', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="golf-price admin", charset="UTF-8"', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Referrer-Policy', 'no-referrer');
  return out;
}
