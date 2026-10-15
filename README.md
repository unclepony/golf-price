# 골프 최저가 기록장

골프용품의 특징과 고르는 법을 정리하고, 가격을 매일 기록해 "지금 사도 될까"를 알려주는 정적 사이트입니다.
쿠팡 파트너스 링크로 수수료를 받습니다.

## 두 가지 모드

| 모드 | 언제 | 내용 |
|---|---|---|
| 가이드 모드 | 쿠팡 파트너스 최종 승인 전 (API 키 없음) | 상품 특징, 고르는 법, 쿠팡 간편링크 버튼 |
| 가격 추적 모드 | 최종 승인 후 (API 키 있음) | 매일 가격 수집, 가격 추이 그래프, "사기 좋은 때" 판단 |

API 키를 넣으면 가격이 수집된 상품부터 자동으로 가격 추적 페이지로 바뀝니다.

## 구조

```
config/products.json   상품 목록, 검색 조건, 가이드 문구, 분류별 고르는 법
config/links.json      상품별 쿠팡 파트너스 간편링크 (직접 붙여넣기)
src/collect.mjs        쿠팡 파트너스 API로 최저가 수집 → data/history/*.json
src/build.mjs          사이트 생성 → site/
src/demo.mjs           가격 추적 모드 미리보기용 샘플 데이터 (실제 가격 아님)
.github/workflows/     매일 아침 자동 수집
```

운영 흐름: GitHub Actions가 매일 수집 → data/ 커밋 → Cloudflare Pages가 자동으로 사이트 재생성·배포.
웹서버가 없어서 서버 비용이 들지 않습니다.

## 내 PC에서 실행

Node.js 22.9 이상이 필요합니다.

- 사이트 생성: `npm run build`
- 미리보기: `npm run preview` → http://localhost:4173
- 가격 추적 모드 샘플 보기: `npm run demo` 후 `npm run preview`
- 가격 수집 (API 키 필요): `.env.example` 을 `.env` 로 복사해 키를 채우고 `npm run collect`

## 배포 설정 (한 번만)

### Cloudflare Pages
1. Workers & Pages → Create → Pages → Connect to Git → `golf-price` 저장소 선택
2. 빌드 설정
   - Framework preset: None
   - Build command: `node src/build.mjs`
   - Build output directory: `site`
   - 환경 변수: `NODE_VERSION` = `22`, `SITE_URL` = 배포 주소 (예: `https://golf-price.pages.dev`)

### GitHub (최종 승인 후)
저장소 Settings → Secrets and variables → Actions → New repository secret
- `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`

Actions 탭 → daily-collect → Run workflow 로 첫 수집을 돌려봅니다.

## 쿠팡 파트너스 링크 넣기 (승인 전)

파트너스 사이트에서 상품별 간편링크를 만들어 `config/links.json` 의 해당 상품 id에 붙여넣습니다.
링크가 있는 상품에만 "쿠팡에서 가격 확인하기" 버튼이 나타납니다.
승인 후에는 API가 돌려주는 파트너스 링크가 자동으로 쓰입니다 (links.json 에 값이 있으면 그것이 우선).

## 지켜야 할 것

- 모든 페이지 상단·하단과 구매 버튼 아래에 대가성 문구가 자동으로 표시됩니다. 지우지 마세요.
- 쿠팡 페이지를 크롤링하지 않습니다. 가격은 공식 파트너스 API로만 가져옵니다.
- 승인 후 API 키를 받을 때 파트너스 API 이용 약관(호출 한도, 데이터 보관·표시 조건)을 확인하세요.
  호출 한도에 맞춰 `COUPANG_MAX_PER_RUN`, `COUPANG_DELAY_SEC` 값과 수집 시간표(daily.yml)를 조정합니다.
