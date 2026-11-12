import type { AdminRole } from '../api/types'
import type { Session } from './session'

/**
 * 화면에서 할 수 있는 변경. 서버 SecurityConfig 의 역할 표와 같다. 조회는 모든 관리자가 한다.
 *
 * - MOVE_MONEY: 계좌 개설·입출금·이체·해지. 관리자 중에는 창구만, 고객은 본인 계좌에서
 * - REQUEST_CORRECTION: 거래 정정 요청(창구)
 * - APPROVE: 거래 정정·관리자 등록의 승인과 반려(책임자)
 * - OPERATE: 일 마감, 이자, 상품, 로그인 잠금 해제, 관리자 등록 요청(운영)
 *
 * 버튼을 숨기는 것은 편의다. 실제로 막는 것은 서버다(역할이 아니면 403).
 */
export type Permission = 'MOVE_MONEY' | 'REQUEST_CORRECTION' | 'APPROVE' | 'OPERATE'

export const PERMISSION_OWNER: Record<Permission, AdminRole> = {
  MOVE_MONEY: 'TELLER',
  REQUEST_CORRECTION: 'TELLER',
  APPROVE: 'APPROVER',
  OPERATE: 'OPERATOR',
}

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  TELLER: '창구',
  APPROVER: '책임자',
  OPERATOR: '운영',
}

export const ADMIN_ROLE_DESCRIPTION: Record<AdminRole, string> = {
  TELLER: '계좌 개설·입출금·이체·해지, 거래 정정 요청',
  APPROVER: '거래 정정과 관리자 등록의 승인·반려',
  OPERATOR: '일 마감, 이자, 상품, 로그인 잠금 해제, 관리자 등록 요청',
}

export function can(session: Session | null, permission: Permission): boolean {
  if (!session) return false
  if (session.role === 'CUSTOMER') return permission === 'MOVE_MONEY'
  return session.adminRole === PERMISSION_OWNER[permission]
}

/** 권한이 없을 때 보여 줄 안내. 예: "창구 역할만 할 수 있습니다." */
export function roleOnlyHint(permission: Permission): string {
  return `${ADMIN_ROLE_LABEL[PERMISSION_OWNER[permission]]} 역할만 할 수 있습니다.`
}
