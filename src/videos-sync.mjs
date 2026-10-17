// 유튜브 관련 영상 목록 가져오기 (node src/videos-sync.mjs [원본 경로])
// golfvideo 프로젝트의 data/videos.json(가이드 slug → 영상 목록)을 config/videos.json 으로 복사한다.
// GitHub Actions 빌드에는 golfvideo 폴더가 없으므로, 빌드는 저장소 안의 config/videos.json 만 읽는다.
// 원본 경로: 인자 > 환경변수 GOLFVIDEO_JSON > ../golfvideo/data/videos.json
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ROOT, readJson, writeJson } from './lib.mjs';
import { videoIssues } from './videos.mjs';

const src = process.argv[2] || process.env.GOLFVIDEO_JSON || join(ROOT, '..', 'golfvideo', 'data', 'videos.json');
if (!existsSync(src)) {
  console.error(`원본 파일이 없습니다: ${src}`);
  process.exit(1);
}
const data = readJson(src);
const slugs = new Set(readJson(join(ROOT, 'config', 'guides.json')).guides.filter((g) => !g.mergeInto).map((g) => g.slug));
const issues = videoIssues(data, slugs);
if (issues.length) {
  console.error(`형식 오류가 있어 반영하지 않습니다:\n${issues.map((x) => `  ${x}`).join('\n')}`);
  process.exit(1);
}
const dst = join(ROOT, 'config', 'videos.json');
const before = JSON.stringify(readJson(dst, {}));
writeJson(dst, data);
const n = Object.values(data).flat().length;
console.log(`${before === JSON.stringify(data) ? '변경 없음' : '갱신'}: config/videos.json (가이드 ${Object.keys(data).length}개, 영상 ${n}편)`);
