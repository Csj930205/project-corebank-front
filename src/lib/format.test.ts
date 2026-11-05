import { describe, expect, it } from 'vitest'
import { formatAccountNumber, formatDateTime, formatWon, parseAccountId, parseAccountNumber, parseAmount } from './format'

describe('formatWon', () => {
  it('천 단위 쉼표와 원', () => {
    expect(formatWon(15000)).toBe('15,000원')
    expect(formatWon(0)).toBe('0원')
  })
})

describe('formatDateTime', () => {
  it('서버 LocalDateTime 을 초 단위까지', () => {
    expect(formatDateTime('2026-11-03T13:09:36.795003')).toBe('2026-11-03 13:09:36')
  })
})

describe('parseAmount', () => {
  it('정수와 쉼표·공백 허용', () => {
    expect(parseAmount('10000')).toBe(10000)
    expect(parseAmount('10,000')).toBe(10000)
    expect(parseAmount(' 1 000 ')).toBe(1000)
  })

  it('서버와 같은 규칙으로 0, 음수, 소수, 문자, 빈 값 거부', () => {
    for (const input of ['0', '-1', '1.5', 'abc', '', '1e3']) {
      expect(parseAmount(input), input).toBeNull()
    }
  })

  it('JS 가 정확히 다룰 수 없는 큰 수 거부', () => {
    expect(parseAmount('9007199254740993')).toBeNull()
  })
})

describe('parseAccountId', () => {
  it('1 이상의 정수만', () => {
    expect(parseAccountId('12')).toBe(12)
    expect(parseAccountId('0')).toBeNull()
    expect(parseAccountId('a1')).toBeNull()
  })
})

describe('parseAccountNumber / formatAccountNumber', () => {
  it('하이픈·공백을 빼고 숫자 13자리만 받는다', () => {
    expect(parseAccountNumber('110-0000-000002')).toBe('1100000000002')
    expect(parseAccountNumber(' 1100000000002 ')).toBe('1100000000002')
    expect(parseAccountNumber('110000000000')).toBeNull()
    expect(parseAccountNumber('11000000000021')).toBeNull()
    expect(parseAccountNumber('110-abcd-000002')).toBeNull()
  })

  it('3-4-6 자리로 끊어 보여 준다', () => {
    expect(formatAccountNumber('1100000000002')).toBe('110-0000-000002')
  })
})
