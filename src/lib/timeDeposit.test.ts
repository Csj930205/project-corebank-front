import { describe, expect, it } from 'vitest'
import { formatTerm, progressPercent, quoteTitle, todayString } from './timeDeposit'

describe('timeDeposit', () => {
  it('기간은 개월로, 2년 이상 12의 배수는 년으로 보여 준다', () => {
    expect(formatTerm(1)).toBe('1개월')
    expect(formatTerm(12)).toBe('12개월')
    expect(formatTerm(18)).toBe('18개월')
    expect(formatTerm(36)).toBe('3년')
  })

  it('진행률은 가입일 0%, 만기일 100%이고 범위를 넘지 않는다', () => {
    expect(progressPercent('2026-01-01', '2027-01-01', '2026-01-01')).toBe(0)
    expect(progressPercent('2026-01-01', '2026-01-11', '2026-01-06')).toBe(50)
    expect(progressPercent('2026-01-01', '2027-01-01', '2027-03-01')).toBe(100)
    expect(progressPercent('2026-01-01', '2027-01-01', '2025-12-01')).toBe(0)
  })

  it('만기일 이후 해지 예상은 만기 해지로 안내한다', () => {
    const base = { appliedRate: 3.65, days: 30, grossInterest: 0, tax: 0, netInterest: 0, payout: 0 }
    expect(quoteTitle({ ...base, trigger: 'MATURITY' })).toBe('오늘 해지하면 만기 해지입니다')
    expect(quoteTitle({ ...base, trigger: 'EARLY_TERM' })).toBe('오늘 중도해지하면')
  })

  it('오늘 날짜는 YYYY-MM-DD', () => {
    expect(todayString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
