// 초보 Q&A 글 (/qa, /qa/{slug}): 초보가 실제로 검색하는 질문 하나에 글 하나로 답한다.
// 원고: content/qa/NNN-{slug}.md (앞머리 + 간단한 마크다운), 그림: content/qa/img/*.png (원본 HTML: content/qa/img-src)
// 진행 상태: config/qa-queue.json (글감 순서는 naver-blog/keywords.json). 매일 1편: README '초보 Q&A' 참고.
// 사실은 config/guides.json 에서만 가져온다. 가격·쿠팡 링크·지어낸 후기는 넣지 않는다(검사에서 걸러 게시하지 않음).
import { join } from 'node:path';
import { readFileSync, readdirSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { ROOT } from './lib.mjs';

const DIR = join(ROOT, 'content', 'qa');
export const QA_MIN_CHARS = 1500;

// ---------- 원고 읽기 ----------
function parse(file) {
  const raw = readFileSync(join(DIR, file), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) return { file, issues: ['앞머리(---) 없음'] };
  const meta = Object.fromEntries(
    m[1].split('\n').filter((l) => l.includes(':')).map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
  );
  return {
    file,
    no: Number(meta.no),
    slug: meta.slug,
    kw: meta.kw,
    title: meta.title,
    desc: meta.desc,
    date: meta.date,
    guides: (meta.guides ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    body: m[2].trim(),
  };
}

// 본문 → 블록: ## 소제목, ### 질문(자주 묻는 질문 안), 문단, - 목록, 1. 목록, [그림:파일|설명]
function blocks(body) {
  const out = [];
  for (const chunk of body.split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    let para = [];
    const flush = () => para.length && (out.push({ t: 'p', text: para.join(' ') }), (para = []));
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      let x;
      if ((x = /^(#{2,3})\s+(.+)$/.exec(l))) { flush(); out.push({ t: x[1].length === 2 ? 'h2' : 'h3', text: x[2] }); }
      else if ((x = /^\[그림:([\w.-]+\.png)\|(.+)\]$/.exec(l))) { flush(); out.push({ t: 'img', src: x[1], alt: x[2] }); }
      else if (/^(-|\d+\.)\s+/.test(l)) {
        flush();
        const ordered = /^\d+\./.test(l);
        const items = [];
        while (i < lines.length && (ordered ? /^\d+\.\s+/ : /^-\s+/).test(lines[i].trim())) items.push(lines[i++].trim().replace(/^(-|\d+\.)\s+/, ''));
        i--;
        out.push({ t: ordered ? 'ol' : 'ul', items });
      } else para.push(l);
    }
    flush();
  }
  return out;
}

const plain = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

// 검사: 통과하지 못한 글은 게시하지 않는다(빌드는 계속)
function check(a, slugs) {
  if (a.issues) return a.issues;
  const bs = blocks(a.body);
  const text = bs.map((b) => (b.items ? b.items.join(' ') : b.text ?? '')).map(plain).join(' ');
  const issues = [];
  if (!a.no) issues.push('no 없음');
  if (!/^[a-z0-9-]+$/.test(a.slug ?? '')) issues.push('slug 는 영문 소문자·숫자·- 만');
  if (!a.title || !a.kw || !a.title.startsWith(a.kw.split(' ')[0])) issues.push('제목이 없거나 제목 앞쪽에 검색어가 없음');
  if (!a.desc) issues.push('desc 없음');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date ?? '')) issues.push('date 형식(YYYY-MM-DD) 오류');
  if (!a.guides.length || a.guides.some((s) => !slugs.has(s))) issues.push(`guides 오류: ${a.guides.filter((s) => !slugs.has(s)).join(', ') || '비어 있음'}`);
  if (text.replace(/\s/g, '').length < QA_MIN_CHARS) issues.push(`본문 ${text.replace(/\s/g, '').length}자 (공백 빼고 ${QA_MIN_CHARS}자 이상)`);
  if (bs.filter((b) => b.t === 'h2').length < 3) issues.push('소제목(##) 3개 이상 필요');
  const imgs = bs.filter((b) => b.t === 'img');
  if (!imgs.length) issues.push('그림 없음');
  for (const b of imgs) if (!existsSync(join(DIR, 'img', b.src))) issues.push(`그림 파일 없음: ${b.src}`);
  for (const [, href] of a.body.matchAll(/\]\(([^)]+)\)/g)) {
    const g = /^\/g\/([\w-]+)$/.exec(href);
    if (!(g ? slugs.has(g[1]) : /^\/(qa(\/[\w-]+)?|c\/[\w-]+)?$/.test(href))) issues.push(`허용하지 않는 링크: ${href} (사이트 안 /g/·/qa/·/c/ 만)`);
  }
  if (!/\]\(\/g\//.test(a.body)) issues.push('관련 가이드(/g/…) 본문 링크 없음');
  if (/[\d,]+\s*(만\s*)?원/.test(text)) issues.push('가격(…원) 표기 금지');
  if (/coupang|쿠팡/i.test(a.body)) issues.push('쿠팡 언급·링크 금지');
  if (/써\s*봤|사용해\s*보니|직접\s*(써|쳐)\s*보/.test(text)) issues.push('사용 후기처럼 쓴 문장 금지');
  return issues;
}

export function loadQa(slugs) {
  if (!existsSync(DIR)) return { list: [], bad: [] };
  const all = readdirSync(DIR).filter((f) => /^\d{3}-[\w-]+\.md$/.test(f)).sort().map(parse);
  const bad = [];
  const seen = new Set();
  const list = all.filter((a) => {
    const issues = check(a, slugs);
    if (seen.has(a.slug)) issues.push('slug 중복');
    if (issues.length) bad.push(`${a.file}: ${issues.join(' / ')}`);
    else seen.add(a.slug);
    return !issues.length;
  });
  return { list: list.sort((x, y) => y.no - x.no), bad };
}

// ---------- 화면 ----------
export function qaRelatedBlock(list, slug, esc) {
  const rel = list.filter((a) => a.guides.includes(slug)).slice(0, 4);
  if (!rel.length) return '';
  return `<section class="qa-rel"><h2>초보 Q&amp;A</h2><ul class="qa-list">${rel.map((a) => `<li><a href="/qa/${a.slug}"><b>${esc(a.title)}</b><small>${esc(a.desc)}</small></a></li>`).join('')}</ul><a class="more-link" href="/qa">초보 Q&amp;A 전체 보기 ›</a></section>`;
}

export function writeQaPages({ list, layout, writeText, esc, OUT, crumbLd, faqLd, updatedTag, guideName, guideBySlug, siteUrl, siteName }) {
  if (!list.length) return [];
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`);
  mkdirSync(join(OUT, 'qa', 'img'), { recursive: true });
  const urls = ['/qa'];
  for (const a of list) {
    const bs = blocks(a.body);
    // '자주 묻는 질문' 소제목 아래의 ### 질문 + 문단 → FAQ 구조화 데이터
    const fi = bs.findIndex((b) => b.t === 'h2' && /자주 묻는 질문/.test(b.text));
    const faq = [];
    if (fi >= 0) for (let i = fi + 1; i < bs.length && bs[i].t !== 'h2'; i++) if (bs[i].t === 'h3' && bs[i + 1]?.t === 'p') faq.push({ q: plain(bs[i].text), a: plain(bs[i + 1].text) });
    const html = bs
      .map((b) => {
        if (b.t === 'h2' || b.t === 'h3') return `<${b.t}>${inline(b.text)}</${b.t}>`;
        if (b.t === 'p') return `<p>${inline(b.text)}</p>`;
        if (b.t === 'ul' || b.t === 'ol') return `<${b.t}>${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${b.t}>`;
        if (b.t === 'img') {
          copyFileSync(join(DIR, 'img', b.src), join(OUT, 'qa', 'img', b.src));
          return `<figure class="qa-fig"><img src="/qa/img/${esc(b.src)}" alt="${esc(b.alt)}" width="1080" height="1080" loading="lazy" decoding="async"></figure>`;
        }
        return '';
      })
      .join('\n');
    const guides = a.guides.map(guideBySlug).filter(Boolean);
    const others = list.filter((o) => o.slug !== a.slug).slice(0, 5);
    const path = `/qa/${a.slug}`;
    const firstImg = bs.find((b) => b.t === 'img');
    writeText(
      join(OUT, 'qa', `${a.slug}.html`),
      layout({
        title: a.title,
        desc: a.desc,
        path,
        ld: [
          crumbLd([['홈', '/'], ['초보 Q&A', '/qa'], [a.kw, path]]),
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: a.title,
            description: a.desc,
            datePublished: a.date,
            mainEntityOfPage: `${siteUrl}${path}`,
            ...(firstImg ? { image: `${siteUrl}/qa/img/${firstImg.src}` } : {}),
            author: { '@type': 'Organization', name: siteName, url: siteUrl },
            publisher: { '@type': 'Organization', name: siteName, url: siteUrl },
          },
          ...(faq.length ? [faqLd(faq)] : []),
        ],
        body: `<nav class="crumb"><a href="/">홈</a> › <a href="/qa">초보 Q&amp;A</a></nav>
<p class="g-kicker">초보 Q&amp;A · ${esc(a.kw)}</p>
<h1>${esc(a.title)}</h1>
${updatedTag(a.date)}
<article class="prose qa-body">
${html}
</article>
<section class="qa-guides"><h2>이 글의 근거가 된 비교 가이드</h2><ul class="qa-list">${guides.map((g) => `<li><a href="/g/${g.slug}"><b>${esc(guideName(g))}</b><small>${esc(g.desc ?? '')}</small></a></li>`).join('')}</ul>
<p class="note">이 글의 사실(로프트·샤프트·구성 등)은 위 비교 가이드에 정리한 기준에서 가져왔습니다. 가격은 바뀌므로 가이드의 쿠팡 판매가와 확인 날짜를 보세요.</p></section>
${others.length ? `<section><h2>다른 초보 Q&amp;A</h2><ul class="qa-list">${others.map((o) => `<li><a href="/qa/${o.slug}"><b>${esc(o.title)}</b></a></li>`).join('')}</ul><a class="more-link" href="/qa">전체 보기 ›</a></section>` : ''}`,
      }),
    );
    urls.push(path);
  }
  writeText(
    join(OUT, 'qa.html'),
    layout({
      title: '골프 초보 Q&A: 장비 고르기 질문과 답',
      desc: '골프 초보가 자주 검색하는 장비 질문(골프채 구성, 드라이버 각도, 웨지 각도 등)에 비교 가이드 기준으로 답합니다.',
      path: '/qa',
      ld: [crumbLd([['홈', '/'], ['초보 Q&A', '/qa']])],
      body: `<nav class="crumb"><a href="/">홈</a> › 초보 Q&amp;A</nav>
<h1>골프 초보 Q&amp;A</h1>
<p class="prose">골프를 시작하면 생기는 장비 질문에 하나씩 답합니다. 내용은 이 사이트의 실력별 비교 가이드에 정리한 기준을 바탕으로 합니다.</p>
<ul class="qa-list">${list.map((a) => `<li><a href="/qa/${a.slug}"><b>${esc(a.title)}</b><small>${esc(a.desc)}</small></a></li>`).join('')}</ul>`,
    }),
  );
  return urls;
}
