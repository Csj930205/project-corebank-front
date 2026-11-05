import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { clearSession } from '../lib/session'

/**
 * 로그아웃. 서버는 토큰을 저장하지 않으므로, 로그아웃은 화면이 토큰과 받아 둔 데이터를 버리는 것이다.
 *
 * 왜 따로 화면을 두나: 보호된 화면에서 바로 토큰을 지우면, 처음 화면으로 이동하기 전에 RequireAuth 가 먼저
 * "로그인 안 됨"을 보고 로그인 화면으로 보내 버린다(로그인 상태 변경이 화면 이동보다 먼저 그려진다).
 * 보호되지 않는 이 화면으로 먼저 옮긴 뒤 지우면 순서 문제가 없다.
 */
export function LogoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    clearSession()
    // 다음 사람이 같은 탭에서 로그인해도 이전 사용자의 계좌·거래내역이 캐시에서 보이지 않게 모두 버린다.
    queryClient.clear()
    navigate('/login', { replace: true })
  }, [navigate, queryClient])

  return <p className="muted">로그아웃하는 중…</p>
}
