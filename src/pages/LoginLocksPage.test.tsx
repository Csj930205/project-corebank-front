import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession } from '../lib/session'
import { loginAdmin } from '../test/loginAdmin'
import type { LoginLock } from '../api/types'
import { LoginLocksPage } from './LoginLocksPage'

const KIM: LoginLock = { username: 'kim', failureCount: 5, lockedUntil: '2099-01-01T10:15:00.000' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** GET 은 목록, POST 는 204. 해제한 아이디는 다음 목록에서 빠진다. */
function fakeServer(initial: LoginLock[]) {
  let locks = [...initial]
  return vi.fn((url: string, init: RequestInit) => {
    if (init.method === 'POST') {
      const username = decodeURIComponent(url.split('/login-locks/')[1].replace('/unlock', ''))
      locks = locks.filter((l) => l.username !== username)
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(json({ content: locks }))
  })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/login-locks']}>
        <Routes>
          <Route path="/admin/login-locks" element={<LoginLocksPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('로그인 잠금 화면', () => {
  // 실행·변경 버튼은 운영 역할에게만 보인다.
  beforeEach(() => loginAdmin('OPERATOR'))
  afterEach(() => clearSession())

  it('잠긴 아이디와 실패 수, 로그인 기록 링크를 보여 준다', async () => {
    vi.stubGlobal('fetch', fakeServer([KIM]))
    renderPage()

    expect(await screen.findByText('kim')).toBeInTheDocument()
    expect(screen.getByText('5번')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인 기록' })).toHaveAttribute(
      'href',
      '/admin/audit-logs?actor=kim&action=LOGIN',
    )
  })

  it('해제는 두 번 눌러야 요청하고, 풀면 목록에서 빠진다', async () => {
    const fetchMock = fakeServer([KIM])
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'kim 잠금 해제' }))
    expect(fetchMock.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: '해제 확정' }))

    expect(await screen.findByText('kim 의 로그인 잠금을 풀었습니다.')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')!
    expect(post[0]).toBe('/api/admin/login-locks/kim/unlock')
    expect(await screen.findByText('지금 잠긴 아이디가 없습니다')).toBeInTheDocument()
  })

  it('취소하면 요청하지 않는다', async () => {
    const fetchMock = fakeServer([KIM])
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'kim 잠금 해제' }))
    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.getByRole('button', { name: 'kim 잠금 해제' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false)
  })

  it('목록에 없는 아이디도 직접 넣어 풀 수 있다. 앞뒤 공백은 지우고 주소에 맞게 바꿔 보낸다', async () => {
    const fetchMock = fakeServer([])
    vi.stubGlobal('fetch', fetchMock)
    renderPage()
    await screen.findByText('지금 잠긴 아이디가 없습니다')

    await userEvent.type(screen.getByLabelText('해제할 아이디'), ' kim lee ')
    await userEvent.click(screen.getByRole('button', { name: '잠금 해제' }))

    expect(await screen.findByText('kim lee 의 로그인 잠금을 풀었습니다.')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')!
    expect(post[0]).toBe('/api/admin/login-locks/kim%20lee/unlock')
  })
})
