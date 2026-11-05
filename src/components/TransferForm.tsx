import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import type { ApiResult } from '../api/client'
import { lookupRecipient, transfer } from '../api/corebank'
import type { Recipient, TransferResult } from '../api/types'
import { useIdempotentMutation } from '../hooks/useIdempotentMutation'
import { errorMessage } from '../lib/errors'
import { formatAccountNumber, formatWon, parseAccountNumber, parseAmount } from '../lib/format'
import { AmountField } from './AmountField'
import { Notice } from './Notice'

interface Variables {
  toAccountNumber: string
  amount: number
}

interface Props {
  fromAccountId: number
  /** 보내는 계좌번호. 같은 계좌로 보내려는 것을 서버에 묻기 전에 막는다. */
  fromAccountNumber: string
}

/**
 * 이체. 받는 계좌번호를 넣고 먼저 "받는 분 확인"으로 예금주(가린 이름)를 확인한 뒤에야 이체할 수 있다.
 * 계좌번호를 한 글자라도 바꾸면 확인을 다시 해야 한다. 잘못 친 계좌번호로 남에게 돈을 보내는 실수를 막는다.
 */
export function TransferForm({ fromAccountId, fromAccountNumber }: Props) {
  const queryClient = useQueryClient()
  const toId = useId()
  const [toInput, setToInput] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  // 확인을 마친 받는 계좌. 입력칸의 계좌번호와 같을 때만 유효하다.
  const [recipient, setRecipient] = useState<Recipient | null>(null)

  const toAccountNumber = parseAccountNumber(toInput)
  const confirmed = recipient !== null && recipient.accountNumber === toAccountNumber

  const lookup = useMutation({
    mutationFn: (accountNumber: string) => lookupRecipient(accountNumber),
    onSuccess: (found) => setRecipient(found),
  })

  const mutation = useIdempotentMutation<Variables, ApiResult<TransferResult>>({
    fingerprint: ({ toAccountNumber, amount }) => `transfer|${fromAccountId}|${toAccountNumber}|${amount}`,
    mutationFn: ({ toAccountNumber, amount }, key) => transfer(fromAccountId, toAccountNumber, amount, key),
    onSuccess: ({ data }) => {
      setAmountInput('')
      for (const id of [fromAccountId, data.toAccountId]) {
        void queryClient.invalidateQueries({ queryKey: ['account', id] })
        void queryClient.invalidateQueries({ queryKey: ['history', id] })
      }
      void queryClient.invalidateQueries({ queryKey: ['my-accounts'] })
    },
  })

  const checkRecipient = () => {
    mutation.reset()
    const error =
      toAccountNumber === null
        ? '받는 계좌번호는 숫자 13자리입니다.'
        : toAccountNumber === fromAccountNumber
          ? '같은 계좌로는 이체할 수 없습니다.'
          : null
    setInputError(error)
    if (error === null && toAccountNumber !== null && !lookup.isPending) {
      lookup.mutate(toAccountNumber)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    // 받는 분을 아직 확인하지 않았으면 Enter 도 확인으로 처리한다.
    if (!confirmed || toAccountNumber === null) {
      checkRecipient()
      return
    }
    const amount = parseAmount(amountInput)
    if (amount === null) {
      // 이전 요청의 결과 안내(예: "이체 완료")가 남아 있으면 이번 시도가 성공한 것처럼 보이므로 지운다.
      mutation.reset()
      setInputError('금액은 1원 이상의 정수로 입력해 주세요.')
      return
    }
    setInputError(null)
    mutation.submit({ toAccountNumber, amount })
  }

  const result = mutation.data?.data

  return (
    <div>
      <form onSubmit={onSubmit} className="form">
        <div className="field">
          <label htmlFor={toId}>받는 계좌번호</label>
          <div className="input-row">
            <input
              id={toId}
              className="input mono"
              value={toInput}
              onChange={(e) => {
                setToInput(e.target.value)
                setInputError(null)
                lookup.reset()
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="110-0000-000000"
              maxLength={20}
            />
            <button
              type="button"
              className="btn secondary"
              onClick={checkRecipient}
              disabled={lookup.isPending || confirmed}
            >
              {lookup.isPending ? '확인 중' : confirmed ? '확인됨' : '받는 분 확인'}
            </button>
          </div>
        </div>
        {confirmed && (
          <p className="recipient" aria-live="polite">
            받는 분 <strong>{recipient.ownerName}</strong>
            <span className="mono"> · {formatAccountNumber(recipient.accountNumber)}</span>
          </p>
        )}
        {lookup.isError && <Notice tone="error" title={errorMessage(lookup.error)} />}
        <AmountField
          label="이체 금액"
          value={amountInput}
          onChange={(value) => {
            setAmountInput(value)
            setInputError(null)
          }}
        />
        <button type="submit" className="btn block" disabled={mutation.isPending || !confirmed}>
          {mutation.isPending && <span className="spinner" aria-hidden />}
          {mutation.isPending ? '이체 처리 중' : mutation.pendingRetry ? '이체 다시 시도' : '이체'}
        </button>
      </form>
      {inputError && <Notice tone="error" title={inputError} />}
      {mutation.isSuccess && result && (
        <Notice tone="success" title={`이체 완료 · ${formatWon(result.amount)}`}>
          내 계좌 잔액 {formatWon(result.fromBalanceAfter)} · 이체 번호 {result.transferId}
          {mutation.data.replayed && (
            <p>
              <span className="replay-tag">재전송</span> 이미 처리된 이체라 처음 결과를 다시 받았습니다. 돈은 한 번만
              움직였습니다.
            </p>
          )}
        </Notice>
      )}
      {mutation.isError && (
        <Notice tone="error" title={errorMessage(mutation.error)}>
          {mutation.pendingRetry && (
            <p>처리 여부를 확인하지 못했습니다. 같은 내용으로 다시 시도하면 같은 요청 번호로 보내므로 두 번 이체되지 않습니다.</p>
          )}
        </Notice>
      )}
    </div>
  )
}
