// 로고 파일 만들기: 사장님이 준 원본 그림(src/figures/logo-source.webp, 2026-10-23)에서 머리글 그림·아이콘·공유 이미지·검색엔진 로고를 만든다.
// node src/logo-make.cjs → src/figures/{logo-mark,icon-48,icon-180,icon-512,logo-512,og}.png  (크롬 헤드리스 캔버스로 처리, 설치할 것 없음)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dir = path.join(__dirname, 'figures');
const tmp = require('os').tmpdir();
const b64 = fs.readFileSync(path.join(dir, 'logo-source.webp')).toString('base64');
const html = `<!doctype html><meta charset="utf-8"><body><pre id="out"></pre><script>
const img = new Image();
img.onload = () => {
  const W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, W, H).data;
  const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // 배경(크림)과 잉크(남색) 밝기
  const bgL = lum(((10) * W + 10) * 4);
  let inkL = 255, ink = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { const l = lum(i); if (l < inkL) { inkL = l; ink = [d[i], d[i + 1], d[i + 2]]; } }
  // 진한 잉크 색: 가장 어두운 쪽 평균
  let s = [0, 0, 0], n = 0;
  for (let i = 0; i < d.length; i += 4) if (lum(i) < inkL + 25) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
  ink = s.map((v) => Math.round(v / n));
  const A = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) A[p] = Math.max(0, Math.min(1, (bgL - lum(p * 4)) / (bgL - inkL - 10)));
  // 글자(CHOICE GOLF)와 그림(조랑말+클럽) 경계: 잉크가 없는 가로줄 중 가운데 아래쪽
  const rowInk = (y, x0 = 0, x1 = W) => { let t = 0; for (let xx = x0; xx < x1; xx++) t += A[y * W + xx]; return t; };
  const bbox = (y0, y1) => { let a = W, b = 0, c2 = H, e = 0; for (let y = y0; y < y1; y++) for (let xx = 0; xx < W; xx++) if (A[y * W + xx] > 0.3) { if (xx < a) a = xx; if (xx > b) b = xx; if (y < c2) c2 = y; if (y > e) e = y; } return { x: a, y: c2, w: b - a + 1, h: e - c2 + 1 }; };
  const all = bbox(0, H);
  let split = 0, best = 0;
  // 그림 아래 ~ 글자 위 사이 빈 띠를 찾는다
  let runStart = -1;
  for (let y = all.y; y < all.y + all.h; y++) {
    if (rowInk(y) < 0.5) { if (runStart < 0) runStart = y; const len = y - runStart; if (len > best) { best = len; split = Math.round((runStart + y) / 2); } } else runStart = -1;
  }
  const mark = bbox(0, split), text = bbox(split, H);
  const out = { W, H, bgL, inkL, ink, all, split, mark, text };
  // 잉크만 남긴 투명 캔버스(색 지정)
  const layer = (col, dil = 0) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'); const im = cx.createImageData(W, H);
    let src = A;
    if (dil > 0) { // 선을 굵게(작은 아이콘용)
      const T = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { let m = 0; for (let dy = -dil; dy <= dil; dy++) for (let dx = -dil; dx <= dil; dx++) { if (dx * dx + dy * dy > dil * dil) continue; const yy = y + dy, x2 = xx + dx; if (yy < 0 || yy >= H || x2 < 0 || x2 >= W) continue; const v = A[yy * W + x2]; if (v > m) m = v; } T[y * W + xx] = m; }
      src = T;
    }
    for (let p = 0; p < W * H; p++) { im.data[p * 4] = col[0]; im.data[p * 4 + 1] = col[1]; im.data[p * 4 + 2] = col[2]; im.data[p * 4 + 3] = Math.round(src[p] * 255); }
    cx.putImageData(im, 0, 0); return cv;
  };
  const navy = ink;
  const inkLayer = layer(navy), inkBold = layer(navy, 3), whiteLayer = layer([255, 255, 255]), whiteBold = layer([255, 255, 255], 5);
  const make = (w, h, bg, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; if (bg) { cx.fillStyle = bg; cx.fillRect(0, 0, w, h); } draw(cx); return cv.toDataURL('image/png'); };
  const fit = (cx, srcCv, box, w, h, pad) => { const sc = Math.min((w - 2 * pad) / box.w, (h - 2 * pad) / box.h); const dw = box.w * sc, dh = box.h * sc; cx.drawImage(srcCv, box.x, box.y, box.w, box.h, (w - dw) / 2, (h - dh) / 2, dw, dh); };
  const files = {};
  // 1) 머리글용 그림 표시(투명, 남색 선) — 정사각형
  files['logo-mark.png'] = make(256, 256, null, (cx) => fit(cx, inkBold, mark, 256, 256, 8));
  // 2) 아이콘(파비콘·홈 화면): 남색 바탕 + 흰 선(작을수록 굵게)
  const navyHex = '#' + navy.map((v) => v.toString(16).padStart(2, '0')).join('');
  out.navyHex = navyHex;
  files['icon-512.png'] = make(512, 512, navyHex, (cx) => fit(cx, whiteLayer, mark, 512, 512, 64));
  files['icon-180.png'] = make(180, 180, navyHex, (cx) => fit(cx, whiteBold, mark, 180, 180, 20));
  files['icon-48.png'] = make(48, 48, navyHex, (cx) => fit(cx, whiteBold, mark, 48, 48, 4));
  // 3) 검색엔진 로고(Organization.logo): 흰 바탕 정사각형에 그림+글자 전체
  files['logo-512.png'] = make(512, 512, '#ffffff', (cx) => fit(cx, inkLayer, all, 512, 512, 40));
  // 4) 공유 이미지(og): 1200x630 크림 바탕에 원본 구성 그대로
  const bgc = 'rgb(' + [d[(10 * W + 10) * 4], d[(10 * W + 10) * 4 + 1], d[(10 * W + 10) * 4 + 2]].join(',') + ')';
  files['og.png'] = make(1200, 630, bgc, (cx) => fit(cx, inkLayer, all, 1200, 630, 90));
  out.files = files;
  document.getElementById('out').textContent = JSON.stringify(out);
};
img.src = 'data:image/webp;base64,${b64}';
</script>`;
fs.writeFileSync(path.join(tmp, 'logo-proc.html'), html);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--virtual-time-budget=30000', '--dump-dom', 'file:///' + path.join(tmp, 'logo-proc.html').replace(/\\/g, '/')], { encoding: 'utf8', maxBuffer: 1 << 28 });
const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const out = JSON.parse(raw);
for (const [name, url] of Object.entries(out.files)) fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
delete out.files;
console.log(JSON.stringify(out));
for (const name of ['logo-mark.png', 'icon-48.png', 'icon-180.png', 'icon-512.png', 'logo-512.png', 'og.png']) console.log(name, fs.statSync(path.join(dir, name)).size);
