import type { AccountSearch } from '../api/admin'
import type { AccountStatus } from '../api/types'

/**
 * 관리자 계좌 검색 조건 ↔ 주소(?query=&status=&openedFrom=&openedTo=&minBalance=&maxBalance=&page=).
 * 조건을 주소에 담아 새로 고침·뒤로 가기·링크 공유에도 그대로 남게 한다.
 */

const STATUSES: AccountStatus[] = ['ACTIVE', 'CLOSED']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const WON = /^\d+$/

/** 주소를 검색 조건으로. 형식이 틀린 값(손으로 고친 주소 등)은 서버가 400 으로 거부하므로 버린다. */
export function accountSearchFromParams(params: URLSearchParams): AccountSearch {
  const get = (key: string) => params.get(key)?.trim() || undefined
  const status = get('status') as AccountStatus | undefined
  const date = (key: string) => {
    const value = get(key)
    return value && DATE.test(value) ? value : undefined
  }
  const won = (key: string) => {
    const value = get(key)
    return value && WON.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined
  }
  return {
    query: get('query'),
    status: status && STATUSES.includes(status) ? status : undefined,
    openedFrom: date('openedFrom'),
    openedTo: date('openedTo'),
    minBalance: won('minBalance'),
    maxBalance: won('maxBalance'),
    page: Math.max(0, Number(params.get('page') ?? 0) || 0),
  }
}

/** 검색 조건을 주소로. 빈 값과 0쪽은 빼서 주소를 짧게 둔다. 잔액 0 은 조건이므로 남긴다. */
export function accountSearchToParams(search: AccountSearch): Record<string, string> {
  const params: Record<string, string> = {}
  if (search.query) params.query = search.query
  if (search.status) params.status = search.status
  if (search.openedFrom) params.openedFrom = search.openedFrom
  if (search.openedTo) params.openedTo = search.openedTo
  if (search.minBalance !== undefined) params.minBalance = String(search.minBalance)
  if (search.maxBalance !== undefined) params.maxBalance = String(search.maxBalance)
  if (search.page) params.page = String(search.page)
  return params
}

/** 잔액 입력칸. 비우면 조건 없음(undefined), 쉼표·공백은 허용, 0원부터. 숫자가 아니면 null. */
export function parseBalanceInput(input: string): number | undefined | null {
  const normalized = input.replace(/[,\s]/g, '')
  if (normalized === '') return undefined
  if (!WON.test(normalized)) return null
  const amount = Number(normalized)
  return Number.isSafeInteger(amount) ? amount : null
}

/** 시작이 끝보다 큰 범위. 서버는 빈 목록을 주지만, 화면에서는 잘못 넣은 것으로 보고 먼저 알려 준다. */
export function rangeProblem(search: AccountSearch): string | null {
  if (search.openedFrom && search.openedTo && search.openedFrom > search.openedTo) {
    return '개설일 시작이 끝보다 늦습니다.'
  }
  if (search.minBalance !== undefined && search.maxBalance !== undefined && search.minBalance > search.maxBalance) {
    return '최소 잔액이 최대 잔액보다 큽니다.'
  }
  return null
}

/** 검색어 말고도 조건이 걸려 있는지. 빈 결과 안내 문구를 고를 때 쓴다. */
export function hasRangeFilter(search: AccountSearch): boolean {
  return Boolean(
    search.openedFrom || search.openedTo || search.minBalance !== undefined || search.maxBalance !== undefined,
  )
}
