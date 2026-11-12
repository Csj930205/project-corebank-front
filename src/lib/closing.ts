import type { ClosingStatus, ClosingSummary, MismatchType, TransactionType } from '../api/types'

// 일 마감 화면에서 쓰는 이름표와 계산. 화면 컴포넌트에서 떼어 두어 단위 테스트하기 쉽게 한다.

export const CLOSING_STATUS_LABEL: Record<ClosingStatus, string> = {
  RUNNING: '실행 중',
  BALANCED: '정상',
  UNBALANCED: '불일치',
  FAILED: '실패',
}

export const MISMATCH_LABEL: Record<MismatchType, string> = {
  BALANCE_LEDGER_MISMATCH: '현재 잔액 ≠ 원장',
  SNAPSHOT_MISMATCH: '마감 시점 잔액 ≠ 원장',
  UNBALANCED_TRANSACTION: '차변 ≠ 대변',
  INCOMPLETE_TRANSFER: '반쪽 이체',
  CLEARING_NOT_ZERO: '이체 가계정 ≠ 0',
}

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  DEPOSIT: '입금',
  WITHDRAWAL: '출금',
  TRANSFER_OUT: '이체 출금',
  TRANSFER_IN: '이체 입금',
  CLOSURE_PAYOUT: '해지 지급',
  REVERSAL_OUT: '정정(차감)',
  REVERSAL_IN: '정정(환입)',
}

/** 일계표 표시 순서. 서버는 이름순으로 주므로 업무 순서로 다시 정렬한다. */
export const TRANSACTION_TYPE_ORDER: TransactionType[] = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'CLOSURE_PAYOUT',
  'REVERSAL_OUT',
  'REVERSAL_IN',
]

/** 상태 표시용 CSS 클래스 */
export function closingStatusClass(status: ClosingStatus): string {
  return {
    RUNNING: 'status-running',
    BALANCED: 'status-active',
    UNBALANCED: 'status-closed',
    FAILED: 'status-failed',
  }[status]
}

/** 브라우저(서버와 같은 PC) 시각 기준 YYYY-MM-DD. toISOString 은 UTC 라 한국 시각 0~9시에 하루 어긋난다. */
export function localDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 마감할 수 있는 가장 최근 날짜(어제). 오늘은 아직 끝나지 않아 서버가 거부한다. */
export function yesterday(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return localDate(d)
}

/** 걸린 시간. 1초 미만은 ms, 그 이상은 초로 보여 준다. 끝나지 않았으면 null */
export function closingDuration(closing: Pick<ClosingSummary, 'startedAt' | 'finishedAt'>): string | null {
  if (!closing.finishedAt) return null
  const ms = Date.parse(closing.finishedAt) - Date.parse(closing.startedAt)
  if (Number.isNaN(ms) || ms < 0) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}초`
}

/** 불일치 값 표시. 반쪽 이체는 금액이 아니라 원장 거래 건수다. */
export function mismatchValue(type: MismatchType, value: string | null): string {
  if (value === null) return '-'
  const n = (() => {
    try {
      return BigInt(value).toLocaleString('ko-KR')
    } catch {
      return value
    }
  })()
  return type === 'INCOMPLETE_TRANSFER' ? `${n}건` : `${n}원`
}
