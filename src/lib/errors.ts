import { ApiError, NetworkError } from '../api/client'

// 서버 에러 코드 → 화면에 보여 줄 문장. 서버 message 에는 "id=3" 같은 개발용 정보가 섞여 있어 그대로 쓰지 않는다.
const MESSAGES: Record<string, string> = {
  INVALID_REQUEST: '입력값을 확인해 주세요.',
  ACCOUNT_NOT_FOUND: '계좌를 찾을 수 없습니다.',
  ACCOUNT_CLOSED: '해지된 계좌라 거래할 수 없습니다.',
  INSUFFICIENT_BALANCE: '잔액이 부족합니다.',
  BALANCE_LIMIT_EXCEEDED: '받는 계좌의 잔액 한도를 넘습니다.',
  SAME_ACCOUNT_TRANSFER: '같은 계좌로는 이체할 수 없습니다.',
  IDEMPOTENCY_KEY_REUSED: '이미 다른 요청에 쓰인 요청 번호입니다. 다시 시도해 주세요.',
  IDEMPOTENCY_KEY_MISSING: '요청 번호가 없습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.',
  INVALID_IDEMPOTENCY_KEY: '요청 번호 형식이 올바르지 않습니다.',
  USERNAME_TAKEN: '이미 사용 중인 아이디입니다.',
  INVALID_CREDENTIALS: '아이디 또는 비밀번호가 올바르지 않습니다.',
  UNAUTHORIZED: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  FORBIDDEN: '이 화면을 볼 권한이 없습니다.',
  BUSINESS_DATE_NOT_ENDED: '오늘과 미래 날짜는 아직 끝나지 않아 마감할 수 없습니다.',
  CLOSING_ALREADY_RUNNING: '같은 날짜의 마감이 이미 실행 중입니다. 잠시 뒤 목록을 새로 고쳐 주세요.',
  CLOSING_NOT_FOUND: '마감 기록을 찾을 수 없습니다.',
}

export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return '서버에 연결하지 못했습니다. 코어뱅킹 서버(8080)가 켜져 있는지 확인해 주세요.'
  }
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return '서버 오류로 처리 결과를 확인하지 못했습니다.'
    }
    return MESSAGES[error.code] ?? error.message
  }
  return '알 수 없는 오류가 발생했습니다.'
}
