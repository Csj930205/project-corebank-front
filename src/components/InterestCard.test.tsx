import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account, AccountInterest } from '../api/types'
import { InterestCard } from './InterestCard'

const ACCOUNT: Account = {
  id: 7,
  accountNumber: '1100000000007',
  ownerName: '홍길동',
  customerId: null,
  balance: 1_000_000,
  status: 'ACTIVE',
  createdAt: '2026-11-03T10:00:00',
  closedAt: null,
  product: { id: 2, name: '자유적립 예금', annualRate: 3.65 },
}

function renderCard(body: AccountInterest) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <InterestCard account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('계좌 이자', () => {
  it('아직 받지 않은 이자를 세전·세금·세후로 보여 준다', async () => {
    renderCard({
      accountId: 7,
      unpaid: {
        from: '2026-11-01',
        to: '2026-11-30',
        days: 30,
        balanceRateSum: '109500000.00',
        estimatedGross: 3000,
        estimatedTax: 460,
        estimatedNet: 2540,
      },
      payments: [],
    })

    expect(await screen.findByText('3,000원')).toBeInTheDocument()
    expect(screen.getByText('−460원')).toBeInTheDocument()
    expect(screen.getByText('2,540원')).toBeInTheDocument()
    expect(screen.getByText(/자유적립 예금 · 연 3.65%/)).toBeInTheDocument()
  })

  it('받은 이자 내역을 보여 준다', async () => {
    renderCard({
      accountId: 7,
      unpaid: null,
      payments: [
        {
          id: 1,
          accountId: 7,
          trigger: 'SETTLEMENT',
          periodFrom: '2026-10-01',
          periodTo: '2026-10-31',
          dayCount: 31,
          grossAmount: 3100,
          incomeTax: 430,
          localTax: 40,
          netAmount: 2630,
          transactionId: 99,
          paidAt: '2026-11-01T00:30:00',
        },
      ],
    })

    expect(await screen.findByText('2,630원')).toBeInTheDocument()
    expect(screen.getByText('470원')).toBeInTheDocument()
    expect(screen.getByText('월 결산')).toBeInTheDocument()
    expect(screen.getByText(/아직 쌓인 이자가 없습니다/)).toBeInTheDocument()
  })
})
