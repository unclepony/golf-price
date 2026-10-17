-- 방문·쿠팡 클릭 통계 (Cloudflare D1, functions/api/hit.js 가 기록하고 /admin 이 읽는다)
-- 개인정보 없음: IP·쿠키·브라우저 지문·사용자 ID 를 저장하지 않는다. 하루 단위 합계만 저장한다.
-- kind 별 k 의 뜻
--   pv     페이지 경로                    (페이지뷰)
--   visit  들어온 첫 페이지 경로            (방문: 브라우저 탭 세션의 첫 페이지)
--   ref    유입 경로 (구글·네이버·직접 등)   (방문마다 1)
--   dev    기기 (모바일·태블릿·PC)          (방문마다 1)
--   cty    국가 코드 (Cloudflare 제공)      (방문마다 1)
--   out    "페이지경로|상품ID"              (쿠팡 링크 클릭)
--   pos    클릭한 버튼 위치                 (쿠팡 링크 클릭)
CREATE TABLE IF NOT EXISTS stats (
  day  TEXT NOT NULL,              -- YYYY-MM-DD (한국 시간)
  kind TEXT NOT NULL,
  k    TEXT NOT NULL DEFAULT '',
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, k)
);
CREATE INDEX IF NOT EXISTS stats_kind_day ON stats (kind, day);
