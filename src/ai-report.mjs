// AI 검색 유입 표 (node src/ai-report.mjs [일수=7] [끝 날짜 YYYY-MM-DD, 기본 data/stats 마지막 날])
// data/stats 의 kind=bot(로봇|경로)·refland(유입|첫 쪽)·out(쪽|상품) 만 읽는다. 바깥에 요청하지 않는다.
// 쪽마다: OAI-SearchBot(ChatGPT 검색 색인) 읽음 · ChatGPT-User(답변 중 사용자 대신 열람) · ChatGPT 손님 착지 · 그 쪽의 쿠팡 클릭(유입 무관).
// '색인 로봇이 자주 읽는데 손님 착지가 0인 쪽'을 맨 아래에 따로 보여 준다 → 첫 문단·설명 점검 대상(고치는 것은 주간 분석).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const dir = join(ROOT, 'data', 'stats');
const all = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
const days = Number(process.argv[2]) || 7;
const end = process.argv[3] || all.at(-1);
const files = all.filter((d) => d <= end).slice(-days);
const isAiRef = (r) => /chatgpt|openai/i.test(r);
const rows = new Map();
const row = (p) => rows.get(p) || (rows.set(p, { idx: 0, user: 0, land: 0, out: 0 }), rows.get(p));
const botTotal = {};
for (const d of files) {
  const by = JSON.parse(readFileSync(join(dir, `${d}.json`), 'utf8')).by || {};
  for (const [k, v] of Object.entries(by.bot || {})) {
    const i = k.indexOf('|');
    const b = k.slice(0, i), p = k.slice(i + 1);
    botTotal[b] = (botTotal[b] || 0) + v;
    if (b === 'OAI-SearchBot') row(p).idx += v;
    else if (b === 'ChatGPT-User') row(p).user += v;
  }
  for (const [k, v] of Object.entries(by.refland || {})) {
    const i = k.lastIndexOf('|');
    if (isAiRef(k.slice(0, i))) row(k.slice(i + 1)).land += v;
  }
  for (const [k, v] of Object.entries(by.out || {})) {
    const p = k.split('|')[0];
    if (rows.has(p)) row(p).out += v;
  }
}
const pageRe = /^\/(c|g|p|qa|vs|jp)?(\/|$)/;
const list = [...rows.entries()].filter(([p]) => pageRe.test(p) && !/\.(txt|xml)$/.test(p));
const line = ([p, r]) => `| ${p} | ${r.idx} | ${r.user} | ${r.land} | ${r.out} |`;
const head = '| 쪽 | OAI-SearchBot 읽음 | ChatGPT-User 열람 | ChatGPT 손님 착지 | 그 쪽 쿠팡 클릭(전체 유입) |\n| --- | --- | --- | --- | --- |';
console.log(`## AI 검색 유입 표 ${files[0] || '-'} ~ ${files.at(-1) || '-'} (${files.length}일)\n`);
console.log('로봇별 읽음: ' + Object.entries(botTotal).sort((a, b) => b[1] - a[1]).map(([b, v]) => `${b} ${v}`).join(' · ') + '\n');
console.log('### 색인 로봇이 많이 읽은 쪽 (상위 20)\n' + head);
list.sort((a, b) => b[1].idx - a[1].idx).slice(0, 20).forEach((x) => console.log(line(x)));
console.log('\n### ChatGPT 손님이 착지한 쪽\n' + head);
list.filter(([, r]) => r.land).sort((a, b) => b[1].land - a[1].land).forEach((x) => console.log(line(x)));
console.log('\n### 많이 읽혔는데 착지 0 (점검 대상 상위 5)\n' + head);
list.filter(([, r]) => !r.land && r.idx).sort((a, b) => b[1].idx - a[1].idx).slice(0, 5).forEach((x) => console.log(line(x)));
console.log('\n_로봇 기록(kind=bot)은 2026-11-19 부터. 착지는 utm_source=chatgpt.com 이 붙은 첫 방문만 셉니다(붙지 않은 ChatGPT 손님은 직접 유입으로 보일 수 있음)._');
