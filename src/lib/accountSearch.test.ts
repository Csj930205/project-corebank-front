import { describe, expect, it } from 'vitest'
import {
  accountSearchFromParams,
  accountSearchToParams,
  hasRangeFilter,
  parseBalanceInput,
  rangeProblem,
} from './accountSearch'

describe('계좌 검색 조건', () => {
  it('주소의 조건을 읽고, 다시 주소로 바꾸면 같다', () => {
    const params = new URLSearchParams(
      'query=홍&status=ACTIVE&openedFrom=2026-11-01&openedTo=2026-11-05&minBalance=0&maxBalance=50000&page=2',
    )
    const search = accountSearchFromParams(params)

    expect(search).toEqual({
      query: '홍',
      status: 'ACTIVE',
      openedFrom: '2026-11-01',
      openedTo: '2026-11-05',
      minBalance: 0,
      maxBalance: 50000,
      page: 2,
    })
    expect(accountSearchToParams(search)).toEqual(Object.fromEntries(params))
  })

  it('형식이 틀린 값은 버린다(서버가 400 으로 거부하므로)', () => {
    const search = accountSearchFromParams(
      new URLSearchParams('status=NOPE&openedFrom=11/01&minBalance=-1&maxBalance=abc&page=x'),
    )
    expect(search).toEqual({ page: 0 })
  })

  it('잔액 0원은 조건이라 주소에 남고, 빈 값과 0쪽은 빠진다', () => {
    expect(accountSearchToParams({ minBalance: 0, query: '', page: 0 })).toEqual({ minBalance: '0' })
  })

  it('잔액 입력: 빈칸은 조건 없음, 쉼표 허용, 숫자가 아니면 null', () => {
    expect(parseBalanceInput('')).toBeUndefined()
    expect(parseBalanceInput(' ')).toBeUndefined()
    expect(parseBalanceInput('0')).toBe(0)
    expect(parseBalanceInput('1,000,000')).toBe(1_000_000)
    expect(parseBalanceInput('-5')).toBeNull()
    expect(parseBalanceInput('1.5')).toBeNull()
    expect(parseBalanceInput('99999999999999999999')).toBeNull()
  })

  it('거꾸로 된 범위를 알려 준다. 같은 값은 괜찮다', () => {
    expect(rangeProblem({ openedFrom: '2026-11-05', openedTo: '2026-11-01' })).toBe('개설일 시작이 끝보다 늦습니다.')
    expect(rangeProblem({ minBalance: 10, maxBalance: 9 })).toBe('최소 잔액이 최대 잔액보다 큽니다.')
    expect(rangeProblem({ openedFrom: '2026-11-05', openedTo: '2026-11-05', minBalance: 0, maxBalance: 0 })).toBeNull()
  })

  it('범위 조건이 있는지', () => {
    expect(hasRangeFilter({ query: '홍', status: 'ACTIVE' })).toBe(false)
    expect(hasRangeFilter({ minBalance: 0 })).toBe(true)
  })
})
