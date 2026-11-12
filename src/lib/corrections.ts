import type { Correction, CorrectionStatus, TransactionType } from '../api/types'
import { formatWon } from './format'

// 거래 종류 이름표는 일계표와 같은 것을 쓴다.
export { TRANSACTION_TYPE_LABEL } from './closing'

// 거래 정정 화면의 이름표와 계산. 화면 컴포넌트에서 떼어 두어 단위 테스트하기 쉽게 한다.

export const CORRECTION_STATUS_LABEL: Record<CorrectionStatus, string> = {
  REQUESTED: '승인 대기',
  APPROVED: '승인',
  REJECTED: '반려',
}

/** 승인은 돈이 움직였으니 초록, 반려는 빨강, 대기는 파랑(진행 중) */
export function correctionStatusClass(status: CorrectionStatus): string {
  return { REQUESTED: 'status-running', APPROVED: 'status-active', REJECTED: 'status-closed' }[status]
}

/** 서버 TransactionType.isCorrectable 과 같은 규칙. 해지 지급과 정정 거래는 되돌릴 수 없다. */
export function isCorrectable(type: TransactionType): boolean {
  return type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'TRANSFER_OUT' || type === 'TRANSFER_IN'
}

/**
 * 이 관리자가 결정(승인·반려)할 수 있는지. 본인이 올린 요청은 다른 관리자가 결정해야 한다(4-eyes).
 * 버튼을 숨기는 것은 편의이고, 실제로는 서버가 403 SELF_APPROVAL_NOT_ALLOWED 로 막는다.
 */
export function canDecide(correction: Correction, username: string | undefined): boolean {
  return correction.status === 'REQUESTED' && correction.requestedBy !== username
}

/** 승인하면 잔액이 어떻게 바뀌는지. 승인 버튼을 누르기 전에 보여 준다. */
export function correctionEffect(correction: Correction): string {
  const amount = formatWon(correction.amount)
  const account = correction.accountNumber ?? `계좌 #${correction.accountId}`
  switch (correction.transactionType) {
    case 'DEPOSIT':
      return `${account} 잔액에서 ${amount}을 뺍니다.`
    case 'WITHDRAWAL':
      return `${account} 잔액에 ${amount}을 되돌려 넣습니다.`
    case 'TRANSFER_OUT':
    case 'TRANSFER_IN':
      return `받은 계좌 ${correction.counterpartAccountNumber ?? ''}에서 ${amount}을 빼서 보낸 계좌 ${account}로 돌려줍니다.`
    default:
      return ''
  }
}

/** 주소의 ?status= 를 읽는다. 없으면 승인 대기, 'ALL' 이면 전체, 모르는 값도 승인 대기. */
export function statusFromParam(value: string | null): CorrectionStatus | undefined {
  if (value === 'ALL') return undefined
  if (value === 'APPROVED' || value === 'REJECTED') return value
  return 'REQUESTED'
}
