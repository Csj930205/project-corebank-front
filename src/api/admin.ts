import { request } from './client'
import type {
  AccountStatus,
  AdminAccountPage,
  AdminRole,
  AdminUser,
  AccrualResult,
  DepositProduct,
  InterestPaymentPage,
  SettlementResult,
  AdminSummary,
  AuditAction,
  AuditLogPage,
  AuditOutcome,
  ClosingDetail,
  ClosingPage,
  Correction,
  CorrectionPage,
  CorrectionStatus,
  LoginLock,
} from './types'

// 관리자 API. 모두 관리자 토큰(auth: true)을 보낸다. 로그인은 auth.ts.

/** 계좌 검색 조건. 빈 값은 보내지 않는다. 개설일은 YYYY-MM-DD, 잔액은 원이고 모두 양 끝을 포함한다. */
export interface AccountSearch {
  query?: string
  status?: AccountStatus
  openedFrom?: string
  openedTo?: string
  minBalance?: number
  maxBalance?: number
  page?: number
  size?: number
}

export async function getAdminAccounts(search: AccountSearch, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(search.page ?? 0), size: String(search.size ?? 20) })
  if (search.query) params.set('query', search.query)
  if (search.status) params.set('status', search.status)
  if (search.openedFrom) params.set('openedFrom', search.openedFrom)
  if (search.openedTo) params.set('openedTo', search.openedTo)
  if (search.minBalance !== undefined) params.set('minBalance', String(search.minBalance))
  if (search.maxBalance !== undefined) params.set('maxBalance', String(search.maxBalance))
  return (await request<AdminAccountPage>('GET', `/admin/accounts?${params}`, { auth: true, signal })).data
}

export async function getAdminSummary(signal?: AbortSignal) {
  return (await request<AdminSummary>('GET', '/admin/summary', { auth: true, signal })).data
}

/** 일 마감 실행. 서버는 배치가 끝날 때까지 기다렸다가 결과를 돌려준다(보통 1초 안팎, 계좌가 많으면 더 걸린다). */
export async function runClosing(businessDate: string) {
  return (await request<ClosingDetail>('POST', '/admin/closings', { body: { businessDate }, auth: true })).data
}

export async function getClosings(page: number, size = 20, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  return (await request<ClosingPage>('GET', `/admin/closings?${params}`, { auth: true, signal })).data
}

export async function getClosing(id: number, signal?: AbortSignal) {
  return (await request<ClosingDetail>('GET', `/admin/closings/${id}`, { auth: true, signal })).data
}

/** 감사 로그 조회 조건. 빈 값은 보내지 않는다. from, to 는 YYYY-MM-DD 이고 양 끝을 포함한다. */
export interface AuditSearch {
  actor?: string
  accountId?: string
  action?: AuditAction
  outcome?: AuditOutcome
  from?: string
  to?: string
  page?: number
}

export async function getAuditLogs(search: AuditSearch, size = 50, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(search.page ?? 0), size: String(size) })
  for (const key of ['actor', 'accountId', 'action', 'outcome', 'from', 'to'] as const) {
    const value = search[key]
    if (value) params.set(key, value)
  }
  return (await request<AuditLogPage>('GET', `/admin/audit-logs?${params}`, { auth: true, signal })).data
}

/** 지금 잠긴 로그인 아이디(곧 풀리는 순서) */
export async function getLoginLocks(signal?: AbortSignal) {
  return (await request<{ content: LoginLock[] }>('GET', '/admin/login-locks', { auth: true, signal })).data.content
}

/** 로그인 잠금 해제. 잠기지 않은 아이디여도 성공(204)이다. 서버가 어떤 아이디가 있는지 알려 주지 않기 때문이다. */
export async function unlockLogin(username: string) {
  await request<void>('POST', `/admin/login-locks/${encodeURIComponent(username)}/unlock`, { auth: true })
}

// ───────── 거래 정정 ─────────
// 결정한 사람은 서버가 토큰으로 정한다. 그래서 본문에 요청자·승인자를 보내지 않는다.

export async function getCorrections(status: CorrectionStatus | undefined, page: number, size = 20, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (status) params.set('status', status)
  return (await request<CorrectionPage>('GET', `/admin/corrections?${params}`, { auth: true, signal })).data
}

/** 정정 요청. 원장은 아직 바뀌지 않고, 다른 관리자가 승인해야 역분개가 들어간다. */
export async function requestCorrection(transactionId: number, reason: string) {
  return (await request<Correction>('POST', '/admin/corrections', { body: { transactionId, reason }, auth: true })).data
}

/** 승인. 멱등성 키가 없다: 다시 보내면 이미 승인돼 409 로 끝나고 역분개가 두 번 들어가지 않는다. */
export async function approveCorrection(id: number, comment?: string) {
  const body = comment ? { comment } : undefined
  return (await request<Correction>('POST', `/admin/corrections/${id}/approval`, { body, auth: true })).data
}

export async function rejectCorrection(id: number, comment: string) {
  return (await request<Correction>('POST', `/admin/corrections/${id}/rejection`, { body: { comment }, auth: true }))
    .data
}

// ───────── 관리자 계정 ─────────

export async function getAdminUsers(signal?: AbortSignal) {
  return (await request<{ content: AdminUser[] }>('GET', '/admin/admins', { auth: true, signal })).data.content
}

/** 관리자 등록 요청(운영자). 책임자가 승인해야 로그인할 수 있다. */
export async function requestAdminUser(username: string, password: string, role: AdminRole) {
  return (await request<AdminUser>('POST', '/admin/admins', { body: { username, password, role }, auth: true })).data
}

/** 관리자 등록 승인(책임자) */
export async function approveAdminUser(id: number) {
  return (await request<AdminUser>('POST', `/admin/admins/${id}/approval`, { auth: true })).data
}

/** 관리자 등록 반려(책임자) */
export async function rejectAdminUser(id: number) {
  return (await request<AdminUser>('POST', `/admin/admins/${id}/rejection`, { auth: true })).data
}

// ───────── 예금 상품·이자 ─────────

/** 판매 중지 포함 전체 상품 */
export async function getAdminProducts(signal?: AbortSignal) {
  return (await request<{ content: DepositProduct[] }>('GET', '/admin/products', { auth: true, signal })).data.content
}

/** 상품 등록. annualRate 는 연이율(%), 0~20, 소수 둘째 자리까지 */
export async function createProduct(name: string, annualRate: number) {
  return (await request<DepositProduct>('POST', '/admin/products', { body: { name, annualRate }, auth: true })).data
}

export async function discontinueProduct(id: number) {
  return (await request<DepositProduct>('POST', `/admin/products/${id}/discontinuation`, { auth: true })).data
}

/** 하루치 적수 쌓기(수동). 매일 자동으로 돌고, 같은 날을 다시 실행해도 두 번 쌓이지 않는다 */
export async function accrueInterest(businessDate: string) {
  return (await request<AccrualResult>('POST', '/admin/interest/accruals', { body: { businessDate }, auth: true })).data
}

/** 월 결산(수동). month 는 "2026-11" */
export async function settleInterest(month: string) {
  return (await request<SettlementResult>('POST', '/admin/interest/settlements', { body: { month }, auth: true })).data
}

export async function getInterestPayments(page: number, size = 20, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  return (await request<InterestPaymentPage>('GET', `/admin/interest/payments?${params}`, { auth: true, signal })).data
}
