import { request } from './client'
import type { AccountStatus, AdminAccountPage, AdminSummary, ClosingDetail, ClosingPage } from './types'

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
