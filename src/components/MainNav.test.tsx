import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { clearSession, saveSession, type Role } from '../lib/session'
import { MainNav } from './MainNav'

const login = (role: Role) =>
  saveSession({
    accessToken: 't',
    username: role === 'ADMIN' ? 'admin' : 'kim',
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    role,
    name: role === 'ADMIN' ? null : '김고객',
  })

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MainNav />
    </MemoryRouter>,
  )

afterEach(() => {
  clearSession()
  sessionStorage.clear()
})

describe('상단 메뉴 줄', () => {
  it('관리자는 운영 메뉴를 보고, 지금 화면이 강조된다', () => {
    login('ADMIN')
    renderAt('/admin/audit-logs')

    const nav = screen.getByRole('navigation', { name: '관리자 메뉴' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '전체 계좌' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: '계좌 조회·개설' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '감사 로그' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '일 마감' })).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('link', { name: '내 계좌' })).not.toBeInTheDocument()
  })

  it('고객은 내 계좌만 보고, 관리자 메뉴는 없다', () => {
    login('CUSTOMER')
    renderAt('/accounts/7')

    expect(screen.getByRole('link', { name: '내 계좌' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: '전체 계좌' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '감사 로그' })).not.toBeInTheDocument()
  })

  it('로그인 전에는 로그인·회원가입, 로그아웃하면 바로 바뀐다', () => {
    login('ADMIN')
    renderAt('/login')
    expect(screen.getByRole('link', { name: '전체 계좌' })).toBeInTheDocument()

    act(() => clearSession())

    expect(screen.queryByRole('link', { name: '전체 계좌' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup')
  })
})
