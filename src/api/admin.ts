import { request } from './client'
import type {
  AccountStatus,
  AdminAccountPage,
  AdminSummary,
  AuditAction,
  AuditLogPage,
  AuditOutcome,
  ClosingDetail,
  ClosingPage,
} from './types'

// 관리자 API. 모두 관리자 토큰(auth: true)을 보낸다. 로그인은 auth.ts.

export interface AccountSearch {
  query?: string
  status?: AccountStatus
  page?: number
  size?: number
}

export async function getAdminAccounts(search: AccountSearch, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(search.page ?? 0), size: String(search.size ?? 20) })
  if (search.query) params.set('query', search.query)
  if (search.status) params.set('status', search.status)
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
