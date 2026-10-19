// /jp 섹션용 원/엔 환율: 유럽중앙은행(ECB) 일일 기준환율(EUR 기준 JPY·KRW)로 100엔당 원화를 계산해 config/jp-fx.json 에 저장한다.
// 키가 필요 없고 영업일마다 갱신된다. 받아 오지 못하면 기존 값을 그대로 두고 실패 코드로 끝낸다(빌드는 기존 값으로 진행).
// 사용: node src/jp-fx.mjs
import { join } from 'node:path';
import { ROOT, readJson, writeJson } from './lib.mjs';

const FILE = join(ROOT, 'config', 'jp-fx.json');
const URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

const xml = await fetch(URL).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))).catch((e) => {
  console.error(`환율을 받지 못했습니다: ${e.message} — 기존 값 유지`);
  process.exit(1);
});
const date = (xml.match(/time='(\d{4}-\d\d-\d\d)'/) ?? [])[1];
const rate = (c) => Number((xml.match(new RegExp(`currency='${c}' rate='([\\d.]+)'`)) ?? [])[1]);
const jpy = rate('JPY');
const krw = rate('KRW');
if (!date || !(jpy > 0) || !(krw > 0)) {
  console.error('환율 형식이 예상과 달라 저장하지 않습니다 — 기존 값 유지');
  process.exit(1);
}
const per100 = Math.round((krw / jpy) * 100 * 100) / 100;
const prev = readJson(FILE, {});
if (prev.date === date && prev.krwPer100Jpy === per100) {
  console.log(`환율 변동 없음: ${date} 100엔 = ${per100}원`);
  process.exit(0);
}
writeJson(FILE, {
  _설명: 'src/jp-fx.mjs 가 매일 갱신. 유럽중앙은행(ECB) 기준환율의 EUR/KRW ÷ EUR/JPY 로 계산한 100엔당 원화. 직접 고치지 않는다.',
  date,
  krwPer100Jpy: per100,
  source: 'ECB euro foreign exchange reference rates',
  sourceUrl: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
});
console.log(`환율 저장: ${date} 100엔 = ${per100}원`);
