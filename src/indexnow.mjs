// IndexNow 전송 (node src/indexnow.mjs): config/content-state.json 의 대기열(pending)만 보낸다.
// 대기열에는 콘텐츠 지문이 바뀐 페이지·새 페이지·삭제된 페이지만 들어간다 (가격만 바뀐 페이지는 들어가지 않음).
// 키 파일은 빌드가 site/{indexNowKey}.txt 로 만든다. 사이트가 배포된 뒤에 실행해야 한다.
// IndexNow 는 Bing·네이버 등이 참여하며, 구글은 사이트맵(lastmod)으로 알린다.
import { join } from 'node:path';
import { ROOT, readJson, writeJson } from './lib.mjs';

const SITE_URL = (process.env.SITE_URL || 'https://golfprice.unclepony.com').replace(/\/$/, '');
const site = readJson(join(ROOT, 'config', 'site.json'), {});
const stateFile = join(ROOT, 'config', 'content-state.json');
const state = readJson(stateFile, null);
const key = site.indexNowKey;
if (!key || !state?.pending?.length) {
  console.log(key ? 'IndexNow: 보낼 주소 없음' : 'IndexNow: config/site.json 에 indexNowKey 가 없습니다');
  process.exit(0);
}
const urlList = [...new Set(state.pending.map((x) => SITE_URL + x.url))].slice(0, 10000);
const kinds = state.pending.reduce((m, x) => ((m[x.kind] = (m[x.kind] ?? 0) + 1), m), {});
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE_URL).host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList }),
});
console.log(`IndexNow 응답 ${res.status}: ${urlList.length}개 전송 ${JSON.stringify(kinds)}`);
if (res.ok) {
  state.pending = [];
  writeJson(stateFile, state);
} else {
  console.error(await res.text().catch(() => ''));
  process.exit(1);
}
