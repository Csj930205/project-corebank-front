import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router'
import { BrandMark } from './components/icons'
import { RequireAdmin, RequireAuth, RequireCustomer } from './components/RequireAuth'
import { useSession } from './hooks/useSession'
import { homeFor } from './lib/landing'
import { AccountPage } from './pages/AccountPage'
import { AdminPage } from './pages/AdminPage'
import { AuditLogsPage } from './pages/AuditLogsPage'
import { ClosingDetailPage } from './pages/ClosingDetailPage'
import { ClosingsPage } from './pages/ClosingsPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { LogoutPage } from './pages/LogoutPage'
import { MyAccountsPage } from './pages/MyAccountsPage'
import { SignUpPage } from './pages/SignUpPage'

function UserMenu() {
  const session = useSession()
  const navigate = useNavigate()

  if (!session) {
    return (
      <NavLink to="/login" className="nav-link">
        로그인
      </NavLink>
    )
  }

  return (
    <div className="admin-menu">
      <NavLink to={homeFor(session.role)} className="nav-link">
        {session.role === 'ADMIN' ? `관리자 · ${session.username}` : `${session.name ?? session.username}님`}
      </NavLink>
      {/* 실제 로그아웃은 LogoutPage 가 한다. 이유는 그 파일 주석 참고 */}
      <button type="button" className="link-button" onClick={() => navigate('/logout')}>
        로그아웃
      </button>
    </div>
  )
}

export default function App() {
  const session = useSession()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          Corebank <small>{session?.role === 'CUSTOMER' ? '인터넷뱅킹' : '운영 콘솔'}</small>
        </Link>
        <div className="topbar-right">
          <span className="env">개발 서버 연결됨 · localhost:8080</span>
          <UserMenu />
        </div>
      </header>
      <main className="content">
        <Routes>
          {/* 운영 콘솔 첫 화면은 관리자만. 고객은 내 계좌(/my)로, 로그인 전이면 로그인 화면으로 간다. */}
          <Route
            path="/"
            element={
              <RequireAdmin>
                <HomePage />
              </RequireAdmin>
            }
          />
          {/* 계좌 화면은 관리자와 고객 모두. 고객이 남의 계좌를 열면 서버가 404 로 숨긴다. */}
          <Route
            path="/accounts/:id"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route
            path="/my"
            element={
              <RequireCustomer>
                <MyAccountsPage />
              </RequireCustomer>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          {/* 예전 관리자 로그인 주소 */}
          <Route path="/admin/login" element={<Navigate to="/login" replace />} />
          <Route path="/logout" element={<LogoutPage />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/closings"
            element={
              <RequireAdmin>
                <ClosingsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/closings/:id"
            element={
              <RequireAdmin>
                <ClosingDetailPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <RequireAdmin>
                <AuditLogsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="*"
            element={
              <div className="empty">
                <strong>없는 화면입니다</strong>
                <Link to="/">처음으로 돌아가기</Link>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
