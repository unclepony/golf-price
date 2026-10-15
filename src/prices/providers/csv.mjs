// 가격 공급자: CSV (지금 쓰는 방식)
// prices.csv 형식: 상품ID,가격,확인일   (첫 줄 머리글, # 으로 시작하는 줄은 주석)
// 예: ping-g440-driver,689000,2026-10-20   (가격에 쉼표·'원'을 쓰려면 "689,000원" 처럼 따옴표로 감싼다)
import { readFileSync, existsSync } from 'node:fs';
import { todayKst } from '../../lib.mjs';

export const name = 'csv';

function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// 반환: { rows: [{ id, price, d, src: 'manual' }], errors: ['N행: ...'] }
export function read(path, products) {
  if (!existsSync(path)) return { rows: [], errors: [`파일이 없습니다: ${path}`] };
  const ids = new Set(products.map((p) => p.id));
  const today = todayKst();
  const rows = [];
  const errors = [];
  const lines = readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  let header = false;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const no = i + 1;
    if (!line || line.startsWith('#')) return;
    const [id, priceRaw, d, ...rest] = splitCsv(line);
    if (!header && /상품|^id$/i.test(id) && !ids.has(id)) {
      header = true;
      return;
    }
    if (rest.some((x) => x)) return errors.push(`${no}행: 칸이 3개보다 많습니다 (가격의 쉼표는 따옴표로 감싸세요)`);
    if (!ids.has(id)) return errors.push(`${no}행: 없는 상품ID "${id}"`);
    if (!priceRaw && !d) return; // 가격을 아직 안 채운 줄(템플릿)은 건너뛴다
    const price = Number(String(priceRaw ?? '').replace(/[,원\s]/g, ''));
    if (!Number.isInteger(price) || price < 1000 || price > 50_000_000) return errors.push(`${no}행: 가격 형식 오류 "${priceRaw ?? ''}" (원 단위 정수)`);
    if (!/^\d{4}-\d\d-\d\d$/.test(d ?? '') || Number.isNaN(Date.parse(d))) return errors.push(`${no}행: 확인일 형식 오류 "${d ?? ''}" (YYYY-MM-DD)`);
    if (d > today) return errors.push(`${no}행: 확인일이 미래입니다 "${d}"`);
    if (rows.some((r) => r.id === id && r.d === d)) return errors.push(`${no}행: 같은 상품·같은 날짜가 두 번 있습니다 "${id} ${d}"`);
    rows.push({ id, price, d, src: 'manual' });
  });
  return { rows, errors };
}
