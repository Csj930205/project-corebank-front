import { describe, expect, it } from 'vitest'
import { closingDuration, localDate, mismatchValue, yesterday } from './closing'

describe('일 마감 도우미', () => {
  it('어제 날짜는 브라우저 시각 기준이다(UTC 로 바꾸지 않는다)', () => {
    // 한국 시각 새벽 1시에도 UTC 날짜(전날)가 아니라 한국 날짜의 전날이 나와야 한다.
    const now = new Date(2026, 10, 4, 1, 0, 0) // 2026-11-04 01:00 (로컬)
    expect(localDate(now)).toBe('2026-11-04')
    expect(yesterday(now)).toBe('2026-11-03')
  })

  it('월과 해가 바뀌는 날도 어제를 맞게 계산한다', () => {
    expect(yesterday(new Date(2027, 0, 1, 12))).toBe('2026-12-31')
    expect(yesterday(new Date(2026, 2, 1, 12))).toBe('2026-02-28')
  })

  it('걸린 시간: 1초 미만은 ms, 그 이상은 초, 끝나지 않았으면 null', () => {
    expect(closingDuration({ startedAt: '2026-11-04T10:00:00.000', finishedAt: '2026-11-04T10:00:00.319' })).toBe('319ms')
    expect(closingDuration({ startedAt: '2026-11-04T10:00:00', finishedAt: '2026-11-04T10:00:02.5' })).toBe('2.5초')
    expect(closingDuration({ startedAt: '2026-11-04T10:00:00', finishedAt: null })).toBeNull()
  })

  it('불일치 값: 금액은 원, 반쪽 이체는 건수, long 범위를 넘는 값도 정확히', () => {
    expect(mismatchValue('BALANCE_LEDGER_MISMATCH', '10001')).toBe('10,001원')
    expect(mismatchValue('INCOMPLETE_TRANSFER', '0')).toBe('0건')
    expect(mismatchValue('CLEARING_NOT_ZERO', '119903836479113528290')).toBe('119,903,836,479,113,528,290원')
    expect(mismatchValue('SNAPSHOT_MISMATCH', null)).toBe('-')
  })
})
