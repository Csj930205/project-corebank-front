import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequireAdmin, RequireCustomer } from '../components/RequireAuth'
import { clearSession, getSession, saveSession } from '../lib/session'
import { LoginPage } from './LoginPage'

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 }, queries: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin/*"
            element={
              <RequireAdmin>
                <p>관리자 화면</p>
              </RequireAdmin>
            }
          />
          <Route
            path="/my"
            element={
              <RequireCustomer>
                <p>내 계좌 화면</p>
              </RequireCustomer>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function tokenResponse(role: 'ADMIN' | 'CUSTOMER') {
  return new Response(
    JSON.stringify({
      accessToken: `tok-${role}`,
      tokenType: 'Bearer',
      expiresIn: 1800,
      expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
      username: role === 'ADMIN' ? 'admin' : 'kim',
      role,
      name: role === 'ADMIN' ? null : '김고객',
      adminRole: role === 'ADMIN' ? 'TELLER' : null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

async function logIn(username: string, password: string) {
  await userEvent.type(screen.getByLabelText('아이디'), username)
  await userEvent.type(screen.getByLabelText('비밀번호'), password)
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
}

afterEach(() => {
  clearSession()
  sessionStorage.clear()
})

describe('로그인', () => {
  it('관리자 전용 문구가 아닌 공용 "로그인" 화면이고, 가입 링크가 있다', () => {
    renderAt('/login')
    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup')
  })

  it('로그인하지 않고 관리자 화면에 가면 로그인 화면으로 보낸다', () => {
    renderAt('/admin')
    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(screen.queryByText('관리자 화면')).not.toBeInTheDocument()
  })

  it('관리자 계정이면 관리자 토큰을 저장하고 원래 보려던 관리자 화면으로 간다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse('ADMIN'))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/admin/closings')

    await logIn('admin', 'secret-password')

    expect(await screen.findByText('관리자 화면')).toBeInTheDocument()
    expect(getSession()).toMatchObject({ accessToken: 'tok-ADMIN', role: 'ADMIN' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ username: 'admin', password: 'secret-password' })
  })

  it('고객 계정이면 같은 화면에서 로그인해 내 계좌로 간다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenResponse('CUSTOMER')))
    renderAt('/login')

    await logIn('kim', 'customer-password')

    expect(await screen.findByText('내 계좌 화면')).toBeInTheDocument()
    expect(getSession()).toMatchObject({ role: 'CUSTOMER', name: '김고객' })
  })

  it('고객이 관리자 화면에서 로그인하면 관리자 화면 대신 내 계좌로 간다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenResponse('CUSTOMER')))
    renderAt('/admin')

    await logIn('kim', 'customer-password')

    expect(await screen.findByText('내 계좌 화면')).toBeInTheDocument()
    expect(screen.queryByText('관리자 화면')).not.toBeInTheDocument()
  })

  it('로그인한 고객이 관리자 주소를 직접 열어도 내 계좌로 보낸다', () => {
    saveSession({
      accessToken: 't',
      username: 'kim',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      role: 'CUSTOMER',
      name: '김고객',
      adminRole: null,
    })
    renderAt('/admin')
    expect(screen.getByText('내 계좌 화면')).toBeInTheDocument()
  })

  it('실패하면 안내하고 비밀번호 칸만 비운다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'x' }), { status: 401 }),
      ),
    )
    renderAt('/login')

    await logIn('admin', 'wrong')

    expect(await screen.findByText('아이디 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('아이디')).toHaveValue('admin')
    expect(screen.getByLabelText('비밀번호')).toHaveValue('')
    expect(getSession()).toBeNull()
  })

  it('실패가 쌓여 잠기면 서버가 알려 준 대기 시간을 그대로 보여 준다', async () => {
    const message = '로그인 실패가 너무 많아 잠겼습니다. 15분 뒤에 다시 시도하세요.'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'LOGIN_LOCKED', message }), {
          status: 429,
          headers: { 'Retry-After': '900' },
        }),
      ),
    )
    renderAt('/login')

    await logIn('kim', 'whatever')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(getSession()).toBeNull()
  })
})
