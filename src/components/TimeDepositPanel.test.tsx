import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { TimeDeposit } from '../api/types'
import { TimeDepositPanel } from './TimeDepositPanel'

const ACTIVE: TimeDeposit = {
  accountId: 9,
  accountNumber: '1100000000009',
  ownerName: '홍길동',
  customerId: 1,
  balance: 1_000_000,
  accountStatus: 'ACTIVE',
  productId: 5,
  productName: '1년 정기예금',
  status: 'ACTIVE',
  principal: 1_000_000,
  annualRate: 3.65,
  termMonths: 12,
  startDate: '2026-01-01',
  maturityDate: '2027-01-01',
  payoutAccountId: 7,
  atMaturity: { trigger: 'MATURITY', appliedRate: 3.65, days: 365, grossInterest: 36_500, tax: 5_620, netInterest: 30_880, payout: 1_030_880 },
  quote: { trigger: 'EARLY_TERM', appliedRate: 1.09, days: 45, grossInterest: 1_343, tax: 190, netInterest: 1_153, payout: 1_001_153 },
  settlement: null,
}

const TERMINATED: TimeDeposit = {
  ...ACTIVE,
  balance: 0,
  accountStatus: 'CLOSED',
  status: 'TERMINATED',
  quote: null,
  settlement: {
    status: 'TERMINATED',
    appliedRate: 1.09,
    interestPaymentId: 3,
    grossInterest: 1_343,
    tax: 190,
    netInterest: 1_153,
    payout: 1_001_153,
    payoutTransferId: 11,
    settledAt: '2026-02-15T10:00:00',
  },
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPanel(canMove = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TimeDepositPanel accountId={9} canMove={canMove} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TimeDepositPanel', () => {
  it('약정과 만기 예상, 오늘 중도해지 예상을 보여 준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(ACTIVE)))
    renderPanel()

    expect(await screen.findByText('연 3.65% 고정')).toBeInTheDocument()
    expect(screen.getByText('1,030,880원')).toBeInTheDocument()
    expect(screen.getByText('오늘 중도해지하면')).toBeInTheDocument()
    expect(screen.getByText('1,001,153원')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('중도해지는 두 번 눌러야 요청하고, 멱등성 키를 붙여 보낸다', async () => {
    let terminated = false
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        terminated = true
        return Promise.resolve(json(TERMINATED))
      }
      return Promise.resolve(json(terminated ? TERMINATED : ACTIVE))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: '중도해지' }))
    expect(fetchMock.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: '해지 확정' }))

    expect(await screen.findByText('해지 결과')).toBeInTheDocument()
    expect(screen.getByText('중도 해지')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')!
    expect(post[0]).toBe('/api/accounts/9/time-deposit/termination')
    expect(new Headers(post[1].headers).get('Idempotency-Key')).toBeTruthy()
  })

  it('해지 권한이 없으면 버튼 대신 안내를 보여 준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(ACTIVE)))
    renderPanel(false)

    expect(await screen.findByText('해지는 창구 역할이나 예금주만 할 수 있습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '중도해지' })).not.toBeInTheDocument()
  })
})
