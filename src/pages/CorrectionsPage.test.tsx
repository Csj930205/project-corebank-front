import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminRole, Correction } from '../api/types'
import { clearSession, saveSession } from '../lib/session'
import { CorrectionsPage } from './CorrectionsPage'

const REQUESTED: Correction = {
  id: 7,
  status: 'REQUESTED',
  reason: '10,000원을 100,000원으로 잘못 입력',
  requestedBy: 'maker',
  requestedAt: '2026-11-12T10:00:00',
  decidedBy: null,
  decidedAt: null,
  decisionComment: null,
  transactionId: 42,
  transactionType: 'DEPOSIT',
  amount: 90000,
  transactionAt: '2026-11-12T09:00:00',
  transferId: null,
  accountId: 3,
  accountNumber: '1100000000003',
  ownerName: '홍길동',
  counterpartAccountNumber: null,
  reversalTransactionIds: [],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function page(content: Correction[]) {
  return { content, page: 0, size: 20, totalElements: content.length, totalPages: 1 }
}

/** 목록은 지금 상태 그대로, 승인하면 APPROVED 로 바뀐다. 요청한 POST 는 calls 로 확인한다. */
function fakeServer(initial: Correction[]) {
  let items = [...initial]
  return vi.fn((url: string, init: RequestInit) => {
    if (init.method === 'POST' && url.endsWith('/approval')) {
      items = items.map((c) => ({ ...c, status: 'APPROVED' as const, decidedBy: 'checker', reversalTransactionIds: [99] }))
      return Promise.resolve(json(items[0]))
    }
    if (init.method === 'POST' && url.endsWith('/admin/corrections')) {
      return Promise.resolve(json({ ...REQUESTED, id: 8 }, 201))
    }
    const status = new URL(url, 'http://x').searchParams.get('status')
    return Promise.resolve(json(page(items.filter((c) => !status || c.status === status))))
  })
}

function renderPage(path = '/admin/corrections') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/corrections" element={<CorrectionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** maker 는 창구(요청), checker 는 책임자(승인) */
function loginAs(username: string, adminRole: AdminRole = username === 'checker' ? 'APPROVER' : 'TELLER') {
  saveSession({
    accessToken: 't',
    username,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    role: 'ADMIN',
    name: null,
    adminRole,
  })
}

describe('거래 정정 화면', () => {
  beforeEach(() => clearSession())
  afterEach(() => clearSession())

  it('본인이 올린 요청에는 승인·반려 버튼이 없다', async () => {
    loginAs('maker')
    vi.stubGlobal('fetch', fakeServer([REQUESTED]))
    renderPage()

    expect(await screen.findByText(/#7 · 입금 90,000원/)).toBeInTheDocument()
    expect(screen.getByText(/본인이 올린 요청입니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument()
  })

  it('다른 관리자는 무엇이 바뀌는지 본 뒤 승인 확정을 눌러야 승인된다', async () => {
    loginAs('checker')
    const fetchMock = fakeServer([REQUESTED])
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '승인' }))
    expect(fetchMock.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false)
    expect(screen.getByText('1100000000003 잔액에서 90,000원을 뺍니다.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '승인 확정' }))
    expect(fetchMock.mock.calls.some(([url, init]) => init.method === 'POST' && url.endsWith('/7/approval'))).toBe(true)
    // 승인되면 승인 대기 목록에서 빠진다.
    expect(await screen.findByText('승인을 기다리는 요청이 없습니다')).toBeInTheDocument()
  })

  it('반려는 사유를 적어야 확정할 수 있다', async () => {
    loginAs('checker')
    vi.stubGlobal('fetch', fakeServer([REQUESTED]))
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '반려' }))
    const confirm = screen.getByRole('button', { name: '반려 확정' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText('반려 사유'), '정상 입금 확인')
    expect(confirm).toBeEnabled()
  })

  it('요청 칸은 창구에게만, 승인 버튼은 책임자에게만 보인다', async () => {
    loginAs('other-teller', 'TELLER')
    vi.stubGlobal('fetch', fakeServer([REQUESTED]))
    const { unmount } = renderPage()
    expect(await screen.findByText(/승인·반려는 책임자 역할만 할 수 있습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('거래 번호')).toBeInTheDocument()
    unmount()

    loginAs('checker')
    renderPage()
    expect(await screen.findByRole('button', { name: '승인' })).toBeInTheDocument()
    expect(screen.queryByLabelText('거래 번호')).not.toBeInTheDocument()
  })

  it('거래내역에서 오면 거래 번호가 채워져 있고, 사유를 적어 요청한다', async () => {
    loginAs('maker')
    const fetchMock = fakeServer([])
    vi.stubGlobal('fetch', fetchMock)
    renderPage('/admin/corrections?transactionId=42')

    expect(screen.getByLabelText('거래 번호')).toHaveValue('42')
    const submit = screen.getByRole('button', { name: '정정 요청' })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText('사유'), '금액 오입력')
    await userEvent.click(submit)

    expect(await screen.findByText('정정 요청 #8 를 올렸습니다.')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')
    expect(JSON.parse(post![1].body as string)).toEqual({ transactionId: 42, reason: '금액 오입력' })
  })
})
