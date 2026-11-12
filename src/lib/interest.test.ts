import { describe, expect, it } from 'vitest'
import { formatRate, lastMonth, parseRate } from './interest'

describe('이자 표시와 입력', () => {
  it('금리는 소수 둘째 자리까지 보여 준다', () => {
    expect(formatRate(3.65)).toBe('연 3.65%')
    expect(formatRate(0.1)).toBe('연 0.10%')
  })

  it('금리 입력은 서버 규칙(0~20, 소수 둘째 자리)과 같다. 셋째 자리는 잘라 받지 않는다', () => {
    expect(parseRate('3.65')).toBe(3.65)
    expect(parseRate(' 20 ')).toBe(20)
    expect(parseRate('0')).toBe(0)
    expect(parseRate('1.234')).toBeNull()
    expect(parseRate('20.01')).toBeNull()
    expect(parseRate('-1')).toBeNull()
    expect(parseRate('abc')).toBeNull()
  })

  it('지난달은 해가 바뀌어도 맞다', () => {
    expect(lastMonth(new Date(2026, 0, 15))).toBe('2025-12')
    expect(lastMonth(new Date(2026, 10, 30))).toBe('2026-10')
  })
})
