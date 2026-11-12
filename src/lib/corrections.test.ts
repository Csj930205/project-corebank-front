import { describe, expect, it } from 'vitest'
import type { Correction } from '../api/types'
import { canDecide, correctionEffect, isCorrectable, statusFromParam } from './corrections'

const BASE: Correction = {
  id: 1,
  status: 'REQUESTED',
  reason: '금액 오입력',
  requestedBy: 'maker',
  requestedAt: '2026-11-12T10:00:00',
  decidedBy: null,
  decidedAt: null,
  decisionComment: null,
  transactionId: 10,
  transactionType: 'DEPOSIT',
  amount: 90000,
  transactionAt: '2026-11-12T09:00:00',
  transferId: null,
  accountId: 3,
  accountNumber: '1100000000003',
  ownerName: '홍길동',
  counterpartAccountNumber: null,
  reversalTransactionIds: [],
}

describe('거래 정정', () => {
  it('해지 지급과 정정 거래는 되돌릴 수 없다', () => {
    expect(isCorrectable('DEPOSIT')).toBe(true)
    expect(isCorrectable('TRANSFER_IN')).toBe(true)
    expect(isCorrectable('CLOSURE_PAYOUT')).toBe(false)
    expect(isCorrectable('REVERSAL_OUT')).toBe(false)
  })

  it('요청한 사람과 이미 결정된 요청은 결정할 수 없다', () => {
    expect(canDecide(BASE, 'checker')).toBe(true)
    expect(canDecide(BASE, 'maker')).toBe(false)
    expect(canDecide({ ...BASE, status: 'APPROVED' }, 'checker')).toBe(false)
  })

  it('승인하면 잔액이 어떻게 바뀌는지 알려 준다', () => {
    expect(correctionEffect(BASE)).toBe('1100000000003 잔액에서 90,000원을 뺍니다.')
    expect(correctionEffect({ ...BASE, transactionType: 'WITHDRAWAL' })).toBe(
      '1100000000003 잔액에 90,000원을 되돌려 넣습니다.',
    )
    expect(
      correctionEffect({ ...BASE, transactionType: 'TRANSFER_OUT', counterpartAccountNumber: '1100000000004' }),
    ).toBe('받은 계좌 1100000000004에서 90,000원을 빼서 보낸 계좌 1100000000003로 돌려줍니다.')
  })

  it('주소의 상태: 기본은 승인 대기, ALL 은 전체', () => {
    expect(statusFromParam(null)).toBe('REQUESTED')
    expect(statusFromParam('ALL')).toBeUndefined()
    expect(statusFromParam('REJECTED')).toBe('REJECTED')
    expect(statusFromParam('nonsense')).toBe('REQUESTED')
  })
})
