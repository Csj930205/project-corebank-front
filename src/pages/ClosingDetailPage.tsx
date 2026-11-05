import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { getClosing, runClosing } from '../api/admin'
import type { ClosingDetail, ClosingMismatch, ClosingTotal } from '../api/types'
import { AdminNav } from '../components/AdminNav'
import { Notice } from '../components/Notice'
import {
  CLOSING_STATUS_LABEL,
  MISMATCH_LABEL,
  TRANSACTION_TYPE_LABEL,
  TRANSACTION_TYPE_ORDER,
  closingDuration,
  closingStatusClass,
  mismatchValue,
} from '../lib/closing'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWonString, parseAccountId } from '../lib/format'

/** 마감 결과 상세: 요약, 일계표, 불일치 내역. */
export function ClosingDetailPage() {
  const params = useParams()
  const id = parseAccountId(params.id ?? '')
  if (id === null) {
    return <Notice tone="error" title="잘못된 마감 주소입니다." />
  }
  return <ClosingDetailView key={id} id={id} />
}

function ClosingDetailView({ id }: { id: number }) {
  const detail = useQuery({
    queryKey: ['admin', 'closing', id],
    queryFn: ({ signal }) => getClosing(id, signal),
  })

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>
          <Link to="/admin/closings">← 마감 기록</Link>
        </p>
      </div>
      <AdminNav />
      {detail.isPending && <div className="skeleton skeleton-hero" aria-label="마감 결과를 불러오는 중" />}
      {detail.isError && <Notice tone="error" title={errorMessage(detail.error)} />}
      {detail.data && <ClosingResult detail={detail.data} />}
    </div>
  )
}

function ClosingResult({ detail }: { detail: ClosingDetail }) {
  const { closing, totals, mismatches } = detail
  const duration = closingDuration(closing)
  const mismatchCount = closing.mismatchCount ?? 0

  return (
    <>
      <section className="card">
        <div className="closing-head">
          <div>
            <p className="muted">영업일</p>
            <h2 className="closing-date">{closing.businessDate}</h2>
          </div>
          <span className={`status status-lg ${closingStatusClass(closing.status)}`}>
            {CLOSING_STATUS_LABEL[closing.status]}
          </span>
        </div>
        <p className="muted closing-meta">
          실행 #{closing.id} · {closing.trigger === 'SCHEDULED' ? '자동 실행' : `수동 실행 (${closing.requestedBy ?? '-'})`}
          {' · '}
          {formatDateTime(closing.startedAt)} 시작{duration && ` · ${duration} 걸림`}
          {closing.jobExecutionId !== null && ` · 배치 실행 #${closing.jobExecutionId}`}
        </p>

        {closing.status === 'BALANCED' && (
          <Notice tone="success" title="불일치가 없습니다.">
            모든 계좌의 잔액이 원장과 맞고, 모든 거래의 차변과 대변이 같습니다.
          </Notice>
        )}
        {closing.status === 'UNBALANCED' && (
          <Notice tone="error" title={`불일치 ${mismatchCount.toLocaleString('ko-KR')}건을 찾았습니다.`}>
            아래 내역을 확인하고 원인을 고친 뒤 같은 날짜로 다시 마감하세요. 이 기록은 그대로 남습니다.
          </Notice>
        )}
        {closing.status === 'FAILED' && (
          <Notice tone="error" title="배치가 끝까지 실행되지 못했습니다. 대사 결과를 믿을 수 없습니다.">
            {closing.errorMessage && <p className="mono break">{closing.errorMessage}</p>}
            <p>원인을 확인한 뒤 다시 마감하세요.</p>
          </Notice>
        )}
        {closing.status === 'RUNNING' && <Notice tone="info" title="실행 중입니다. 잠시 뒤 새로 고쳐 주세요." />}

        <div className="stats closing-stats">
          <div className="stat">
            <span>대사한 계좌</span>
            <strong>{closing.accountCount === null ? '-' : `${closing.accountCount.toLocaleString('ko-KR')}개`}</strong>
            <small>마감 시점까지 개설된 계좌</small>
          </div>
          <div className="stat">
            <span>예금 잔액 합계</span>
            <strong className="stat-money">
              {closing.depositLiability === null ? '-' : formatWonString(closing.depositLiability)}
            </strong>
            <small>마감 시점 원장 기준</small>
          </div>
          <div className={`stat ${mismatchCount > 0 ? 'stat-bad' : closing.status === 'BALANCED' ? 'stat-ok' : ''}`}>
            <span>불일치</span>
            <strong>{closing.mismatchCount === null ? '-' : `${mismatchCount.toLocaleString('ko-KR')}건`}</strong>
            <small>계좌·거래·이체·가계정 점검</small>
          </div>
          <RerunStat businessDate={closing.businessDate} />
        </div>
      </section>

      <div className="grid-2">
        <TotalsCard totals={totals} />
        <MismatchesCard mismatches={mismatches} total={mismatchCount} />
      </div>
    </>
  )
}

/** 같은 날 다시 마감. 불일치를 고친 뒤 확인하는 용도라, 결과 화면에서 바로 실행할 수 있게 둔다. */
function RerunStat({ businessDate }: { businessDate: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const inFlight = useRef(false)
  const mutation = useMutation({
    mutationFn: () => runClosing(businessDate),
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin', 'closing', detail.closing.id], detail)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'closings'] })
      navigate(`/admin/closings/${detail.closing.id}`)
    },
    onSettled: () => {
      inFlight.current = false
    },
  })

  return (
    <div className="stat">
      <span>다시 마감</span>
      <button
        type="button"
        className="btn secondary"
        disabled={mutation.isPending}
        onClick={() => {
          if (inFlight.current) return
          inFlight.current = true
          mutation.mutate()
        }}
      >
        {mutation.isPending && <span className="spinner" aria-hidden />}
        {mutation.isPending ? '대사 중' : `${businessDate} 다시 마감`}
      </button>
      <small>{mutation.isError ? errorMessage(mutation.error) : '이전 기록은 그대로 남습니다'}</small>
    </div>
  )
}

/** 일계표. 그날 거래가 없는 종류는 0건으로 보여 준다. */
function TotalsCard({ totals }: { totals: ClosingTotal[] }) {
  const byType = new Map(totals.map((t) => [t.type, t]))
  return (
    <section className="card">
      <div className="card-title">
        <h2>일계표</h2>
        <p>그날 생긴 거래의 종류별 합계</p>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>거래 종류</th>
              <th className="num">건수</th>
              <th className="num">금액</th>
            </tr>
          </thead>
          <tbody>
            {TRANSACTION_TYPE_ORDER.map((type) => {
              const total = byType.get(type)
              return (
                <tr key={type}>
                  <td>{TRANSACTION_TYPE_LABEL[type]}</td>
                  <td className="num">{(total?.count ?? 0).toLocaleString('ko-KR')}건</td>
                  <td className="num strong">{formatWonString(total?.amount ?? '0')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** 무엇이 어긋났는지. 계좌 불일치는 계좌 화면으로 바로 갈 수 있게 링크를 단다. */
function MismatchTarget({ mismatch }: { mismatch: ClosingMismatch }) {
  if (mismatch.type === 'BALANCE_LEDGER_MISMATCH' || mismatch.type === 'SNAPSHOT_MISMATCH') {
    return <Link to={`/accounts/${mismatch.accountId}`}>계좌 {mismatch.accountId}</Link>
  }
  if (mismatch.transactionId !== null) {
    return (
      <>
        거래 #{mismatch.transactionId}
        {mismatch.accountId !== null && (
          <>
            {' '}
            (<Link to={`/accounts/${mismatch.accountId}`}>계좌 {mismatch.accountId}</Link>)
          </>
        )}
      </>
    )
  }
  if (mismatch.transferId !== null) {
    return <>이체 #{mismatch.transferId}</>
  }
  return <>은행 전체</>
}

function MismatchesCard({ mismatches, total }: { mismatches: ClosingMismatch[]; total: number }) {
  return (
    <section className="card">
      <div className="card-title">
        <h2>불일치 내역</h2>
        <p>원장 기준 값과 실제 값</p>
      </div>
      {mismatches.length === 0 ? (
        <div className="empty">
          <strong>불일치가 없습니다</strong>
        </div>
      ) : (
        <>
          <ul className="mismatch-list">
            {mismatches.map((m) => (
              <li key={m.id}>
                <div className="mismatch-top">
                  <span className="status status-closed">{MISMATCH_LABEL[m.type]}</span>
                  <span className="mismatch-target">
                    <MismatchTarget mismatch={m} />
                  </span>
                </div>
                <dl className="mismatch-values">
                  <div>
                    <dt>원장 기준</dt>
                    <dd>{mismatchValue(m.type, m.expected)}</dd>
                  </div>
                  <div>
                    <dt>실제</dt>
                    <dd className="danger-text">{mismatchValue(m.type, m.actual)}</dd>
                  </div>
                </dl>
                <p className="muted mismatch-detail">{m.detail}</p>
              </li>
            ))}
          </ul>
          {total > mismatches.length && (
            <p className="hint left">
              전체 {total.toLocaleString('ko-KR')}건 중 앞의 {mismatches.length}건만 보여 줍니다.
            </p>
          )}
        </>
      )}
    </section>
  )
}
