import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { ApiResult } from '../api/client'
import { openTimeDeposit } from '../api/corebank'
import type { Account, TimeDeposit } from '../api/types'
import { useIdempotentMutation } from '../hooks/useIdempotentMutation'
import { useSelectedProduct } from '../hooks/useSelectedProduct'
import { errorMessage } from '../lib/errors'
import { formatWon, parseAmount } from '../lib/format'
import { formatRate } from '../lib/interest'
import { formatTerm } from '../lib/timeDeposit'
import { AmountField } from './AmountField'
import { Notice } from './Notice'
import { ProductSelect } from './ProductSelect'

interface Variables {
  productId: number
  principal: number
}

/**
 * 정기예금 가입. 지금 보고 있는 입출금 계좌가 연결계좌다(원금이 여기서 빠지고, 만기·중도해지 때 원리금이 여기로 온다).
 * 돈이 움직이는 요청이라 입출금과 같은 멱등성 규칙을 쓴다. 성공하면 새 정기예금 계좌 화면으로 간다.
 */
export function TimeDepositOpenForm({ payoutAccount }: { payoutAccount: Account }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [productId, setProductId] = useState<number | undefined>(undefined)
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const product = useSelectedProduct(productId, 'TIME')

  const mutation = useIdempotentMutation<Variables, ApiResult<TimeDeposit>>({
    fingerprint: (v) => `td-open|${v.productId}|${v.principal}|${payoutAccount.id}`,
    mutationFn: (v, key) => openTimeDeposit(v.productId, v.principal, payoutAccount.id, key),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: ['account', payoutAccount.id] })
      void queryClient.invalidateQueries({ queryKey: ['history', payoutAccount.id] })
      void queryClient.invalidateQueries({ queryKey: ['my-accounts'] })
      navigate(`/accounts/${data.accountId}`, { state: { opened: true } })
    },
  })

  if (payoutAccount.status === 'CLOSED') {
    return <Notice tone="info" title="해지된 계좌는 연결계좌로 쓸 수 없습니다." />
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const principal = parseAmount(input)
    if (principal === null) {
      mutation.reset()
      setInputError('원금은 1원 이상의 정수로 입력해 주세요.')
      return
    }
    if (!product) {
      setInputError('판매 중인 정기예금 상품이 없습니다.')
      return
    }
    setInputError(null)
    mutation.submit({ productId: product.id, principal })
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="form">
        <ProductSelect type="TIME" value={productId} onChange={setProductId} />
        {product && product.termMonths !== null && (
          <p className="hint left">
            {formatTerm(product.termMonths)} 동안 {formatRate(product.annualRate)} 고정. 가입 뒤 상품 금리가 바뀌어도 이
            금리 그대로입니다. 만기 전에 해지하면 낮은 중도해지이율을 받습니다.
          </p>
        )}
        <AmountField
          label="원금 (이 계좌에서 빠집니다)"
          value={input}
          onChange={(value) => {
            setInput(value)
            setInputError(null)
          }}
          invalid={inputError !== null}
        />
        <button type="submit" className="btn block" disabled={mutation.isPending || !product}>
          {mutation.isPending && <span className="spinner" aria-hidden />}
          {mutation.isPending ? '가입 처리 중' : mutation.pendingRetry ? '가입 다시 시도' : '정기예금 가입'}
        </button>
      </form>
      <p className="hint left">
        잔액 {formatWon(payoutAccount.balance)} · 만기·중도해지 때 원금과 이자가 이 계좌로 들어옵니다.
      </p>
      {inputError && <Notice tone="error" title={inputError} />}
      {mutation.isError && (
        <Notice tone="error" title={errorMessage(mutation.error)}>
          {mutation.pendingRetry && (
            <p>처리 여부를 확인하지 못했습니다. 다시 시도하면 같은 요청 번호로 보내므로 두 번 가입되지 않습니다.</p>
          )}
        </Notice>
      )}
    </div>
  )
}
