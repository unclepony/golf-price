// git 기록으로 날짜를 찍는다 (node src/stamp-dates.mjs). 커밋한 뒤 실행하고, 바뀐 config 를 다시 커밋한다.
// - picks.json  checked: 그 상품의 쿠팡 판매가를 처음 확인(링크 생성)한 날 — 판매가가 바뀌면 그 날로 갱신
// (콘텐츠 업데이트일은 build.mjs 가 본문 지문으로 config/content-state.json 에 관리한다. guides·products 의 updated 는 처음 기록할 때의 씨앗으로만 쓰인다)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] });
const C = (f) => join(ROOT, 'config', f);
const FILES = ['picks.json', 'guides.json', 'products.json', 'links.json'];
const STRIP = (o) => {
  if (!o || typeof o !== 'object') return o;
  const { checked, updated, ...rest } = o;
  return rest;
};

// 오래된 커밋부터 각 파일 상태를 읽어, 항목별로 내용이 바뀐 날짜를 기록한다
const commits = git('log', '--reverse', '--format=%H %ad', '--date=short', '--', ...FILES.map((f) => `config/${f}`))
  .trim()
  .split('\n')
  .map((l) => l.split(' '));
const prev = {}; // key → 직렬화된 내용
const changed = {}; // key → 마지막 변경일
const priceSince = {}; // 상품 id → 현재 판매가를 처음 본 날
const show = (h, f) => {
  try {
    return JSON.parse(git('show', `${h}:config/${f}`));
  } catch {
    return null;
  }
};
const touch = (key, val, d) => {
  const s = JSON.stringify(val);
  if (prev[key] !== s) {
    prev[key] = s;
    changed[key] = d;
  }
};
for (const [h, d] of commits) {
  const picks = show(h, 'picks.json') ?? {};
  for (const [id, v] of Object.entries(picks)) {
    touch(`pick:${id}`, STRIP(v), d);
    if (priceSince[id]?.price !== v.price) priceSince[id] = { price: v.price, d };
  }
  for (const [id, v] of Object.entries(show(h, 'links.json') ?? {})) touch(`link:${id}`, v, d);
  for (const p of show(h, 'products.json')?.products ?? []) touch(`prod:${p.id}`, STRIP(p), d);
  for (const g of show(h, 'guides.json')?.guides ?? []) {
    touch(`guide:${g.slug}`, STRIP(g), d);
    for (const pk of g.picks ?? []) touch(`gp:${g.slug}:${pk.id}`, pk, d);
  }
}

const max = (...ds) => ds.filter(Boolean).sort().at(-1);
const picks = JSON.parse(readFileSync(C('picks.json'), 'utf8'));
for (const [id, v] of Object.entries(picks)) if (priceSince[id] && priceSince[id].price === v.price) v.checked = priceSince[id].d;
writeFileSync(C('picks.json'), JSON.stringify(picks, null, 2) + '\n');

const guides = JSON.parse(readFileSync(C('guides.json'), 'utf8'));
for (const g of guides.guides) if (changed[`guide:${g.slug}`]) g.updated = changed[`guide:${g.slug}`];
writeFileSync(C('guides.json'), JSON.stringify(guides, null, 2) + '\n');

const products = JSON.parse(readFileSync(C('products.json'), 'utf8'));
for (const p of products.products) {
  const gps = Object.keys(changed).filter((k) => k.startsWith('gp:') && k.endsWith(`:${p.id}`)).map((k) => changed[k]);
  const d = max(changed[`prod:${p.id}`], changed[`pick:${p.id}`], changed[`link:${p.id}`], ...gps);
  if (d) p.updated = d;
}
writeFileSync(C('products.json'), JSON.stringify(products, null, 2) + '\n');

const count = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
console.log('판매가 확인일', count(Object.values(picks).map((v) => v.checked)));
console.log('가이드 업데이트', count(guides.guides.map((g) => g.updated)));
console.log('상품 업데이트', count(products.products.map((p) => p.updated)));
