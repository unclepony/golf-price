// 서치콘솔 서비스 계정 인증 (사람 구글 계정·비밀번호를 쓰지 않는다)
// 환경변수 GSC_SERVICE_ACCOUNT 에 서비스 계정 JSON 키 전체가 들어 있어야 한다 (GitHub Secrets 또는 .env — 저장소에 올리지 않는다).
// 이 계정은 서치콘솔에서 golf-price 속성 하나에만 사용자로 추가하므로, 다른 구글 데이터에는 접근할 수 없다.
import { createSign } from 'node:crypto';

export const READONLY = 'https://www.googleapis.com/auth/webmasters.readonly';
export const FULL = 'https://www.googleapis.com/auth/webmasters';

export function serviceAccount() {
  const raw = process.env.GSC_SERVICE_ACCOUNT;
  if (!raw || !process.env.GSC_SITE) return null;
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error('GSC_SERVICE_ACCOUNT 에 client_email·private_key 가 없습니다');
  return sa;
}

export async function accessToken(sa, scope = READONLY) {
  const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`서치콘솔 인증 실패: ${body.error ?? res.status} ${body.error_description ?? ''}`.trim()); // 키 내용은 로그에 남기지 않는다
  return body.access_token;
}
