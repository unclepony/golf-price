// 가격 이력 저장소: data/history/{상품ID}.json
// { id, points: [{ d: 'YYYY-MM-DD', low: 원, src: 'manual' | 'link' | 'api', n? }], latest? }
// - 덮어쓰지 않고 이력을 쌓는다. 같은 날짜·같은 출처의 기록만 새 값으로 바꾼다.
// - 출처(src): manual = prices.csv 로 직접 입력, link = 링크 생성 때 확인, api = 쿠팡 파트너스 API
// - latest(상품명·이미지·링크)는 API 공급자가 줄 때만 채운다.
import { join } from 'node:path';
import { readJson, writeJson, historyDir } from '../lib.mjs';

export const SOURCES = ['manual', 'link', 'api'];
const file = (id) => join(historyDir(false), `${id}.json`);

export function readHistory(id) {
  return readJson(file(id), { id, points: [] });
}

// rows: [{ id, d, price, src, n?, latest? }] → 상품별 이력에 추가. 반환: { added, replaced }
export function appendPoints(rows) {
  const byId = new Map();
  for (const r of rows) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
  let added = 0;
  let replaced = 0;
  for (const [id, rs] of byId) {
    const h = readHistory(id);
    for (const r of rs) {
      if (!SOURCES.includes(r.src)) throw new Error(`알 수 없는 가격 출처: ${r.src}`);
      const point = { d: r.d, low: r.price, src: r.src, ...(r.n ? { n: r.n } : {}) };
      const i = h.points.findIndex((p) => p.d === r.d && (p.src ?? 'api') === r.src);
      if (i >= 0) {
        if (h.points[i].low !== r.price) replaced++;
        h.points[i] = point;
      } else {
        h.points.push(point);
        added++;
      }
      if (r.latest) h.latest = r.latest;
    }
    h.points.sort((a, b) => a.d.localeCompare(b.d) || (a.src ?? '').localeCompare(b.src ?? ''));
    writeJson(file(id), h);
  }
  return { added, replaced };
}
