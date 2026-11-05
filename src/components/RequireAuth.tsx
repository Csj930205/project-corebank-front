import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '../hooks/useSession'
import { homeFor } from '../lib/landing'
import type { Role } from '../lib/session'

/**
 * 로그인이 필요한 화면 보호. 로그인하지 않았거나 토큰이 만료됐으면 로그인 화면으로 보내고, 로그인 뒤 원래 화면으로 돌아오게 한다.
 * role 을 주면 그 역할만 들어올 수 있고, 다른 역할은 자기 첫 화면으로 보낸다(고객이 관리자 주소를 쳐도 내 계좌로).
 * 화면에서 막는 것은 편의일 뿐이고, 실제 보호는 서버가 토큰의 역할(scope)로 한다.
 */
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (role && session.role !== role) {
    return <Navigate to={homeFor(session.role)} replace />
  }
  return children
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  return <RequireAuth role="ADMIN">{children}</RequireAuth>
}

export function RequireCustomer({ children }: { children: ReactNode }) {
  return <RequireAuth role="CUSTOMER">{children}</RequireAuth>
}
