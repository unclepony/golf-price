# ATL골프기어

골프용품을 실력(초보~프로)·성별·가격대별로 비교하고, 쿠팡 판매가를 확인 날짜와 함께 보여 주는 정적 사이트입니다.
쿠팡 파트너스 링크로 수수료를 받습니다. 웹서버가 없어 서버 비용이 들지 않습니다(Cloudflare Pages + GitHub Actions).

## 가격 데이터 흐름

| 단계 | 지금 (API 승인 전) | 쿠팡 파트너스 API 승인 후 |
|---|---|---|
| 가격 입력 | `prices.csv` 에 직접 확인한 판매가 → `node src/prices/import.mjs` | `src/prices/providers/coupang-api.mjs` 구현 → 매일 자동 수집 |
| 저장 | `data/history/{상품ID}.json` 에 이력으로 쌓음 (출처 `src`: manual / link / api) | 같은 구조 |
| 표시 | 확인 날짜와 함께 표시, 14일 지나면 숨기고 '쿠팡에서 현재 가격 보기'만 | 같음 + 가격 추이·역대 최저가 |

- 가격 공급자 인터페이스: `src/prices/providers/*.mjs` — `csv`(지금), `coupang-api`(빈 껍데기·TODO, 승인 후 공식 문서를 보고 작성)
- 쿠팡 페이지 크롤링·스크래핑, `link.coupang.com` 자동 요청은 하지 않습니다(파트너스 약관). 링크 점검도 자동으로 하지 않습니다.

### 가격 넣는 법 (주 1회 권장)
1. `node src/prices/template.mjs` — 이번 주 확인할 상품 20개 줄을 `prices.csv` 에 추가 (쿠팡 상품명 주석 포함)
2. 쿠팡 파트너스 사이트에서 상품을 찾아 판매가와 확인일(YYYY-MM-DD)을 채움
3. `node src/prices/import.mjs` — 오류(없는 상품ID, 형식, 미래 날짜)가 있으면 아무것도 반영하지 않고 알려 줌
4. `npm run build` 로 확인 → 커밋·푸시

## 자동 실행 (GitHub Actions)

| 워크플로 | 언제 | 하는 일 | AI |
|---|---|---|---|
| `daily.yml` (daily-check) | 매일 23:05 KST | 데이터 점검 → 'daily-check' 이슈 하나에 덮어쓰기, 기준가 재계산(월요일 주간), 빌드(콘텐츠 날짜·사이트맵·URL 보호), 배포, IndexNow | 없음 |
| `weekly.yml` (weekly-analysis) | 월 09:00 KST | 서치콘솔·클릭 자료 수집, 가격 확인 목록, Claude Code 로 title/description 개선안·본문/FAQ 초안(최대 2페이지) → 빌드·링크 검사 통과 시 main 에 바로 반영 (실패하면 검토용 PR) | Claude Code (API 키) |

## 클릭 추적 (선택)

`config/site.json` 의 `clickTracking` 을 `true` 로 바꾸면 쿠팡 링크가 `/go/{상품ID}` 를 거칩니다.
Cloudflare Pages Functions(`functions/go/[id].js`)가 Cloudflare D1 에 '날짜·상품ID·클릭한 페이지 경로·횟수'만 기록하고 쿠팡 파트너스 링크로 302 이동합니다(개인정보 저장 없음, 기록은 응답 뒤에 해서 이동 지연 최소화).
링크에는 `rel="sponsored nofollow noopener"` 가 그대로 붙습니다. 주간 집계: `node src/clicks-report.mjs`.

D1 준비(한 번): Cloudflare 대시보드 → Storage & Databases → D1 → 데이터베이스 만들기(예: `golf-clicks`) → Console 에서 `migrations/0001_clicks.sql` 실행 → Workers & Pages → golf-price → Settings → Bindings → D1 database 추가(변수 이름 `CLICKS`).

## 운영자 모니터링 (/admin)

`https://golfprice.unclepony.com/admin` — 운영자만 보는 페이지. 페이지별 페이지뷰·방문, 유입 경로(구글·네이버·ChatGPT·카카오톡 등 앱·캠페인 utm 링크)와 유입별 쿠팡 클릭률, 들어온 외부 페이지, 검색어(넘어올 때만), 유입별 첫 페이지, 기기·국가, 쿠팡 클릭(상품별·버튼 위치별)과 **쿠팡 클릭률**(쿠팡 클릭 ÷ 페이지뷰, 방문당 클릭률 = 쿠팡 클릭 ÷ 방문)을 오늘·7일·30일·90일로 보여 줍니다(앞 기간 대비 증감 포함).

- 수집: `assets/app.js` 가 페이지를 열 때와 쿠팡 링크를 누를 때 `/api/hit`(`functions/api/hit.js`)로 신호를 보냅니다. **쿠팡 링크는 바꾸지 않습니다**(사용자는 파트너스 링크로 바로 이동). 쿠팡에 어떤 요청도 보내지 않습니다.
- 저장: D1 `stats` 표에 하루 합계만(`migrations/0002_stats.sql`). IP·쿠키·사용자 ID 저장 없음. 검색 로봇·다른 사이트발 요청·사이트맵에 없는 경로는 세지 않습니다.
- 잠금: HTTP Basic 인증(`functions/admin/_middleware.js`). 비밀번호는 Cloudflare 환경변수 `ADMIN_PASS` 에만 둡니다. 없으면 /admin 은 404. 검색엔진 차단(noindex, robots.txt).
- 내 방문 빼기: /admin 의 '이 브라우저의 방문은 세지 않기'를 켜 두세요(휴대폰 등 기기마다 한 번).

준비(한 번):
1. 위 '클릭 추적'의 D1 준비(데이터베이스 + 바인딩 `CLICKS`)를 하고, D1 Console 에서 `migrations/0002_stats.sql` 도 실행
2. Workers & Pages → golf-price → Settings → Variables and Secrets → 추가: 이름 `ADMIN_PASS`, 유형 **Secret**, 값은 16자 이상 긴 비밀번호(다른 곳에서 쓰지 않는 것)
3. 다시 배포(Deployments → 최근 배포 → Retry deployment) 후 /admin 접속 → 사용자 이름은 아무거나, 비밀번호는 `ADMIN_PASS`

## 내 PC에서 실행

Node.js 22.9 이상이 필요합니다.

- 사이트 생성: `npm run build` · 미리보기: `npm run preview` → http://localhost:4173
- 가격 반영: `npm run prices` (= `node src/prices/import.mjs`)
- 데이터 점검: `npm run check`

## 점검·관리 스크립트

- `node src/build.mjs` — 사이트 생성 (`site/`). 콘텐츠 지문으로 '마지막 업데이트'·sitemap lastmod 결정, 사라진 주소에 301 이 없으면 실패
- `node src/linkcheck.mjs` — 내부 링크·리다이렉트·사이트맵·`/go/` 이동 표 검사 (배포 전 실행)
- `node src/check.mjs` — 매일 점검(출시 형식, 초보 로프트·샤프트 기준, 이미지·링크 누락, 14일 지난 가격, 관련 영상 목록 형식)
- `node src/audit.mjs` — 초보 기준 위반·출시 형식 상세 목록
- `node src/rebaseline.mjs [--weekly]` — 기준가 재계산 (10% 이상 변동만, `--weekly` 는 정기 재계산)
- `node src/indexnow.mjs` — IndexNow 대기열 전송 (콘텐츠가 바뀐·새·삭제된 페이지만)
- `node src/gsc-fetch.mjs`, `node src/weekly-report.mjs` — 주간 분석 자료
- `node src/stamp-dates.mjs` — git 기록으로 링크 생성 때 판매가 확인일(`picks.json checked`) 채우기
- `node src/tiercheck.mjs` — 가이드별 실력·가격 단계 분포 검사
- `node src/videos-sync.mjs [원본 경로]` — golfvideo 의 `data/videos.json` 을 `config/videos.json` 으로 복사(형식 오류가 있으면 반영 안 함)

## 데이터 파일

- `config/products.json` 상품·카테고리 · `config/links.json` 쿠팡 링크 · `config/picks.json` 연결 상품 정보·기준가 · `config/guides.json` 가이드·점수
- `config/notices.json` — 고지·점수·가격 안내 문구 (사이트 전체에서 이 파일 한 곳만 씀)
- `config/rules.json` 초보 기준 · `config/variants.json` 초보 기준에 맞는 옵션으로 바꿀 쿠팡 상품 자리
- `config/howto.json` 아이템×성별×실력별 '고르는 법'·FAQ·한 줄 결론 수동 지정
- `config/videos.json` — 가이드 slug → 유튜브 관련 영상 목록. 아래 '관련 영상' 참고
- `config/content-state.json`, `config/url-manifest.json` — 빌드가 관리 (직접 고치지 않음)
- 출시 칸은 `YYYY년` 또는 빈 값만 허용(빌드 검사). 모르는 연도는 비워 둔다
- 상품이 3종 미만인 실력 단계는 실력별 페이지를 만들지 않고 `_redirects` 로 상위 가이드에 301

## 관련 영상 (유튜브)

가이드 페이지(`/g/{slug}`) 자주 묻는 질문 아래에 ATL골프기어 유튜브 채널의 관련 영상을 보여 줍니다. 영상이 없는 가이드는 블록이 없습니다.

- 원본: golfvideo 프로젝트의 `data/videos.json` (golfvideo 매일 작업이 갱신). GitHub Actions 에는 golfvideo 폴더가 없으므로 `node src/videos-sync.mjs` 로 `config/videos.json` 에 복사해 커밋합니다. 빌드는 이 복사본만 읽습니다.
- 형식: `{ "가이드 slug": [{ "id": "유튜브 영상 id(11자)", "format": "long|shorts", "title": "...", "publishAt": "ISO 시각 또는 null" }] }`. `format` 이 없으면 제목의 `#shorts` 로 판단합니다.
- `publishAt` 이 빌드 시각보다 미래인 영상(예약 공개 전)은 보이지 않습니다. 매일 23:05 빌드 때 그날 공개된 영상이 붙습니다.
- 처음에는 썸네일(`i.ytimg.com`)만 보이고, 누르면 그 자리에서 `youtube-nocookie.com` 플레이어를 불러옵니다(그 전에는 유튜브에 요청 없음). 링크에 utm 은 붙이지 않습니다.
- 채널 주소는 `config/site.json` 의 `youtube` ('유튜브 채널에서 더 보기' 링크).

## 초보 Q&A (/qa)

초보가 실제로 검색하는 질문(네이버 자동완성에서 뽑은 글감) 하나에 글 하나로 답합니다. 주소: `/qa`(목록), `/qa/{slug}`(글). 관련 가이드 페이지 아래에 '초보 Q&A' 링크가 붙습니다.

- 원고: `content/qa/NNN-{slug}.md` — 앞머리(no·slug·kw·title·desc·guides·date) + 본문(`##` 소제목, `###` 질문, 문단, `-`/`1.` 목록, `**굵게**`, `[글](/g/slug)`, `[그림:파일.png|설명]`). `## 자주 묻는 질문` 아래 `###` 질문과 답이 FAQ 구조화 데이터가 됩니다.
- 그림: `content/qa/img/*.png` (1080×1080, 원본 HTML `content/qa/img-src/` 를 크롬 헤드리스로 캡처). 제조사 사진·로고 금지.
- 글감 순서: `../naver-blog/keywords.json` · 올린 글 기록: `config/qa-queue.json` · 다음 글감과 쓸 수 있는 사실: `node src/qa-next.mjs`
- 빌드 검사(통과 못 하면 게시 안 함, `npm run check` 에 표시): 제목 앞쪽에 검색어, 본문 공백 빼고 1,500자 이상, 소제목 3개 이상, 그림 1장 이상, 관련 가이드 링크, 사이트 안 링크만, 가격(…원)·쿠팡·사용 후기 문장 금지.
- 사실은 `config/guides.json`(가이드 기준일)에서만 가져옵니다. 다른 채널(블로그·스레드)과 같은 주제라도 문장은 새로 씁니다.
- 매일 1편: 이 PC의 예약 작업 `golfprice-qa-daily`(아침)가 다음 글감으로 글·그림을 만들고, 빌드·링크 검사를 통과하면 `content/qa`·`config/qa-queue.json`·빌드 관리 파일만 커밋해 main 에 올리고 ops.unclepony.com 에 보고합니다. 다른 작업의 커밋 안 된 변경과 섞이지 않게 임시 git worktree 에서 작업합니다.

## 검색 순위 보호 원칙

가격 확인일과 콘텐츠 업데이트일 분리(본문 지문), 제목 가격은 'N만원대부터', 기준가는 10% 이상 변동·주 1회만 갱신, IndexNow 는 콘텐츠가 바뀐·새·삭제된 페이지만, 공개했던 주소가 사라지면 301 필수, 글을 대량으로 찍어 내지 않음(자동화는 데이터에만).

## 배포 설정

Cloudflare Pages: Build command `node src/build.mjs`, Output `site`, 환경 변수 `NODE_VERSION=22`, `SITE_URL=https://golfprice.unclepony.com`.
주소: `https://golfprice.unclepony.com` (Pages 사용자 지정 도메인, 2026-10-17 이전). 옛 주소 `golf-price.pages.dev` 는 `functions/_middleware.js` 가 같은 경로로 301 이동시킨다(지우지 말 것).

## 지켜야 할 것

- 모든 페이지 상단·하단에 쿠팡 파트너스 고지 문구가 표시됩니다. 지우지 마세요(`config/notices.json`).
- 쿠팡 페이지를 크롤링하지 않습니다. 자동 가격은 승인 후 공식 파트너스 API 로만 가져옵니다.
- API 승인 후 파트너스 API 이용 약관(호출 한도, 데이터 보관·표시 조건)을 확인하고 공급자를 구현하세요.
