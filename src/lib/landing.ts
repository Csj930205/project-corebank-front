import type { Role } from './session'

/** 로그인 뒤 첫 화면. 관리자는 관리자 화면, 고객은 내 계좌. */
export function homeFor(role: Role): string {
  return role === 'ADMIN' ? '/admin' : '/my'
}

/**
 * 로그인 전에 보려던 화면(from)으로 돌려보내도 되는지. 관리자는 어디든 되고, 고객은 관리자 화면과 운영 콘솔 첫 화면(/)을
 * 쓸 수 없으므로 그런 곳이었으면 고객 첫 화면으로 보낸다. 다른 사이트 주소(//evil.com 등)로는 보내지 않는다.
 */
export function landingAfterLogin(role: Role, from: string | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//')) return homeFor(role)
  if (role === 'CUSTOMER' && (from === '/' || from === '/admin' || from.startsWith('/admin/'))) return homeFor(role)
  return from
}
