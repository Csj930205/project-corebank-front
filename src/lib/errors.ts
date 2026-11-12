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
  FORBIDDEN: '권한이 없습니다. 이 일은 다른 역할의 관리자가 합니다.',
  BUSINESS_DATE_NOT_ENDED: '오늘과 미래 날짜는 아직 끝나지 않아 마감할 수 없습니다.',
  CLOSING_ALREADY_RUNNING: '같은 날짜의 마감이 이미 실행 중입니다. 잠시 뒤 목록을 새로 고쳐 주세요.',
  CLOSING_NOT_FOUND: '마감 기록을 찾을 수 없습니다.',
  TRANSACTION_NOT_FOUND: '해당 거래를 찾을 수 없습니다. 거래 번호를 확인해 주세요.',
  NOT_CORRECTABLE: '정정할 수 없는 거래입니다. 해지 지급과 정정 거래는 되돌릴 수 없습니다.',
  ALREADY_REVERSED: '이미 정정된 거래입니다.',
  CORRECTION_ALREADY_REQUESTED: '이 거래에 승인을 기다리는 정정 요청이 이미 있습니다.',
  CORRECTION_ALREADY_DECIDED: '다른 관리자가 이미 승인 또는 반려했습니다. 목록을 새로 고쳐 주세요.',
  CORRECTION_NOT_FOUND: '정정 요청을 찾을 수 없습니다.',
  PRODUCT_NOT_FOUND: '상품을 찾을 수 없습니다.',
  PRODUCT_NOT_AVAILABLE: '판매 중인 상품이 아닙니다. 기본 상품은 판매 중지할 수 없습니다.',
  PRODUCT_NAME_TAKEN: '같은 이름의 상품이 이미 있습니다.',
  MONTH_NOT_ENDED: '이번 달과 미래 달은 아직 끝나지 않아 결산할 수 없습니다.',
  ACCRUAL_ALREADY_RUNNING: '같은 날의 이자 적립이 동시에 실행됐습니다. 잠시 뒤 다시 실행해 주세요.',
  SELF_APPROVAL_NOT_ALLOWED: '본인이 요청한 일은 다른 관리자가 승인하거나 반려해야 합니다.',
  ADMIN_ALREADY_DECIDED: '다른 책임자가 이미 승인 또는 반려했습니다. 목록을 새로 고쳐 주세요.',
  ADMIN_NOT_FOUND: '관리자 등록 요청을 찾을 수 없습니다.',
}

// 서버 문장을 그대로 보여 주는 코드. "15분 뒤에 다시 시도하세요" 처럼 언제 다시 할 수 있는지가 들어 있고 개발용 정보는 없다.
const SERVER_WORDED = new Set(['LOGIN_LOCKED', 'RATE_LIMITED'])

export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return '서버에 연결하지 못했습니다. 코어뱅킹 서버(8080)가 켜져 있는지 확인해 주세요.'
  }
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return '서버 오류로 처리 결과를 확인하지 못했습니다.'
    }
    if (SERVER_WORDED.has(error.code)) return error.message
    return MESSAGES[error.code] ?? error.message
  }
  return '알 수 없는 오류가 발생했습니다.'
}
