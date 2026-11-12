import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ApiError, type ApiResult } from '../api/client'
import { closeAccount } from '../api/corebank'
import type { Account, AccountClosure } from '../api/types'
import { useIdempotentMutation } from '../hooks/useIdempotentMutation'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWon } from '../lib/format'
import { Notice } from './Notice'

/** 해지 결과를 반영하도록 계좌, 거래내역, 관리자 화면 데이터를 다시 불러온다. */
function refreshAfterClosure(queryClient: QueryClient, accountId: number) {
  void queryClient.invalidateQueries({ queryKey: ['account', accountId] })
  void queryClient.invalidateQueries({ queryKey: ['history', accountId] })
  // 해지하면 쌓인 이자를 먼저 지급하므로 이자 현황도 바뀐다.
  void queryClient.invalidateQueries({ queryKey: ['interest', accountId] })
  void queryClient.invalidateQueries({ queryKey: ['admin'] })
}

/**
 * 계좌 해지. 되돌릴 수 없는 동작이라 "계좌 해지" → "해지 확정" 두 번 눌러야 요청을 보낸다.
 *
 * 해지도 돈이 나가는 요청(남은 잔액 지급)이라 입출금과 같은 멱등성 규칙을 쓴다. 결과를 모르는 실패 뒤 다시 시도하면
 * 같은 키로 보내, 서버가 이미 해지했더라도 409 가 아니라 처음 결과(지급액)를 돌려받는다.
 */
export function ClosureForm({ account }: { account: Account }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const mutation = useIdempotentMutation<void, ApiResult<AccountClosure>>({
    // 계좌당 해지 요청은 내용이 하나뿐이다. 재시도는 항상 같은 키를 쓴다.
    fingerprint: () => `close|${account.id}`,
    mutationFn: (_variables, key) => closeAccount(account.id, key),
    onSuccess: () => {
      setConfirming(false)
      refreshAfterClosure(queryClient, account.id)
    },
  })

  // 다른 화면이나 다른 사람이 먼저 해지했으면 409 가 온다. 계좌 정보를 다시 불러와 해지 상태를 보여 준다.
  const closedElsewhere = mutation.error instanceof ApiError && mutation.error.code === 'ACCOUNT_CLOSED'
  useEffect(() => {
    if (closedElsewhere) {
      refreshAfterClosure(queryClient, account.id)
    }
  }, [closedElsewhere, queryClient, account.id])

  if (mutation.isSuccess) {
    const result = mutation.data.data
    return (
      <Notice tone="success" title={`해지 완료 · ${formatWon(result.payoutAmount)} 지급`}>
        {result.payoutTransactionId !== null
          ? `남은 잔액을 현금으로 지급했습니다. 거래 번호 ${result.payoutTransactionId}`
          : '잔액이 없어 지급한 돈은 없습니다.'}
        {mutation.data.replayed && (
          <p>
            <span className="replay-tag">재전송</span> 이미 처리된 요청이라 처음 결과를 다시 받았습니다. 지급은 한 번만
            했습니다.
          </p>
        )}
      </Notice>
    )
  }

  if (account.status === 'CLOSED') {
    return (
      <Notice tone="info" title="해지된 계좌입니다.">
        {account.closedAt && `${formatDateTime(account.closedAt)}에 해지했습니다. `}
        거래내역은 계속 조회할 수 있습니다.
      </Notice>
    )
  }

  return (
    <div>
      <dl className="closure-facts">
        <div>
          <dt>지급할 잔액</dt>
          <dd>{formatWon(account.balance)}</dd>
        </div>
        <div>
          <dt>지급 방법</dt>
          <dd>현금</dd>
        </div>
      </dl>
      <p className="closure-warning">
        해지하면 남은 잔액을 지급하고 계좌를 닫습니다. 이후 입금·출금·이체를 할 수 없고 되돌릴 수 없습니다. 거래내역은
        계속 조회할 수 있습니다.
      </p>

      {/* 결과를 모르는 실패 뒤 취소해도 키는 훅이 기억하므로, 다음 해지 시도는 같은 키로 간다 */}
      {!confirming ? (
        <button type="button" className="btn danger block" onClick={() => setConfirming(true)}>
          계좌 해지
        </button>
      ) : (
        <div className="button-row">
          <button
            type="button"
            className="btn ghost"
            disabled={mutation.isPending}
            onClick={() => {
              setConfirming(false)
              mutation.reset()
            }}
          >
            취소
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={mutation.isPending}
            onClick={() => mutation.submit()}
          >
            {mutation.isPending && <span className="spinner" aria-hidden />}
            {mutation.isPending ? '해지 처리 중' : mutation.pendingRetry ? '해지 다시 시도' : '해지 확정'}
          </button>
        </div>
      )}

      {mutation.isError && (
        <Notice tone="error" title={errorMessage(mutation.error)}>
          {mutation.pendingRetry && (
            <p>
              처리 여부를 확인하지 못했습니다. 다시 시도하면 같은 요청 번호로 보내므로 잔액이 두 번 지급되지 않습니다.
            </p>
          )}
        </Notice>
      )}
    </div>
  )
}
