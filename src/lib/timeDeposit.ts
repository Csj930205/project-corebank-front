import type { TimeDepositEstimate, TimeDepositStatus } from '../api/types'

// 정기예금 화면의 표시. 계산은 서버가 한다(이자·세금·중도해지이율). 화면은 서버가 준 숫자를 보여 주기만 한다.

export const TIME_DEPOSIT_STATUS_LABEL: Record<TimeDepositStatus, string> = {
  ACTIVE: '가입 중',
  MATURED: '만기 해지',
  TERMINATED: '중도 해지',
}

export function timeDepositStatusClass(status: TimeDepositStatus): string {
  return { ACTIVE: 'status-active', MATURED: 'status-closed', TERMINATED: 'status-failed' }[status]
}

/** "12개월", 24개월 이상이 12의 배수면 "2년" */
export function formatTerm(months: number): string {
  return months >= 24 && months % 12 === 0 ? `${months / 12}년` : `${months}개월`
}

/** 해지 예상 안내 제목. 만기일 이후면 중도해지가 아니라 만기 해지다 */
export function quoteTitle(quote: TimeDepositEstimate): string {
  return quote.trigger === 'MATURITY' ? '오늘 해지하면 만기 해지입니다' : '오늘 중도해지하면'
}

/**
 * 가입 기간 진행률(0~100). 화면 막대 표시용. 날짜는 "YYYY-MM-DD" 문자열이고 시간대 영향을 받지 않게 UTC 로 센다.
 */
export function progressPercent(startDate: string, maturityDate: string, today: string): number {
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  const total = day(maturityDate) - day(startDate)
  if (total <= 0) return 100
  const elapsed = Math.min(Math.max(day(today) - day(startDate), 0), total)
  return Math.floor((elapsed / total) * 100)
}

/** 오늘 날짜 "YYYY-MM-DD" (브라우저 시각. 서버와 같은 PC 라 시간대가 같다) */
export function todayString(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
