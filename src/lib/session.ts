// 로그인 상태(액세스 토큰) 보관. 관리자와 고객이 같은 로그인 화면을 쓰고, 어느 쪽인지는 role 로 구분한다.
//
// 액세스 토큰은 sessionStorage 에 둔다. 새로 고침해도 유지되고, 탭을 닫으면 지워진다. 같은 페이지의 스크립트는 읽을 수
// 있으므로 XSS 에 취약하다. 그래서 서버는 액세스 토큰을 15분으로 짧게 두고, 오래 사는 리프레시 토큰은 스크립트가 읽을 수 없는
// HttpOnly 쿠키로만 준다(여기에 저장하지 않는다). 액세스 토큰이 만료되면 api/client.ts 가 쿠키로 새로 받는다.
// 저장소가 막힌 환경(개인정보 보호 모드 등)에서는 메모리에만 두고, 새로 고침하면 다시 로그인한다.

import type { AdminRole } from '../api/types'

export type Role = 'ADMIN' | 'CUSTOMER'

const ADMIN_ROLES: readonly string[] = ['TELLER', 'APPROVER', 'OPERATOR'] satisfies AdminRole[]

export interface Session {
  accessToken: string
  username: string
  /** ISO 시각. 액세스 토큰 만료. 지나도 로그인은 유지되고, 다음 요청 전에 리프레시한다 */
  expiresAt: string
  /**
   * ISO 시각. 리프레시 토큰 만료(쓰지 않고 30분, 리프레시할 때마다 늘어난다). 이 시각이 지나면 로그인이 끝난다.
   * 없으면(리프레시 기능 전 저장값) expiresAt 이 로그인의 끝이다.
   */
  refreshExpiresAt?: string
  role: Role
  /** 고객 이름. 관리자는 null */
  name: string | null
  /** 관리자 역할. 고객은 null */
  adminRole: AdminRole | null
}

// 이름을 바꿔, role 이 없던 예전(관리자 전용) 저장값은 읽지 않고 다시 로그인하게 한다.
const STORAGE_KEY = 'corebank.session'
const listeners = new Set<() => void>()
let current: Session | null = read()

function read(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    // 역할 기능 전에 저장된 관리자 세션(adminRole 없음)은 버리고 다시 로그인하게 한다. 그 토큰은 서버에서도 조회만 된다.
    const valid =
      parsed.role === 'CUSTOMER' || (parsed.role === 'ADMIN' && ADMIN_ROLES.includes(parsed.adminRole ?? ''))
    return parsed.accessToken && parsed.expiresAt && valid ? parsed : null
  } catch {
    return null
  }
}

function emit() {
  for (const listener of listeners) listener()
}

/** 로그인이 끝났는지(리프레시로도 이어 갈 수 없음) */
export function isExpired(session: Session, now = Date.now()): boolean {
  return Date.parse(loginExpiresAt(session)) <= now
}

/** 로그인이 끝나는 시각. 리프레시 토큰 만료, 없으면 액세스 토큰 만료 */
export function loginExpiresAt(session: Session): string {
  return session.refreshExpiresAt ?? session.expiresAt
}

/** 액세스 토큰이 만료됐거나 곧(skewMs 안에) 만료되는지. 그러면 요청 전에 리프레시한다 */
export function isAccessTokenStale(session: Session, now = Date.now(), skewMs = 10_000): boolean {
  return Date.parse(session.expiresAt) - skewMs <= now
}

/** 유효한 세션. 만료됐으면 지우고 null */
export function getSession(): Session | null {
  if (current && isExpired(current)) {
    clearSession()
  }
  return current
}

export function saveSession(session: Session): void {
  current = session
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // 저장소가 막혀도 이 탭에서는 메모리로 계속 쓴다
  }
  emit()
}

export function clearSession(): void {
  if (current === null) return
  current = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 무시
  }
  emit()
}

/** React 의 useSyncExternalStore 용 구독 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
