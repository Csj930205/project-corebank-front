import { NavLink } from 'react-router'

/** 관리자 화면 안의 메뉴. 계좌(요약·목록), 일 마감, 감사 로그, 로그인 잠금을 오간다. */
export function AdminNav() {
  return (
    <nav className="subnav" aria-label="관리자 메뉴">
      {/* end: /admin/closings 에 있을 때 "계좌" 가 함께 활성화되지 않도록 정확히 /admin 일 때만 */}
      <NavLink to="/admin" end>
        계좌
      </NavLink>
      <NavLink to="/admin/closings">일 마감</NavLink>
      <NavLink to="/admin/audit-logs">감사 로그</NavLink>
      <NavLink to="/admin/login-locks">로그인 잠금</NavLink>
    </nav>
  )
}
