// 다음 초보 Q&A 글감과 쓸 수 있는 사실 모으기 (node src/qa-next.mjs [keywords.json 경로])
// 글감 순서: naver-blog/keywords.json(네이버 자동완성에서 뽑은 검색어) · 이미 올린 글: config/qa-queue.json
// 출력(JSON): 다음 번호·검색어·관련 가이드의 사실(제목·소개·본문·FAQ·기준). 글은 이 사실만으로 쓴다.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ROOT, readJson } from './lib.mjs';

const src = process.argv[2] || process.env.QA_KEYWORDS || join(ROOT, '..', 'naver-blog', 'keywords.json');
if (!existsSync(src)) {
  console.error(`글감 파일이 없습니다: ${src}`);
  process.exit(1);
}
const done = new Set((readJson(join(ROOT, 'config', 'qa-queue.json'), { items: [] }).items ?? []).map((x) => x.no));
const next = (readJson(src).items ?? []).find((x) => !done.has(x.no));
if (!next) {
  console.log(JSON.stringify({ next: null, 설명: '남은 글감이 없습니다. keywords.json 에 글감을 더하세요.' }, null, 2));
  process.exit(0);
}
const guides = readJson(join(ROOT, 'config', 'guides.json')).guides.filter((g) => !g.mergeInto);
const pick = (s) => guides.find((g) => g.slug === s);
const facts = (next.guide ?? []).map(pick).filter(Boolean).map((g) => ({
  slug: g.slug,
  url: `/g/${g.slug}`,
  title: g.title,
  updated: g.updated,
  intro: g.intro,
  criteria: g.criteria,
  sections: g.sections,
  faq: g.faq,
}));
const missing = (next.guide ?? []).filter((s) => !pick(s));
console.log(
  JSON.stringify(
    {
      next: { no: next.no, file: `content/qa/${String(next.no).padStart(3, '0')}-<영문-slug>.md`, kw: next.kw, alt: next.alt ?? [] },
      missingGuides: missing,
      rules: readJson(join(ROOT, 'config', 'rules.json'), {}),
      facts,
    },
    null,
    2,
  ),
);
