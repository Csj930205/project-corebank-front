import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '../api/types'
import { ClosureForm } from './ClosureForm'

const ACTIVE: Account = {
  id: 7,
  accountNumber: '1100000000007',
  ownerName: '홍길동',
  customerId: null,
  balance: 10000,
  status: 'ACTIVE',
  createdAt: '2026-11-03T10:00:00',
  closedAt: null,
  product: { id: 1, name: '기본 입출금 통장', annualRate: 0.1 },
}

const CLOSURE = {
  accountId: 7,
  accountNumber: '1100000000007',
  status: 'CLOSED',
  payoutAmount: 10000,
  payoutTransactionId: 55,
  closedAt: '2026-11-04T10:00:00',
}

function renderForm(account: Account = ACTIVE) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <ClosureForm account={account} />
    </QueryClientProvider>,
  )
}

function ok(body: unknown, replayed = false) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(replayed ? { 'Idempotent-Replayed': 'true' } : {}) },
  })
}

describe('ClosureForm', () => {
  it('"계좌 해지"만 눌러서는 요청하지 않고, "해지 확정"까지 눌러야 해지한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CLOSURE))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: '계좌 해지' }))
    expect(fetchMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '해지 확정' }))
    expect(await screen.findByText('해지 완료 · 10,000원 지급')).toBeInTheDocument()
    expect(screen.getByText(/거래 번호 55/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/accounts/7/closure')
    expect(init.method).toBe('POST')
    expect(init.headers['Idempotency-Key']).toBeTruthy()
  })

  it('취소하면 요청하지 않고 처음 화면으로 돌아간다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: '계좌 해지' }))
    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.getByRole('button', { name: '계좌 해지' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('지급할 잔액을 해지 전에 보여 준다', () => {
    renderForm()

    expect(screen.getByText('지급할 잔액').nextSibling).toHaveTextContent('10,000원')
  })

  it('네트워크 오류 뒤 다시 시도하면 같은 키로 보내, 두 번 지급되지 않고 처음 결과를 받는다', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok(CLOSURE, true))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: '계좌 해지' }))
    await userEvent.click(screen.getByRole('button', { name: '해지 확정' }))
    expect(await screen.findByText(/처리 여부를 확인하지 못했습니다/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '해지 다시 시도' }))
    expect(await screen.findByText(/이미 처리된 요청이라 처음 결과를 다시 받았습니다/)).toBeInTheDocument()

    const firstKey = fetchMock.mock.calls[0][1].headers['Idempotency-Key']
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe(firstKey)
  })

  it('잔액이 0이면 지급 없음으로 안내한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ ...CLOSURE, payoutAmount: 0, payoutTransactionId: null })))
    renderForm({ ...ACTIVE, balance: 0 })

    await userEvent.click(screen.getByRole('button', { name: '계좌 해지' }))
    await userEvent.click(screen.getByRole('button', { name: '해지 확정' }))

    expect(await screen.findByText('해지 완료 · 0원 지급')).toBeInTheDocument()
    expect(screen.getByText(/잔액이 없어 지급한 돈은 없습니다/)).toBeInTheDocument()
  })

  it('이미 해지된 계좌는 버튼 대신 해지 일시를 보여 준다', () => {
    renderForm({ ...ACTIVE, balance: 0, status: 'CLOSED', closedAt: '2026-11-04T10:00:00' })

    expect(screen.getByText('해지된 계좌입니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '계좌 해지' })).not.toBeInTheDocument()
  })

  it('다른 곳에서 먼저 해지했으면(409) 서버 코드에 맞는 문장을 보여 준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'ACCOUNT_CLOSED', message: '해지된 계좌입니다. id=7' }), { status: 409 }),
      ),
    )
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: '계좌 해지' }))
    await userEvent.click(screen.getByRole('button', { name: '해지 확정' }))

    expect(await screen.findByText('해지된 계좌라 거래할 수 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/처리 여부를 확인하지 못했습니다/)).not.toBeInTheDocument()
  })
})
