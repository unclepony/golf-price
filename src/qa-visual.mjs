// 화면 점검 (node src/qa-visual.mjs [--all] [--out 파일.md]): 빌드된 site/ 를 로컬 서버로 띄우고 크롬 헤드리스로 PC(1280)·휴대폰(390) 폭에서 열어 본다.
// 잡는 것: 가로 스크롤(페이지가 화면보다 넓음)과 그 원인 요소, 깨진 이미지, 칸 밖으로 넘친 글자, 비어 있는 본문, 콘솔 오류, 내부 링크 404.
// 기본은 대표 페이지(홈·분류·가이드·실력별·상품 표본·Q&A·비교 표본), --all 이면 사이트맵의 모든 주소.
// 결과는 마크다운(문제 목록)으로 출력한다. 문제가 있어도 실패 코드로 끝내지 않는다(매일 작업이 읽고 고친다).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { ROOT } from './lib.mjs';

const ALL = process.argv.includes('--all');
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const PORT = 4300 + Math.floor(Math.random() * 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const site = join(ROOT, 'site');
if (!existsSync(join(site, 'sitemap.xml'))) { console.error('site/ 가 없습니다. 먼저 node src/build.mjs'); process.exit(1); }
const urls = [...readFileSync(join(site, 'sitemap.xml'), 'utf8').matchAll(/<loc>[^<]*?(\/[^<]*)<\/loc>/g)].map((m) => m[1].replace(/^\/\/[^/]+/, '')).map((u) => (u.startsWith('/') ? u : '/' + u));
const paths = urls.map((u) => new URL(u, 'http://x').pathname);
// 표본: 종류별로 앞의 몇 개
const pick = (re, n) => paths.filter((p) => re.test(p)).slice(0, n);
const targets = ALL ? paths : [...new Set(['/', ...pick(/^\/c\//, 20), ...pick(/^\/g\/[^/]+$/, 60), ...pick(/^\/p\//, 25), ...pick(/^\/qa/, 5), ...pick(/^\/vs\//, 5), ...pick(/^\/jp/, 3)])];

const server = spawn(process.execPath, [join(ROOT, 'src', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const profile = join(tmpdir(), `qa-chrome-${PORT}`);
const dport = PORT + 500;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  await sleep(250);
  try {
    const page = (await (await fetch(`http://127.0.0.1:${dport}/json`)).json()).find((t) => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
}
if (!ws) { chrome.kill(); server.kill(); throw new Error('크롬을 열지 못했습니다'); }
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const waits = new Map();
const events = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } else if (m.method) events.push(m);
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; waits.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Network.enable');

// 페이지 안에서 돌리는 검사
const PROBE = `(() => {
  const W = document.documentElement.clientWidth;
  const out = { overflow: document.documentElement.scrollWidth - W, wide: [], broken: [], clipped: [], empty: false };
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  if (out.overflow > 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 1 && getComputedStyle(el).position !== 'fixed') {
        let p = el.parentElement, scrolls = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scrolls = true; break; } p = p.parentElement; }
        if (!scrolls) out.wide.push(desc(el) + ' (' + Math.round(r.right - W) + 'px)');
      }
      if (out.wide.length >= 5) break;
    }
  }
  for (const img of document.images) if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) out.broken.push(img.getAttribute('src').slice(0, 90));
  // 글자가 칸 밖으로 넘침(가로로 잘린 표 머리칸 등): 내용 폭이 칸보다 크고 넘침이 보이는 경우
  for (const el of document.querySelectorAll('th, td, .pc-name, .btn, h1, h2')) {
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0) out.clipped.push(desc(el) + ' "' + el.textContent.trim().slice(0, 20) + '"');
    if (out.clipped.length >= 5) break;
  }
  // 세로로 한 글자씩 꺾인 머리칸(폭이 너무 좁음)
  for (const el of document.querySelectorAll('tbody th')) {
    const t = el.textContent.trim();
    if (t.length >= 3 && el.clientWidth > 0 && el.clientWidth < 40) out.clipped.push(desc(el) + ' 폭 ' + el.clientWidth + 'px "' + t.slice(0, 10) + '"');
  }
  const main = document.querySelector('main');
  out.empty = !main || main.innerText.trim().length < 80;
  return out;
})()`;

const issues = [];
const widths = [[1280, 900, false], [390, 844, true]];
for (const path of targets) {
  for (const [w, h, mobile] of widths) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    events.length = 0;
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}${path}` });
    for (let i = 0; i < 80 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await sleep(100);
    await sleep(300);
    const { result } = await cdp('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const r = result.value ?? {};
    const tag = `${path} [${mobile ? '휴대폰' : 'PC'}]`;
    if (r.overflow > 1) issues.push(`가로 스크롤 ${r.overflow}px: ${tag} — ${r.wide.join(', ') || '원인 요소 찾지 못함'}`);
    for (const b of r.broken ?? []) issues.push(`깨진 이미지: ${tag} — ${b}`);
    for (const c of r.clipped ?? []) issues.push(`글자 넘침/좁은 칸: ${tag} — ${c}`);
    if (r.empty) issues.push(`본문이 거의 비어 있음: ${tag}`);
    const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'JS 오류');
    for (const x of errs) issues.push(`스크립트 오류: ${tag} — ${x}`);
    const bad = events.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400 && e.params.response.url.startsWith(`http://127.0.0.1:${PORT}`) && !/\/api\//.test(e.params.response.url));
    for (const x of bad) issues.push(`내부 파일 ${x.params.response.status}: ${tag} — ${x.params.response.url.replace(`http://127.0.0.1:${PORT}`, '')}`);
  }
}
ws.close();
chrome.kill();
server.kill();
const uniq = [...new Set(issues)];
const md = [`## 화면 점검 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}`, '', `페이지 ${targets.length}개 × PC·휴대폰, 문제 ${uniq.length}건`, '', ...uniq.map((x) => `- ${x}`)].join('\n');
if (out) writeFileSync(out, md);
console.log(md);
