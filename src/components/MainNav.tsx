import { Link, useLocation } from 'react-router'
import { useSession } from '../hooks/useSession'
import { navItemsFor } from '../lib/nav'

/**
 * 상단 바 안의 메뉴(로고 오른쪽). 로그인 상태에 따라 관리자·고객 메뉴가 다르고, 로그인 전에는 그리지 않는다(lib/nav).
 * NavLink 는 자기 주소만 강조하므로, 계좌 상세처럼 여러 주소가 한 메뉴에 속하는 경우를 위해 직접 고른다.
 */
export function MainNav() {
  const session = useSession()
  const { pathname } = useLocation()
  const items = navItemsFor(session?.role ?? null)
  if (items.length === 0) return null
  const label = session?.role === 'ADMIN' ? '관리자 메뉴' : '고객 메뉴'

  return (
    <nav className="mainnav" aria-label={label}>
      <div className="mainnav-inner">
        {items.map((item) => {
          const active = item.match(pathname)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`mainnav-link${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
