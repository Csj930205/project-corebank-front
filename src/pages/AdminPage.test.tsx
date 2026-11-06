import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AdminPage } from './AdminPage'

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const SUMMARY = {
  accountCount: 0,
  activeAccountCount: 0,
  closedAccountCount: 0,
  totalBalance: '0',
  transactionCount: 0,
  todayTransactionCount: 0,
  transferCount: 0,
  ledger: { balanced: true, debitMinusCredit: '0', clearingBalance: '0', mismatchedAccounts: 0 },
}
const EMPTY = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }

/** 요약과 목록 요청을 주소로 나눠 답하고, 목록 요청 주소를 모아 둔다. */
function mockApi() {
  const accountUrls: URL[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = new URL(input, 'http://x')
      if (url.pathname.endsWith('/admin/summary')) return Promise.resolve(json(SUMMARY))
      accountUrls.push(url)
      return Promise.resolve(json(EMPTY))
    }),
  )
  return accountUrls
}

function CurrentSearch() {
  return <output data-testid="location">{useLocation().search}</output>
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <>
                <AdminPage />
                <CurrentSearch />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('관리자 계좌 검색', () => {
  it('개설일·잔액 범위를 넣어 검색하면 주소와 요청에 담긴다(잔액 쉼표는 뺀다)', async () => {
    const urls = mockApi()
    renderAt('/admin?status=ACTIVE')
    const user = userEvent.setup()
    await screen.findByText('조건에 맞는 계좌가 없습니다')

    await user.type(screen.getByLabelText('개설일 시작'), '2026-11-01')
    await user.type(screen.getByLabelText('개설일 끝'), '2026-11-05')
    await user.type(screen.getByLabelText('최소 잔액(원)'), '10,000')
    await user.click(screen.getByRole('button', { name: '검색' }))

    await waitFor(() => expect(urls.at(-1)?.searchParams.get('minBalance')).toBe('10000'))
    const last = urls.at(-1)!.searchParams
    expect(last.get('openedFrom')).toBe('2026-11-01')
    expect(last.get('openedTo')).toBe('2026-11-05')
    expect(last.get('maxBalance')).toBeNull()
    // 상태 버튼으로 고른 조건은 검색해도 그대로
    expect(last.get('status')).toBe('ACTIVE')
    expect(screen.getByTestId('location').textContent).toBe(
      '?status=ACTIVE&openedFrom=2026-11-01&openedTo=2026-11-05&minBalance=10000',
    )
    expect(screen.getByText('검색어, 상태, 개설일·잔액 범위를 바꿔 보세요.')).toBeInTheDocument()
  })

  it('주소의 조건으로 입력칸을 채운다', async () => {
    mockApi()
    renderAt('/admin?openedTo=2026-11-05&maxBalance=1000000')

    expect(await screen.findByLabelText('개설일 끝')).toHaveValue('2026-11-05')
    expect(screen.getByLabelText('최대 잔액(원)')).toHaveValue('1,000,000')
  })

  it('거꾸로 된 범위나 잘못된 잔액은 요청하지 않고 알려 준다', async () => {
    const urls = mockApi()
    renderAt('/admin')
    const user = userEvent.setup()
    await screen.findByText('조건에 맞는 계좌가 없습니다')
    const before = urls.length

    await user.type(screen.getByLabelText('최소 잔액(원)'), '5000')
    await user.type(screen.getByLabelText('최대 잔액(원)'), '1000')
    await user.click(screen.getByRole('button', { name: '검색' }))
    expect(screen.getByRole('alert')).toHaveTextContent('최소 잔액이 최대 잔액보다 큽니다.')

    await user.clear(screen.getByLabelText('최대 잔액(원)'))
    await user.type(screen.getByLabelText('최대 잔액(원)'), '-1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '검색' }))
    expect(screen.getByRole('alert')).toHaveTextContent('잔액은 0 이상의 원 단위 숫자로 입력해 주세요.')

    expect(urls.length).toBe(before)
  })

  it('초기화하면 범위 조건이 모두 빠진다', async () => {
    const urls = mockApi()
    renderAt('/admin?query=홍&minBalance=0&openedFrom=2026-11-01')
    const user = userEvent.setup()
    await screen.findByText('조건에 맞는 계좌가 없습니다')

    await user.click(screen.getByRole('button', { name: '초기화' }))

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(''))
    expect(urls.at(-1)!.searchParams.get('minBalance')).toBeNull()
    expect(screen.getByLabelText('검색어')).toHaveValue('')
  })
})
