import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransferForm } from './TransferForm'

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TransferForm fromAccountId={1} fromAccountNumber="1100000000001" />
    </QueryClientProvider>,
  )
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const RECIPIENT = { accountNumber: '1100000000002', ownerName: '홍*동' }
const RESULT = {
  transferId: 9,
  fromAccountId: 1,
  toAccountId: 2,
  amount: 3000,
  fromBalanceAfter: 7000,
  toBalanceAfter: null,
  createdAt: '2026-11-04T10:00:00',
}

describe('TransferForm', () => {
  it('받는 분을 확인하기 전에는 이체할 수 없고, 확인하면 가린 이름을 보여 준 뒤 계좌번호로 이체한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, RECIPIENT)).mockResolvedValueOnce(json(201, RESULT))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    expect(screen.getByRole('button', { name: '이체' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('받는 계좌번호'), '110-0000-000002')
    await userEvent.click(screen.getByRole('button', { name: '받는 분 확인' }))

    expect(await screen.findByText('홍*동')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/accounts/lookup?accountNumber=1100000000002')

    await userEvent.type(screen.getByLabelText('이체 금액'), '3000')
    await userEvent.click(screen.getByRole('button', { name: '이체' }))

    expect(await screen.findByText('이체 완료 · 3,000원')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/transfers')
    expect(JSON.parse(init.body)).toEqual({ fromAccountId: 1, toAccountNumber: '1100000000002', amount: 3000 })
    expect(init.headers['Idempotency-Key']).toBeTruthy()
  })

  it('확인한 뒤 계좌번호를 바꾸면 다시 확인해야 한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, RECIPIENT)))
    renderForm()

    const input = screen.getByLabelText('받는 계좌번호')
    await userEvent.type(input, '1100000000002')
    await userEvent.click(screen.getByRole('button', { name: '받는 분 확인' }))
    expect(await screen.findByText('홍*동')).toBeInTheDocument()

    await userEvent.type(input, '3')
    expect(screen.queryByText('홍*동')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이체' })).toBeDisabled()
  })

  it('형식이 틀리거나 내 계좌번호면 서버에 묻지 않는다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.type(screen.getByLabelText('받는 계좌번호'), '12345')
    await userEvent.click(screen.getByRole('button', { name: '받는 분 확인' }))
    expect(screen.getByText('받는 계좌번호는 숫자 13자리입니다.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('받는 계좌번호'))
    await userEvent.type(screen.getByLabelText('받는 계좌번호'), '1100000000001')
    await userEvent.click(screen.getByRole('button', { name: '받는 분 확인' }))
    expect(screen.getByText('같은 계좌로는 이체할 수 없습니다.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('없는 계좌와 해지된 계좌는 서버 코드에 맞는 문장을 보여 준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(404, { code: 'ACCOUNT_NOT_FOUND', message: 'x' }))
        .mockResolvedValueOnce(json(409, { code: 'ACCOUNT_CLOSED', message: 'x' })),
    )
    renderForm()

    await userEvent.type(screen.getByLabelText('받는 계좌번호'), '1109999999999')
    await userEvent.click(screen.getByRole('button', { name: '받는 분 확인' }))
    expect(await screen.findByText('계좌를 찾을 수 없습니다.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '받는 분 확인' }))
    expect(await screen.findByText('해지된 계좌라 거래할 수 없습니다.')).toBeInTheDocument()
  })
})
