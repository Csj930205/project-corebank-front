import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ApiError, type ApiResult } from '../api/client'
import { getTimeDeposit, terminateTimeDeposit } from '../api/corebank'
import type { TimeDeposit, TimeDepositEstimate } from '../api/types'
import { useIdempotentMutation } from '../hooks/useIdempotentMutation'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWon } from '../lib/format'
import { formatRate } from '../lib/interest'
import {
  TIME_DEPOSIT_STATUS_LABEL,
  formatTerm,
  progressPercent,
  quoteTitle,
  timeDepositStatusClass,
  todayString,
} from '../lib/timeDeposit'
import { Notice } from './Notice'

function refresh(queryClient: QueryClient, deposit: TimeDeposit) {
  void queryClient.invalidateQueries({ queryKey: ['time-deposit', deposit.accountId] })
  void queryClient.invalidateQueries({ queryKey: ['account', deposit.accountId] })
  void queryClient.invalidateQueries({ queryKey: ['history', deposit.accountId] })
  void queryClient.invalidateQueries({ queryKey: ['account', deposit.payoutAccountId] })
  void queryClient.invalidateQueries({ queryKey: ['history', deposit.payoutAccountId] })
  void queryClient.invalidateQueries({ queryKey: ['my-accounts'] })
  void queryClient.invalidateQueries({ queryKey: ['admin'] })
}

/** 이자 계산 표. 세전 → 세금 → 세후 → 받을 금액 */
function EstimateFacts({ estimate }: { estimate: TimeDepositEstimate }) {
  return (
    <dl className="closure-facts">
      <div>
        <dt>적용 이율</dt>
        <dd>{formatRate(estimate.appliedRate)}</dd>
      </div>
      <div>
        <dt>이자 일수</dt>
        <dd>{estimate.days}일</dd>
      </div>
      <div>
        <dt>세전 이자</dt>
        <dd>{formatWon(estimate.grossInterest)}</dd>
      </div>
      <div>
        <dt>세금(15.4%)</dt>
        <dd>{formatWon(estimate.tax)}</dd>
      </div>
      <div>
        <dt>세후 이자</dt>
        <dd>{formatWon(estimate.netInterest)}</dd>
      </div>
      <div>
        <dt>연결계좌로</dt>
        <dd>{formatWon(estimate.payout)}</dd>
      </div>
    </dl>
  )
}

/**
 * 정기예금 계좌 화면의 본문: 약정(원금·약정이율·기간), 만기 예상, 오늘 해지 예상, 중도해지 버튼. 해지했으면 해지 결과.
 * 계산은 모두 서버가 한다(중도해지이율 표, 세금 버림). 화면은 받은 숫자만 보여 준다.
 */
export function TimeDepositPanel({ accountId, canMove }: { accountId: number; canMove: boolean }) {
  const deposit = useQuery({
    queryKey: ['time-deposit', accountId],
    queryFn: ({ signal }) => getTimeDeposit(accountId, signal),
  })

  if (deposit.isPending) {
    return <div className="skeleton skeleton-row" aria-label="정기예금을 불러오는 중" />
  }
  if (deposit.isError) {
    return <Notice tone="error" title={errorMessage(deposit.error)} />
  }
  const d = deposit.data
  const percent = progressPercent(d.startDate, d.maturityDate, todayString())

  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-title">
          <h2>정기예금 약정</h2>
          <span className={`status ${timeDepositStatusClass(d.status)}`}>{TIME_DEPOSIT_STATUS_LABEL[d.status]}</span>
        </div>
        <dl className="closure-facts">
          <div>
            <dt>원금</dt>
            <dd>{formatWon(d.principal)}</dd>
          </div>
          <div>
            <dt>약정이율</dt>
            <dd>{formatRate(d.annualRate)} 고정</dd>
          </div>
          <div>
            <dt>기간</dt>
            <dd>
              {formatTerm(d.termMonths)} · {d.startDate} ~ {d.maturityDate}
            </dd>
          </div>
          <div>
            <dt>연결계좌</dt>
            <dd>
              <Link to={`/accounts/${d.payoutAccountId}`}>계좌 id {d.payoutAccountId}</Link>
            </dd>
          </div>
        </dl>
        {d.status === 'ACTIVE' && (
          <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
            aria-label="가입 기간 진행률">
            <span style={{ width: `${percent}%` }} />
          </div>
        )}
        <h3 className="subhead">만기까지 두면</h3>
        <EstimateFacts estimate={d.atMaturity} />
      </section>

      <section className="card">
        {d.settlement ? (
          <>
            <div className="card-title">
              <h2>해지 결과</h2>
              <p>{formatDateTime(d.settlement.settledAt)}</p>
            </div>
            <dl className="closure-facts">
              <div>
                <dt>적용 이율</dt>
                <dd>{formatRate(d.settlement.appliedRate)}</dd>
              </div>
              <div>
                <dt>세후 이자</dt>
                <dd>{formatWon(d.settlement.netInterest)}</dd>
              </div>
              <div>
                <dt>연결계좌로 보낸 금액</dt>
                <dd>{formatWon(d.settlement.payout)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <div className="card-title">
              <h2>{d.quote ? quoteTitle(d.quote) : '해지'}</h2>
              <p>오늘 기준 예상</p>
            </div>
            {d.quote && <EstimateFacts estimate={d.quote} />}
            {canMove ? (
              <TerminationForm deposit={d} />
            ) : (
              <Notice tone="info" title="해지는 창구 역할이나 예금주만 할 수 있습니다." />
            )}
          </>
        )}
      </section>
    </div>
  )
}

/**
 * 중도해지. 되돌릴 수 없어 두 번 눌러야 요청한다. 돈이 나가는 요청이라 계좌 해지와 같은 멱등성 규칙을 쓴다:
 * 결과를 모르는 실패 뒤 다시 시도하면 같은 키로 보내, 이미 해지됐어도 409 가 아니라 처음 결과를 받는다.
 */
function TerminationForm({ deposit }: { deposit: TimeDeposit }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const maturity = deposit.quote?.trigger === 'MATURITY'

  const mutation = useIdempotentMutation<void, ApiResult<TimeDeposit>>({
    fingerprint: () => `td-close|${deposit.accountId}`,
    mutationFn: (_v, key) => terminateTimeDeposit(deposit.accountId, key),
    onSuccess: () => refresh(queryClient, deposit),
  })

  const closedElsewhere = mutation.error instanceof ApiError && mutation.error.code === 'ACCOUNT_CLOSED'
  useEffect(() => {
    if (closedElsewhere) refresh(queryClient, deposit)
  }, [closedElsewhere, queryClient, deposit])

  return (
    <div>
      <p className="closure-warning">
        {maturity
          ? '만기일이 지났습니다. 해지하면 약정이율로 이자를 받습니다.'
          : '만기 전에 해지하면 약정이율보다 낮은 중도해지이율을 받습니다. 되돌릴 수 없습니다.'}{' '}
        원금과 이자는 연결계좌로 들어갑니다.
      </p>
      {!confirming ? (
        <button type="button" className="btn danger block" onClick={() => setConfirming(true)}>
          {maturity ? '만기 해지' : '중도해지'}
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
          <button type="button" className="btn danger" disabled={mutation.isPending} onClick={() => mutation.submit()}>
            {mutation.isPending && <span className="spinner" aria-hidden />}
            {mutation.isPending ? '해지 처리 중' : mutation.pendingRetry ? '해지 다시 시도' : '해지 확정'}
          </button>
        </div>
      )}
      {mutation.isSuccess && mutation.data.replayed && (
        <Notice tone="info" title="이미 처리된 요청이라 처음 결과를 다시 받았습니다. 지급은 한 번만 했습니다." />
      )}
      {mutation.isError && (
        <Notice tone="error" title={errorMessage(mutation.error)}>
          {mutation.pendingRetry && (
            <p>처리 여부를 확인하지 못했습니다. 다시 시도하면 같은 요청 번호로 보내므로 두 번 지급되지 않습니다.</p>
          )}
        </Notice>
      )}
    </div>
  )
}
