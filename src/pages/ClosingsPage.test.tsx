import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession } from '../lib/session'
import { loginAdmin } from '../test/loginAdmin'
import type { ClosingDetail, ClosingSummary } from '../api/types'
import { yesterday } from '../lib/closing'
import { ClosingDetailPage } from './ClosingDetailPage'
import { ClosingsPage } from './ClosingsPage'

const BALANCED: ClosingSummary = {
  id: 1,
  businessDate: '2026-11-03',
  status: 'BALANCED',
  trigger: 'MANUAL',
  requestedBy: 'admin',
  jobExecutionId: 10,
  accountCount: 103,
  depositLiability: '119903836479113528290',
  mismatchCount: 0,
  startedAt: '2026-11-04T13:30:00.000',
  finishedAt: '2026-11-04T13:30:00.319',
  errorMessage: null,
}

const UNBALANCED_DETAIL: ClosingDetail = {
  closing: { ...BALANCED, id: 2, status: 'UNBALANCED', mismatchCount: 2, depositLiability: '10000' },
  totals: [{ type: 'DEPOSIT', count: 3, amount: '30000' }],
  mismatches: [
    {
      id: 1,
      type: 'BALANCE_LEDGER_MISMATCH',
      accountId: 7,
      transactionId: null,
      transferId: null,
      expected: '10000',
      actual: '10001',
      detail: '계좌 1100000000007: 현재 잔액(actual)이 원장 합계(expected)와 다릅니다.',
    },
    {
      id: 2,
      type: 'INCOMPLETE_TRANSFER',
      accountId: null,
      transactionId: null,
      transferId: 55,
      expected: '2',
      actual: '0',
      detail: '이체 한 건의 원장 거래는 출금 쪽과 입금 쪽 2건이어야 합니다.',
    },
  ],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 }, queries: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/closings" element={<ClosingsPage />} />
          <Route path="/admin/closings/:id" element={<ClosingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('일 마감 화면', () => {
  // 실행·변경 버튼은 운영 역할에게만 보인다.
  beforeEach(() => loginAdmin('OPERATOR'))
  afterEach(() => clearSession())

  it('마감 기록을 보여 주고, 큰 금액도 정확히 표시한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ content: [BALANCED], page: 0, size: 20, totalElements: 1, totalPages: 1 })))
    renderAt('/admin/closings')

    expect(await screen.findByRole('link', { name: '2026-11-03' })).toBeInTheDocument()
    expect(screen.getByText('정상')).toBeInTheDocument()
    expect(screen.getByText('119,903,836,479,113,528,290원')).toBeInTheDocument()
    expect(screen.getByText('수동 · admin')).toBeInTheDocument()
  })

  it('영업일은 어제가 기본이고 오늘 이후는 고를 수 없다. 실행하면 결과 화면으로 간다', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      Promise.resolve(
        init.method === 'POST'
          ? json(UNBALANCED_DETAIL, 201)
          : json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/admin/closings')

    const input = screen.getByLabelText('영업일')
    expect(input).toHaveValue(yesterday())
    expect(input).toHaveAttribute('max', yesterday())

    await userEvent.click(screen.getByRole('button', { name: '마감 실행' }))

    expect(await screen.findByText('불일치 2건을 찾았습니다.')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')!
    expect(post[0]).toBe('/api/admin/closings')
    expect(JSON.parse(post[1].body as string)).toEqual({ businessDate: yesterday() })
  })

  it('오늘을 마감하려 하면 서버 거부(422)를 알아듣기 쉬운 문장으로 보여 준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        Promise.resolve(
          init.method === 'POST'
            ? json({ code: 'BUSINESS_DATE_NOT_ENDED', message: '... businessDate=2026-11-04' }, 422)
            : json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
        ),
      ),
    )
    renderAt('/admin/closings')

    await userEvent.click(screen.getByRole('button', { name: '마감 실행' }))

    expect(await screen.findByText('오늘과 미래 날짜는 아직 끝나지 않아 마감할 수 없습니다.')).toBeInTheDocument()
  })

  it('상세: 일계표와 불일치 내역을 보여 주고, 계좌 불일치는 계좌 화면으로 연결한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(UNBALANCED_DETAIL)))
    renderAt('/admin/closings/2')

    expect(await screen.findByText('불일치 2건을 찾았습니다.')).toBeInTheDocument()
    // 일계표: 거래가 없는 종류도 0건으로 보인다.
    expect(screen.getByRole('cell', { name: '30,000원' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '0건' })).toHaveLength(7)
    // 불일치: 금액은 원, 반쪽 이체는 건수
    expect(screen.getByRole('link', { name: '계좌 7' })).toHaveAttribute('href', '/accounts/7')
    expect(screen.getByText('10,001원')).toBeInTheDocument()
    expect(screen.getByText('이체 #55')).toBeInTheDocument()
    expect(screen.getByText('0건', { selector: 'dd' })).toBeInTheDocument()
  })

  it('상세: 실패한 마감은 원인을 보여 준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          closing: { ...BALANCED, status: 'FAILED', accountCount: null, depositLiability: null, mismatchCount: null, errorMessage: '배치 실패(FAILED): DB 연결 끊김' },
          totals: [],
          mismatches: [],
        }),
      ),
    )
    renderAt('/admin/closings/1')

    expect(await screen.findByText(/배치가 끝까지 실행되지 못했습니다/)).toBeInTheDocument()
    expect(screen.getByText('배치 실패(FAILED): DB 연결 끊김')).toBeInTheDocument()
  })
})
