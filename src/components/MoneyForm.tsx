import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import type { ApiResult } from '../api/client'
import { deposit, withdraw } from '../api/corebank'
import type { MoneyTransaction } from '../api/types'
import { useIdempotentMutation } from '../hooks/useIdempotentMutation'
import { errorMessage } from '../lib/errors'
import { formatWon, parseAmount } from '../lib/format'
import { AmountField } from './AmountField'
import { Notice } from './Notice'

interface Props {
  accountId: number
  kind: 'deposit' | 'withdraw'
}

const LABEL = { deposit: '입금', withdraw: '출금' } as const

/** 입금·출금 폼. 두 기능은 요청 주소만 다르다. */
export function MoneyForm({ accountId, kind }: Props) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const label = LABEL[kind]

  const mutation = useIdempotentMutation<number, ApiResult<MoneyTransaction>>({
    fingerprint: (amount) => `${kind}|${accountId}|${amount}`,
    mutationFn: (amount, key) => (kind === 'deposit' ? deposit : withdraw)(accountId, amount, key),
    onSuccess: () => {
      setInput('')
      void queryClient.invalidateQueries({ queryKey: ['account', accountId] })
      void queryClient.invalidateQueries({ queryKey: ['history', accountId] })
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const amount = parseAmount(input)
    if (amount === null) {
      // 이전 요청의 결과 안내(예: "입금 완료")가 남아 있으면 이번 시도가 성공한 것처럼 보이므로 지운다.
      mutation.reset()
      setInputError('금액은 1원 이상의 정수로 입력해 주세요.')
      return
    }
    setInputError(null)
    mutation.submit(amount)
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="form">
        <AmountField
          label={`${label} 금액`}
          value={input}
          onChange={(value) => {
            setInput(value)
            setInputError(null)
          }}
          invalid={inputError !== null}
        />
        <button type="submit" className="btn block" disabled={mutation.isPending}>
          {mutation.isPending && <span className="spinner" aria-hidden />}
          {mutation.isPending ? `${label} 처리 중` : mutation.pendingRetry ? `${label} 다시 시도` : label}
        </button>
      </form>
      {inputError && <Notice tone="error" title={inputError} />}
      {mutation.isSuccess && (
        <Notice tone="success" title={`${label} 완료 · ${formatWon(mutation.data.data.amount)}`}>
          거래 후 잔액 {formatWon(mutation.data.data.balanceAfter)} · 거래 번호 {mutation.data.data.transactionId}
          {mutation.data.replayed && (
            <p>
              <span className="replay-tag">재전송</span> 이미 처리된 요청이라 처음 결과를 다시 받았습니다. 돈은 한 번만
              움직였습니다.
            </p>
          )}
        </Notice>
      )}
      {mutation.isError && (
        <Notice tone="error" title={errorMessage(mutation.error)}>
          {mutation.pendingRetry && (
            <p>처리 여부를 확인하지 못했습니다. 같은 금액으로 다시 시도하면 같은 요청 번호로 보내므로 두 번 처리되지 않습니다.</p>
          )}
        </Notice>
      )}
    </div>
  )
}
