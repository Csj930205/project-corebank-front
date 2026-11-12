import { describe, expect, it } from 'vitest'
import type { AdminRole } from '../api/types'
import { can, roleOnlyHint, type Permission } from './roles'
import type { Session } from './session'

const admin = (adminRole: AdminRole): Session => ({
  accessToken: 't',
  username: 'a',
  expiresAt: '2099-01-01T00:00:00Z',
  role: 'ADMIN',
  name: null,
  adminRole,
})
const customer: Session = { ...admin('TELLER'), role: 'CUSTOMER', adminRole: null, name: '고객' }
const ALL: Permission[] = ['MOVE_MONEY', 'REQUEST_CORRECTION', 'APPROVE', 'OPERATE']
const allowed = (session: Session | null) => ALL.filter((p) => can(session, p))

describe('역할별 권한', () => {
  it('관리자는 역할이 맡은 일만 한다', () => {
    expect(allowed(admin('TELLER'))).toEqual(['MOVE_MONEY', 'REQUEST_CORRECTION'])
    expect(allowed(admin('APPROVER'))).toEqual(['APPROVE'])
    expect(allowed(admin('OPERATOR'))).toEqual(['OPERATE'])
  })

  it('고객은 본인 계좌 거래만, 로그인 전에는 아무것도', () => {
    expect(allowed(customer)).toEqual(['MOVE_MONEY'])
    expect(allowed(null)).toEqual([])
  })

  it('안내 문구는 맡은 역할 이름', () => {
    expect(roleOnlyHint('APPROVE')).toBe('책임자 역할만 할 수 있습니다.')
    expect(roleOnlyHint('MOVE_MONEY')).toBe('창구 역할만 할 수 있습니다.')
  })
})
