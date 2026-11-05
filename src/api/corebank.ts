import { request } from './client'
import type { Account, AccountClosure, MyAccounts, Recipient, MoneyTransaction, TransactionHistory, TransferResult } from './types'

// 코어뱅킹 API 목록. 화면 코드는 fetch 를 직접 쓰지 않고 이 함수들만 쓴다.

/** 계좌 개설. 관리자는 예금주 이름이 필요하고, 고객은 이름 없이 보내면 본인 명의로 열린다. */
export function openAccount(ownerName?: string) {
  return request<Account>('POST', '/accounts', { body: ownerName === undefined ? {} : { ownerName } })
}

/** 내 계좌 목록(고객 토큰 전용). 최신 개설순. */
export async function getMyAccounts(signal?: AbortSignal) {
  return (await request<MyAccounts>('GET', '/accounts', { signal })).data.accounts
}

export async function getAccount(id: number, signal?: AbortSignal) {
  return (await request<Account>('GET', `/accounts/${id}`, { signal })).data
}

/** 입금. 돈이 움직이는 요청이라 멱등성 키가 필수다. */
export function deposit(accountId: number, amount: number, idempotencyKey: string) {
  return request<MoneyTransaction>('POST', `/accounts/${accountId}/deposits`, { body: { amount }, idempotencyKey })
}

export function withdraw(accountId: number, amount: number, idempotencyKey: string) {
  return request<MoneyTransaction>('POST', `/accounts/${accountId}/withdrawals`, { body: { amount }, idempotencyKey })
}

/** 이체. 받는 계좌는 계좌번호(숫자 13자리)로 정한다. 남의 계좌 id 는 알 수 없기 때문이다. */
export function transfer(fromAccountId: number, toAccountNumber: string, amount: number, idempotencyKey: string) {
  return request<TransferResult>('POST', '/transfers', {
    body: { fromAccountId, toAccountNumber, amount },
    idempotencyKey,
  })
}

/** 수취인 조회. 받는 계좌가 있고 받을 수 있는지, 예금주(가린 이름)가 누구인지. 없으면 404, 해지 계좌면 409. */
export async function lookupRecipient(accountNumber: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ accountNumber })
  return (await request<Recipient>('GET', `/accounts/lookup?${params}`, { signal })).data
}

/** 계좌 해지. 남은 잔액을 지급하고 CLOSED 로 바꾼다. 돈이 나가므로 멱등성 키가 필수다. 성공은 200 이다. */
export function closeAccount(accountId: number, idempotencyKey: string) {
  return request<AccountClosure>('POST', `/accounts/${accountId}/closure`, { idempotencyKey })
}

/** 거래내역. before 가 없으면 최신 거래부터, 있으면 그 거래보다 오래된 거래부터 size 건. */
export async function getHistory(accountId: number, before: number | null, size = 20, signal?: AbortSignal) {
  const params = new URLSearchParams({ size: String(size) })
  if (before !== null) {
    params.set('before', String(before))
  }
  return (await request<TransactionHistory>('GET', `/accounts/${accountId}/transactions?${params}`, { signal })).data
}
