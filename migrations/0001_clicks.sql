-- 쿠팡 이동 클릭 수 (Cloudflare D1, functions/go/[id].js 가 기록)
-- 개인정보 없음: 날짜(한국 시간), 상품ID, 클릭한 이 사이트의 페이지 경로, 횟수만 저장한다
CREATE TABLE IF NOT EXISTS clicks (
  day  TEXT NOT NULL,            -- YYYY-MM-DD
  pid  TEXT NOT NULL,            -- 상품ID (config/products.json)
  page TEXT NOT NULL DEFAULT '', -- 클릭한 페이지 경로 (예: /g/driver-recommend-2026)
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, pid, page)
);
CREATE INDEX IF NOT EXISTS clicks_day ON clicks (day);
