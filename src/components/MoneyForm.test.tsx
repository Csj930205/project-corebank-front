import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MoneyForm } from './MoneyForm'

function renderForm(kind: 'deposit' | 'withdraw' = 'deposit') {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MoneyForm accountId={7} kind={kind} />
    </QueryClientProvider>,
  )
}

function created(body: unknown, replayed = false) {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { 'Content-Type': 'application/json', ...(replayed ? { 'Idempotent-Replayed': 'true' } : {}) },
  })
}

const TX = { transactionId: 11, accountId: 7, amount: 10000, balanceAfter: 25000, createdAt: '2026-11-03T10:00:00' }

describe('MoneyForm', () => {
  it('버튼을 연달아 눌러도 요청은 한 번만 보낸다', async () => {
    let resolve!: (response: Response) => void
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.type(screen.getByLabelText(/입금 금액/), '10000')
    const button = screen.getByRole('button', { name: '입금' })
    // 응답이 오기 전 연타. 버튼 비활성화와 훅의 ref 가드가 함께 막는다.
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)

    // React Query 는 요청 함수를 비동기로 실행하므로, 호출이 일어날 때까지 기다린 뒤 횟수를 확인한다.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    resolve(created(TX))
    expect(await screen.findByText(/입금 완료/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('네트워크 오류 뒤 다시 시도하면 같은 멱등성 키로 보내고, 재전송 결과를 안내한다', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created(TX, true))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.type(screen.getByLabelText(/입금 금액/), '10,000')
    await userEvent.click(screen.getByRole('button', { name: '입금' }))
    expect(await screen.findByText(/처리 여부를 확인하지 못했습니다/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '입금 다시 시도' }))
    expect(await screen.findByText(/이미 처리된 요청이라 처음 결과를 다시 받았습니다/)).toBeInTheDocument()

    const firstKey = fetchMock.mock.calls[0][1].headers['Idempotency-Key']
    const retryKey = fetchMock.mock.calls[1][1].headers['Idempotency-Key']
    expect(firstKey).toBeTruthy()
    expect(retryKey).toBe(firstKey)
  })

  it('성공한 뒤의 다음 입금은 새 키를 쓴다', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(created(TX)))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    const input = screen.getByLabelText(/입금 금액/)
    await userEvent.type(input, '10000')
    await userEvent.click(screen.getByRole('button', { name: '입금' }))
    await screen.findByText(/입금 완료/)
    await userEvent.type(input, '10000')
    await userEvent.click(screen.getByRole('button', { name: '입금' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).not.toBe(fetchMock.mock.calls[0][1].headers['Idempotency-Key'])
  })

  it('잔액 부족은 서버 코드에 맞는 문장으로 보여 주고, 재시도 안내는 하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'INSUFFICIENT_BALANCE', message: '잔액이 부족합니다. id=7' }), { status: 422 }),
      ),
    )
    renderForm('withdraw')

    await userEvent.type(screen.getByLabelText(/출금 금액/), '999999')
    await userEvent.click(screen.getByRole('button', { name: '출금' }))

    expect(await screen.findByText('잔액이 부족합니다.')).toBeInTheDocument()
    expect(screen.queryByText(/처리 여부를 확인하지 못했습니다/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '출금' })).toBeEnabled()
  })

  it('잘못된 금액은 서버에 보내지 않는다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.type(screen.getByLabelText(/입금 금액/), '1.5')
    await userEvent.click(screen.getByRole('button', { name: '입금' }))

    expect(screen.getByText('금액은 1원 이상의 정수로 입력해 주세요.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
