import { describe, expect, it } from 'vitest'
import { lockRemaining } from './loginLocks'

describe('lockRemaining', () => {
  const now = new Date('2026-11-05T15:00:00')

  it('남은 시간을 분 단위로 올림해 보여 준다', () => {
    expect(lockRemaining('2026-11-05T15:14:01', now)).toBe('15분 남음')
    expect(lockRemaining('2026-11-05T15:00:30', now)).toBe('1분 남음')
  })

  it('한 시간이 넘으면 시간과 분으로', () => {
    expect(lockRemaining('2026-11-05T16:30:00', now)).toBe('1시간 30분 남음')
  })

  it('이미 지났거나 읽을 수 없는 값이면 곧 풀린다고 한다', () => {
    expect(lockRemaining('2026-11-05T14:59:00', now)).toBe('곧 풀림')
    expect(lockRemaining('not-a-date', now)).toBe('곧 풀림')
  })
})
