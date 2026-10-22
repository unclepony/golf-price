너는 골프용품 비교 사이트 초이스골프(옛 이름 ATL골프기어, https://golfprice.unclepony.com) 저장소에서 주간 분석을 한다. 결과는 사람의 검토 없이 빌드·링크 검사만 통과하면 바로 실제 사이트에 반영된다. 그러니 확실한 내용만 보수적으로 쓰고, 조금이라도 불확실하면 쓰지 않는다.

## 읽을 자료
- `reports/weekly/{오늘}-data.json` — 서치콘솔 지난 7일(lowCtr, contentCandidates), 클릭 추적, 가격 확인 목록
- `reports/weekly/{오늘}.md` — 보고서 뼈대. (a)는 이미 채워져 있다
- `config/guides.json`, `config/howto.json`, `config/products.json`, `config/rules.json`
- 날짜 {오늘} 은 `reports/weekly/` 에서 가장 최근 파일의 날짜다

## 할 일
1. **(b) title/description 개선안**: data.json 의 `lowCtr` 페이지마다 현재 title·description, 상위 검색어를 보고 개선안을 보고서 (b) 칸에 표로 쓴다(현재 → 제안 → 이유 한 줄). **코드나 템플릿은 고치지 않는다**(제목은 빌드 템플릿이 만든다). 제목 원칙: 가격은 정확한 금액이 아니라 'N만원대부터', 실력 표현은 초보·중급자·상급자·프로.
2. **(c) 본문·FAQ 보강 (최대 2페이지)**: `contentCandidates` 중 `config/howto.json` 에 아직 내용이 없는 실력별 페이지(주소가 `/g/{가이드}-{beginner|intermediate|advanced|pro}`)를 최대 2개 골라, howto.json 에 `"{카테고리}|{성별}|{실력}"` 키로 초안을 추가한다. 형식은 기존 `"wood|남성|초심자"` 항목과 같게(`status: "초안 — 검토 필요"`, `title`, `sections` 3~4개, `faq` 3~5개, `updated` 는 오늘). 보고서 (c) 칸에 고른 페이지와 이유를 쓴다. 후보가 없으면 "대상 없음"이라고 쓴다.
3. `node src/build.mjs` 와 `node src/linkcheck.mjs` 를 실행해 통과하는지 확인한다.

## 반드시 지킬 것
- 일반적으로 널리 알려진 골프 장비 상식 수준으로만 쓴다. 직접 시험한 것처럼 쓰지 않고, 시험 결과·수치·후기를 지어내지 않는다.
- 상품 스펙(로프트, 샤프트, 출시 연도, 무게 등)이 확실하지 않으면 쓰지 말거나 `TODO(확인 필요)` 로 표시한다.
- 가격, 쿠팡 링크(`config/links.json`, `config/picks.json`, `config/variants.json`), 점수(`scores`)·순위는 바꾸지 않는다.
- 쿠팡 파트너스 고지 문구, 주관적 점수 안내, 가격 안내(`config/notices.json`)는 지우거나 약하게 바꾸지 않는다.
- 페이지를 새로 만들거나 주소를 바꾸지 않는다(검색 순위 보호). 글을 대량으로 늘리지 않는다 — 이번 주 보강은 최대 2페이지.
- 선수·유명인 이름은 제목에 넣지 않는다. 쿠팡 웹페이지나 link.coupang.com 에 접속하지 않는다.
- `config/content-state.json`, `config/url-manifest.json` 은 고치지 않는다(빌드가 관리).
- 커밋·푸시·PR 생성은 하지 않는다(워크플로가 한다). 끝나면 바꾼 파일과 검토할 점을 짧게 요약한다.
