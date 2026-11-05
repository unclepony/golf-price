-- 판매까지의 과정(2026-11-06 사장님): 쿠팡 클릭 한 번 = 한 줄. functions/api/hit.js 의 journey() 가 넣고, unclepony-ops 판매 내역(/sales)이 쿠팡 주문과 잇는다.
-- IP·쿠키·사용자 ID 없음. at 은 한국 시간 분까지(YYYY-MM-DDTHH:MM). 2026-11-06 원격 D1 에 이미 적용함.
CREATE TABLE IF NOT EXISTS journey (
  at    TEXT NOT NULL,   -- 클릭 시각(한국 시간, 분까지)
  day   TEXT NOT NULL,   -- YYYY-MM-DD
  pid   TEXT NOT NULL,   -- 누른 상품 키(사이트 상품 ID, 유튜브킹은 상품 이름)
  page  TEXT,            -- 누른 페이지
  src   TEXT,            -- 유입 경로(구글·ChatGPT·캠페인: …)
  kw    TEXT,            -- 검색어(넘어올 때만)
  url   TEXT,            -- 들어온 외부 주소 또는 캠페인(출처 / 매체 / 캠페인)
  land  TEXT,            -- 이 탭의 첫 페이지
  trail TEXT,            -- 거쳐 온 페이지(최근 6쪽, ' → ')
  steps INTEGER,         -- 이 탭에서 본 쪽수
  secs  INTEGER,         -- 첫 페이지부터 클릭까지 초
  dev   TEXT,            -- PC·모바일·태블릿
  pos   TEXT             -- 누른 버튼 위치
);
CREATE INDEX IF NOT EXISTS journey_day_pid ON journey (day, pid);
