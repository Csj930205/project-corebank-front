import type { Role } from './session'

/** 상단 메뉴 한 칸. match 는 지금 주소가 이 메뉴에 속하는지(속하면 강조한다). */
export interface NavItem {
  to: string
  label: string
  match: (pathname: string) => boolean
}

const isAccountPage = (path: string) => path.startsWith('/accounts/')

/**
 * 관리자 메뉴. "계좌 조회·개설"(/)은 id 로 계좌를 열거나 새로 만드는 창구 화면이고, 계좌 상세(/accounts/:id)도 여기에 속한다.
 * "전체 계좌"(/admin)는 요약과 검색 목록이다.
 */
const ADMIN: NavItem[] = [
  { to: '/', label: '계좌 조회·개설', match: (p) => p === '/' || isAccountPage(p) },
  { to: '/admin', label: '전체 계좌', match: (p) => p === '/admin' },
  { to: '/admin/closings', label: '일 마감', match: (p) => p.startsWith('/admin/closings') },
  { to: '/admin/products', label: '상품·이자', match: (p) => p.startsWith('/admin/products') },
  { to: '/admin/corrections', label: '거래 정정', match: (p) => p.startsWith('/admin/corrections') },
  { to: '/admin/audit-logs', label: '감사 로그', match: (p) => p.startsWith('/admin/audit-logs') },
  { to: '/admin/login-locks', label: '로그인 잠금', match: (p) => p.startsWith('/admin/login-locks') },
  { to: '/admin/admins', label: '관리자 계정', match: (p) => p.startsWith('/admin/admins') },
]

/** 고객 메뉴. 고객 화면은 내 계좌 목록과 계좌 상세(입금·출금·이체·해지가 그 안에 있다)뿐이다. */
const CUSTOMER: NavItem[] = [{ to: '/my', label: '내 계좌', match: (p) => p === '/my' || isAccountPage(p) }]

/**
 * 로그인 상태(역할)에 따라 보여 줄 메뉴. 로그인 전에는 메뉴가 없고, 로그인·회원가입은 상단 바 오른쪽(App 의 UserMenu)에 있다.
 * 메뉴를 숨기는 것은 편의이고, 실제 보호는 RequireAuth 와 서버가 한다.
 */
export function navItemsFor(role: Role | null): NavItem[] {
  if (role === 'ADMIN') return ADMIN
  if (role === 'CUSTOMER') return CUSTOMER
  return []
}

/** 상단 로고를 눌렀을 때 가는 메인 화면. 관리자는 운영 콘솔 첫 화면, 고객은 내 계좌, 로그인 전이면 로그인 화면. */
export function mainPathFor(role: Role | null): string {
  if (role === 'ADMIN') return '/'
  if (role === 'CUSTOMER') return '/my'
  return '/login'
}
