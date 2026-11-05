// 로그인 상태(액세스 토큰) 보관. 관리자와 고객이 같은 로그인 화면을 쓰고, 어느 쪽인지는 role 로 구분한다.
//
// 토큰은 sessionStorage 에 둔다. 새로 고침해도 유지되고, 탭을 닫으면 지워진다. localStorage 보다 오래 남지 않지만,
// 같은 페이지의 스크립트는 읽을 수 있으므로 XSS 에는 똑같이 취약하다. 그래서 서버는 토큰 수명을 30분으로 짧게 둔다.
// 저장소가 막힌 환경(개인정보 보호 모드 등)에서는 메모리에만 두고, 새로 고침하면 다시 로그인한다.

export type Role = 'ADMIN' | 'CUSTOMER'

export interface Session {
  accessToken: string
  username: string
  /** ISO 시각. 서버가 준 만료 시각 */
  expiresAt: string
  role: Role
  /** 고객 이름. 관리자는 null */
  name: string | null
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
    return parsed.accessToken && parsed.expiresAt && (parsed.role === 'ADMIN' || parsed.role === 'CUSTOMER')
      ? parsed
      : null
  } catch {
    return null
  }
}

function emit() {
  for (const listener of listeners) listener()
}

export function isExpired(session: Session, now = Date.now()): boolean {
  return Date.parse(session.expiresAt) <= now
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
