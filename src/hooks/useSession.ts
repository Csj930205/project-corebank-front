import { useEffect, useSyncExternalStore } from 'react'
import { clearSession, getSession, loginExpiresAt, subscribe } from '../lib/session'

/**
 * 지금 로그인한 사용자(관리자 또는 고객). 로그인·로그아웃·만료가 일어나면 이 값을 쓰는 모든 화면이 다시 그려진다.
 *
 * 로그인이 끝나는 시각(리프레시 토큰 만료)이 되면 자동으로 로그아웃한다. 액세스 토큰 만료(15분)로는 로그아웃하지 않는다.
 * 그때는 다음 요청이 리프레시한다(api/client.ts). 타이머로 미리 리프레시하지 않는 이유: 그러면 아무것도 하지 않고 화면만
 * 열어 둬도 로그인이 끝없이 이어진다. 요청이 있을 때만 리프레시해야 "30분 동안 쓰지 않으면 로그아웃" 이 지켜진다.
 */
export function useSession() {
  const session = useSyncExternalStore(subscribe, getSession, () => null)

  useEffect(() => {
    if (!session) return
    const remaining = Date.parse(loginExpiresAt(session)) - Date.now()
    const timer = setTimeout(clearSession, Math.max(remaining, 0))
    return () => clearTimeout(timer)
  }, [session])

  return session
}
