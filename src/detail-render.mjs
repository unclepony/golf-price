// 상품 상세 이미지 만들기: .detail/data.json(빌드가 만든 재료) → 크롬 헤드리스 캡처 → content/detail/{id}.webp
//   DETAIL_DUMP=1 node src/build.mjs && node src/detail-render.mjs [상품ID ...]
// 내용이 바뀐 상품만 다시 만든다(content/detail/index.json 에 재료 지문 저장). 이 PC 의 크롬을 쓴다(CHROME 환경변수로 경로 변경).
// 캡처: 폭 860px, 1.5배 해상도, WebP 품질 80. 쿠팡 쇼핑몰 페이지는 열지 않는다(쿠팡 API 대표 사진 주소만 이미지로 불러옴).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { ROOT, readJson } from './lib.mjs';
import { detailHtml } from './detail.mjs';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTDIR = join(ROOT, 'content', 'detail');
const SRCDIR = join(ROOT, '.detail', 'html');
mkdirSync(OUTDIR, { recursive: true });
mkdirSync(SRCDIR, { recursive: true });
const only = process.argv.slice(2);
const data = readJson(join(ROOT, '.detail', 'data.json'), []).filter((d) => !only.length || only.includes(d.id));
const idxFile = join(OUTDIR, 'index.json');
const idx = readJson(idxFile, {});
const hashOf = (d) => createHash('sha1').update(detailHtml(d)).digest('hex').slice(0, 12);
const todo = data.filter((d) => only.length || idx[d.id] !== hashOf(d) || !existsSync(join(OUTDIR, `${d.id}.webp`)));
if (!todo.length) { console.log('바뀐 상세 이미지 없음'); process.exit(0); }

const port = 9300 + Math.floor(Math.random() * 400);
const profile = join(tmpdir(), `detail-chrome-${port}`);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
}
if (!ws) { chrome.kill(); throw new Error('크롬을 열지 못했습니다'); }
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const waits = new Map();
const events = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } else if (m.method) events.push(m.method);
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; waits.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 860, height: 1200, deviceScaleFactor: 1.5, mobile: false });

let n = 0;
for (const d of todo) {
  const file = join(SRCDIR, `${d.id}.html`);
  writeFileSync(file, detailHtml(d));
  events.length = 0;
  await cdp('Page.navigate', { url: 'file:///' + file.replaceAll('\\', '/') });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  // 사진이 다 뜰 때까지(최대 5초)
  await cdp('Runtime.evaluate', { expression: 'Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r;setTimeout(r,5000)})))', awaitPromise: true });
  const { result } = await cdp('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
  const h = Math.ceil(result.value);
  const shot = await cdp('Page.captureScreenshot', { format: 'webp', quality: 80, captureBeyondViewport: true, clip: { x: 0, y: 0, width: 860, height: h, scale: 1 } });
  writeFileSync(join(OUTDIR, `${d.id}.webp`), Buffer.from(shot.data, 'base64'));
  idx[d.id] = hashOf(d);
  console.log(`${++n}/${todo.length} ${d.id} (${h}px, ${Math.round(Buffer.from(shot.data, 'base64').length / 1024)}KB)`);
}
writeFileSync(idxFile, JSON.stringify(idx, null, 1) + '\n');
ws.close();
chrome.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log('끝');
