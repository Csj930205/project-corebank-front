import type { AuditSearch } from '../api/admin'
import type { AuditAction, AuditLogEntry, AuditOutcome } from '../api/types'

// 감사 로그 화면에서 쓰는 이름표와 변환. 화면 컴포넌트에서 떼어 두어 단위 테스트하기 쉽게 한다.

/** 화면의 고르기 순서도 이 순서다(업무 흐름: 인증 → 계좌 → 돈 → 관리자). */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  LOGIN: '로그인',
  CUSTOMER_LOGIN: '고객 로그인',
  CUSTOMER_SIGNUP: '고객 가입',
  ACCOUNT_OPEN: '계좌 개설',
  MY_ACCOUNTS: '내 계좌 목록',
  RECIPIENT_LOOKUP: '수취인 조회',
  ACCOUNT_VIEW: '계좌 조회',
  TRANSACTION_HISTORY: '거래내역 조회',
  DEPOSIT: '입금',
  WITHDRAWAL: '출금',
  ACCOUNT_CLOSE: '계좌 해지',
  TRANSFER: '이체',
  ADMIN_ACCOUNT_SEARCH: '관리자 계좌 목록',
  ADMIN_SUMMARY: '관리자 요약',
  CLOSING_RUN: '일 마감 실행',
  CLOSING_LIST: '마감 기록 목록',
  CLOSING_VIEW: '마감 상세',
  LOGIN_LOCK_LIST: '로그인 잠금 목록',
  LOGIN_UNLOCK: '로그인 잠금 해제',
  CORRECTION_REQUEST: '정정 요청',
  CORRECTION_LIST: '정정 요청 목록',
  CORRECTION_VIEW: '정정 요청 상세',
  CORRECTION_APPROVE: '정정 승인',
  CORRECTION_REJECT: '정정 반려',
  ADMIN_USER_LIST: '관리자 목록',
  ADMIN_USER_CREATE: '관리자 등록',
  AUDIT_LOG_SEARCH: '감사 기록 조회',
}

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]

export const AUDIT_OUTCOME_LABEL: Record<AuditOutcome, string> = {
  SUCCESS: '성공',
  DENIED: '거부',
  FAILURE: '실패',
}

/** 결과 표시용 CSS 클래스. 거부(401/403)는 보안상 눈에 띄어야 해서 빨강, 업무 실패는 노랑. */
export function auditOutcomeClass(outcome: AuditOutcome): string {
  return { SUCCESS: 'status-active', DENIED: 'status-closed', FAILURE: 'status-failed' }[outcome]
}

/** 누가 했는지. 토큰 없이 온 요청(로그인 시도 등)은 시도한 아이디 뒤에 표시를 붙인다. */
export function auditActor(entry: AuditLogEntry): string {
  const name = entry.actorUsername ?? '알 수 없음'
  if (entry.actorType === 'ADMIN') return `관리자 · ${name}`
  if (entry.actorType === 'CUSTOMER') return `고객 · ${name}`
  return entry.actorUsername ? `${name} (토큰 없음)` : '토큰 없음'
}

const FILTER_KEYS = ['actor', 'accountId', 'action', 'outcome', 'from', 'to'] as const

/** 주소(?actor=&page=)를 조회 조건으로. 모르는 action·outcome 은 버린다(서버가 400 으로 거부하므로). */
export function auditSearchFromParams(params: URLSearchParams): AuditSearch {
  const search: AuditSearch = { page: Math.max(0, Number(params.get('page') ?? 0) || 0) }
  for (const key of FILTER_KEYS) {
    const value = params.get(key)?.trim()
    if (!value) continue
    if (key === 'action' && !(value in AUDIT_ACTION_LABEL)) continue
    if (key === 'outcome' && !(value in AUDIT_OUTCOME_LABEL)) continue
    if (key === 'accountId' && !/^\d+$/.test(value)) continue
    ;(search as Record<string, string>)[key] = value
  }
  return search
}

/** 조회 조건을 주소로. 빈 값과 0쪽은 빼서 주소를 짧게 둔다. */
export function auditSearchToParams(search: AuditSearch): Record<string, string> {
  const params: Record<string, string> = {}
  for (const key of FILTER_KEYS) {
    const value = search[key]
    if (value) params[key] = value
  }
  if (search.page) params.page = String(search.page)
  return params
}
