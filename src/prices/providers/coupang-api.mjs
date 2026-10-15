// 가격 공급자: 쿠팡 파트너스 API — 아직 쓰지 않는 빈 껍데기
//
// TODO(API 승인 후): 쿠팡 파트너스 최종 승인(누적 실적 조건 충족) 뒤 발급되는 API 키와 '공식 API 문서'를 확인하고 작성한다.
//   - 인증 방식, 엔드포인트, 호출 한도는 공식 문서 기준으로 구현한다 (추측으로 작성하지 않는다)
//   - 반환 형식은 csv 공급자와 같게: [{ id, price, d: 'YYYY-MM-DD', src: 'api', n?, latest?: { title, image, link } }]
//   - 가이드에 연결한 쿠팡 상품과 같은 상품인지(옵션·병행·직구 제외) 확인하는 규칙을 둔다
//   - 키는 GitHub Secrets(COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY)로만 받고 코드·로그에 남기지 않는다
//   - 쿠팡 웹페이지 크롤링·스크래핑, link.coupang.com 자동 요청은 하지 않는다
//   - 구현을 마치면 available() 의 '&& false' 를 지우고, notices.json 의 price.api 문구가 쓰이는지 확인한다
export const name = 'coupang-api';

export function available() {
  return Boolean(process.env.COUPANG_ACCESS_KEY && process.env.COUPANG_SECRET_KEY) && false;
}

export async function fetchPrices(/* products */) {
  throw new Error('쿠팡 파트너스 API 공급자는 아직 구현되지 않았습니다 (API 승인 후 공식 문서를 확인하고 작성)');
}
