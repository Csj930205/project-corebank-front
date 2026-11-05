import { useEffect, useSyncExternalStore } from 'react'
import { clearSession, getSession, subscribe } from '../lib/session'

/**
 * 지금 로그인한 사용자(관리자 또는 고객). 로그인·로그아웃·만료가 일어나면 이 값을 쓰는 모든 화면이 다시 그려진다.
 * 만료 시각이 되면 자동으로 로그아웃한다(서버도 그때부터 401 을 준다).
 */
export function useSession() {
  const session = useSyncExternalStore(subscribe, getSession, () => null)

  useEffect(() => {
    if (!session) return
    const remaining = Date.parse(session.expiresAt) - Date.now()
    const timer = setTimeout(clearSession, Math.max(remaining, 0))
    return () => clearTimeout(timer)
  }, [session])

  return session
}
