import { describe, expect, it } from 'vitest'
import type { AuditLogEntry } from '../api/types'
import { auditActor, auditSearchFromParams, auditSearchToParams } from './audit'

const BASE: AuditLogEntry = {
  id: 1,
  occurredAt: '2026-11-05T14:00:00.000',
  requestId: 'r',
  actorType: 'ADMIN',
  actorUsername: 'admin',
  customerId: null,
  action: 'LOGIN',
  httpMethod: 'POST',
  path: '/auth/login',
  statusCode: 200,
  outcome: 'SUCCESS',
  errorCode: null,
  targetAccountId: null,
  counterpartAccountId: null,
  clientIp: '127.0.0.1',
  userAgent: null,
  durationMs: 3,
}

describe('auditActor', () => {
  it('토큰 주인은 역할과 아이디로, 토큰 없는 시도는 그렇다고 표시한다', () => {
    expect(auditActor(BASE)).toBe('관리자 · admin')
    expect(auditActor({ ...BASE, actorType: 'CUSTOMER', actorUsername: 'kim' })).toBe('고객 · kim')
    expect(auditActor({ ...BASE, actorType: 'ANONYMOUS', actorUsername: 'kim' })).toBe('kim (토큰 없음)')
    expect(auditActor({ ...BASE, actorType: 'ANONYMOUS', actorUsername: null })).toBe('토큰 없음')
  })
})

describe('감사 조회 조건 ↔ 주소', () => {
  it('주소의 조건을 읽고, 서버가 거부할 값은 버린다', () => {
    const params = new URLSearchParams('actor=%20kim%20&accountId=12x&action=NOPE&outcome=DENIED&from=2026-11-01&page=2')
    expect(auditSearchFromParams(params)).toEqual({ page: 2, actor: 'kim', outcome: 'DENIED', from: '2026-11-01' })
  })

  it('빈 값과 0쪽은 주소에 넣지 않는다', () => {
    expect(auditSearchToParams({ page: 0, actor: '', accountId: '7', action: 'DEPOSIT' })).toEqual({
      accountId: '7',
      action: 'DEPOSIT',
    })
    expect(auditSearchToParams({ page: 3 })).toEqual({ page: '3' })
  })
})
