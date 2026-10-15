// 미리보기용 샘플 가격 기록을 data-demo/history 에 만든다. (실제 가격 아님)
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { ROOT, loadConfig, historyDir, writeJson, todayKst } from './lib.mjs';

function rng(seed) {
  let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const config = loadConfig();
const dir = historyDir(true);
rmSync(join(ROOT, 'data-demo'), { recursive: true, force: true });
const DAYS = 120;

for (const p of config.products) {
  const r = rng(p.id);
  let price = p.ref * (1.02 + r() * 0.08);
  const points = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    price *= 1 + (r() - 0.52) * 0.012; // 완만한 하락 경향
    const sale = r() < 0.06 ? 1 - (0.04 + r() * 0.08) : 1; // 가끔 할인
    const low = Math.round((price * sale) / 100) * 100;
    points.push({ d: todayKst(-i), low, mall: ['쿠팡', 'G마켓', '11번가', 'SSG', '골프존마켓'][Math.floor(r() * 5)], n: 5 + Math.floor(r() * 30) });
  }
  writeJson(join(dir, `${p.id}.json`), { id: p.id, points });
}
console.log(`샘플 데이터 생성: ${config.products.length}개 상품 × ${DAYS}일`);
