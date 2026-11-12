import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { approveCorrection, getCorrections, rejectCorrection, requestCorrection } from '../api/admin'
import type { Correction, CorrectionStatus } from '../api/types'
import { Notice } from '../components/Notice'
import { useSession } from '../hooks/useSession'
import {
  CORRECTION_STATUS_LABEL,
  TRANSACTION_TYPE_LABEL,
  canDecide,
  correctionEffect,
  correctionStatusClass,
  statusFromParam,
} from '../lib/corrections'
import { errorMessage } from '../lib/errors'
import { can, roleOnlyHint } from '../lib/roles'
import { formatDateTime, formatWon } from '../lib/format'

const PAGE_SIZE = 20
const LIST_KEY = ['admin', 'corrections']

const TABS: { value: CorrectionStatus | undefined; param: string; label: string }[] = [
  { value: 'REQUESTED', param: 'REQUESTED', label: '승인 대기' },
  { value: 'APPROVED', param: 'APPROVED', label: '승인' },
  { value: 'REJECTED', param: 'REJECTED', label: '반려' },
  { value: undefined, param: 'ALL', label: '전체' },
]

/**
 * 거래 정정. 잘못 들어간 거래는 원장을 고치지 않고 반대 거래(역분개)로 되돌린다.
 * 창구(TELLER)가 요청하고 책임자(APPROVER)가 승인해야 돈이 움직인다(4-eyes). 역할이 하나뿐이라 요청자와 승인자는
 * 늘 다른 계정이다. 요청 칸은 창구에게만, 승인·반려 버튼은 책임자에게만 보인다. 거래내역의 "정정 요청" 을 누르면
 * ?transactionId= 가 붙어 이 화면의 요청 칸이 채워진다.
 */
export function CorrectionsPage() {
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const status = statusFromParam(params.get('status'))
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0)
  const tab = TABS.find((t) => t.value === status) ?? TABS[0]

  const move = (next: { status?: string; page?: number }) => {
    const query: Record<string, string> = {}
    const s = next.status ?? tab.param
    if (s !== 'REQUESTED') query.status = s
    if (next.page) query.page = String(next.page)
    setParams(query)
  }

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>잘못 처리된 거래를 반대 거래(역분개)로 되돌립니다. 창구가 요청하고 책임자가 승인해야 반영됩니다.</p>
      </div>
      {can(session, 'REQUEST_CORRECTION') && <RequestCard initialTransactionId={params.get('transactionId') ?? ''} />}
      <section className="card">
        <div className="segmented" role="tablist" aria-label="요청 상태">
          {TABS.map((t) => (
            <button
              key={t.param}
              type="button"
              role="tab"
              aria-selected={t === tab}
              onClick={() => move({ status: t.param, page: 0 })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CorrectionList status={status} page={page} onPage={(p) => move({ page: p })} />
      </section>
    </div>
  )
}

function RequestCard({ initialTransactionId }: { initialTransactionId: string }) {
  const queryClient = useQueryClient()
  const txId = useId()
  const reasonId = useId()
  const [transactionId, setTransactionId] = useState(initialTransactionId)
  const [reason, setReason] = useState('')
  // 연타로 같은 요청이 두 번 가지 않게 즉시 막는다(일 마감 실행과 같은 이유). 두 번째는 서버도 409 로 막는다.
  const inFlight = useRef(false)

  const mutation = useMutation({
    mutationFn: () => requestCorrection(Number(transactionId), reason.trim()),
    onSuccess: () => {
      setTransactionId('')
      setReason('')
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
    onSettled: () => {
      inFlight.current = false
    },
  })

  const valid = /^\d+$/.test(transactionId) && Number(transactionId) > 0 && reason.trim().length > 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (inFlight.current || !valid) return
    inFlight.current = true
    mutation.mutate()
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>정정 요청</h2>
        <p>거래 번호는 계좌 거래내역의 "정정 요청" 버튼으로 채울 수 있습니다</p>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor={txId}>거래 번호</label>
          <input
            id={txId}
            className="input"
            inputMode="numeric"
            value={transactionId}
            onChange={(e) => {
              setTransactionId(e.target.value.trim())
              mutation.reset()
            }}
            placeholder="예: 1024"
          />
        </div>
        <div className="field">
          <label htmlFor={reasonId}>사유</label>
          <textarea
            id={reasonId}
            className="input textarea"
            value={reason}
            maxLength={500}
            onChange={(e) => {
              setReason(e.target.value)
              mutation.reset()
            }}
            placeholder="예: 10,000원을 100,000원으로 잘못 입력"
          />
        </div>
        <button type="submit" className="btn" disabled={!valid || mutation.isPending}>
          {mutation.isPending ? '요청 중' : '정정 요청'}
        </button>
      </form>
      {mutation.isSuccess && (
        <Notice tone="success" title={`정정 요청 #${mutation.data.id} 를 올렸습니다.`}>
          다른 관리자가 승인하면 반영됩니다. 그 전까지 잔액은 그대로입니다.
        </Notice>
      )}
      {mutation.isError && <Notice tone="error" title={errorMessage(mutation.error)} />}
    </section>
  )
}

function CorrectionList({
  status,
  page,
  onPage,
}: {
  status: CorrectionStatus | undefined
  page: number
  onPage: (page: number) => void
}) {
  const corrections = useQuery({
    queryKey: [...LIST_KEY, status ?? 'ALL', page],
    queryFn: ({ signal }) => getCorrections(status, page, PAGE_SIZE, signal),
    placeholderData: keepPreviousData,
  })
  const data = corrections.data

  if (corrections.isError) return <Notice tone="error" title={errorMessage(corrections.error)} />
  if (!data) return <div className="skeleton skeleton-row" />
  if (data.content.length === 0) {
    return (
      <div className="empty">
        <strong>{status === 'REQUESTED' ? '승인을 기다리는 요청이 없습니다' : '요청이 없습니다'}</strong>
      </div>
    )
  }

  return (
    <>
      <ul className={`mismatch-list ${corrections.isFetching ? 'refreshing' : ''}`}>
        {data.content.map((correction) => (
          <CorrectionItem key={correction.id} correction={correction} />
        ))}
      </ul>
      {data.totalPages > 1 && (
        <nav className="pager" aria-label="쪽 이동">
          <button type="button" className="btn ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>
            이전
          </button>
          <span>
            {page + 1} / {data.totalPages}
          </span>
          <button
            type="button"
            className="btn ghost"
            disabled={page + 1 >= data.totalPages}
            onClick={() => onPage(page + 1)}
          >
            다음
          </button>
        </nav>
      )}
    </>
  )
}

function CorrectionItem({ correction: c }: { correction: Correction }) {
  return (
    <li>
      <div className="mismatch-top">
        <span className="mismatch-target">
          #{c.id} · {TRANSACTION_TYPE_LABEL[c.transactionType]} {formatWon(c.amount)}
        </span>
        <span className={`status ${correctionStatusClass(c.status)}`}>{CORRECTION_STATUS_LABEL[c.status]}</span>
      </div>
      <dl className="mismatch-values">
        <div>
          <dt>대상 거래</dt>
          <dd>
            #{c.transactionId} · {formatDateTime(c.transactionAt)}
          </dd>
        </div>
        <div>
          <dt>계좌</dt>
          <dd>
            <Link to={`/accounts/${c.accountId}`}>{c.accountNumber ?? `#${c.accountId}`}</Link>
            {c.ownerName && ` ${c.ownerName}`}
            {c.counterpartAccountNumber && ` → ${c.counterpartAccountNumber}`}
          </dd>
        </div>
        <div>
          <dt>요청</dt>
          <dd>
            {c.requestedBy} · {formatDateTime(c.requestedAt)}
          </dd>
        </div>
        {c.decidedBy && (
          <div>
            <dt>{c.status === 'APPROVED' ? '승인' : '반려'}</dt>
            <dd>
              {c.decidedBy} · {formatDateTime(c.decidedAt ?? '')}
            </dd>
          </div>
        )}
      </dl>
      <p className="mismatch-detail">사유: {c.reason}</p>
      {c.decisionComment && <p className="mismatch-detail muted">메모: {c.decisionComment}</p>}
      {c.reversalTransactionIds.length > 0 && (
        <p className="mismatch-detail muted">정정 거래: {c.reversalTransactionIds.map((id) => `#${id}`).join(', ')}</p>
      )}
      {c.status === 'REQUESTED' && <Decision correction={c} />}
    </li>
  )
}

/**
 * 승인·반려. 승인은 돈이 움직이고 되돌리기 어려우므로 무엇이 바뀌는지 보여 주고 한 번 더 누르게 한다.
 * 반려는 사유가 있어야 한다(요청한 관리자가 무엇을 고쳐 다시 요청할지 알아야 한다).
 */
function Decision({ correction }: { correction: Correction }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle')
  const [comment, setComment] = useState('')

  const mutation = useMutation({
    mutationFn: (kind: 'approve' | 'reject') =>
      kind === 'approve'
        ? approveCorrection(correction.id, comment.trim() || undefined)
        : rejectCorrection(correction.id, comment.trim()),
    onSuccess: () => {
      // 잔액과 거래내역이 바뀌었으니 계좌 화면도 다시 읽게 한다.
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      void queryClient.invalidateQueries({ queryKey: ['account', correction.accountId] })
      void queryClient.invalidateQueries({ queryKey: ['history'] })
    },
    onError: () => {
      // 다른 관리자가 먼저 결정했을 수 있으니 목록을 새로 읽는다.
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  if (!canDecide(correction, session?.username)) {
    return <p className="hint left">본인이 올린 요청입니다. 책임자가 승인하거나 반려합니다.</p>
  }
  if (!can(session, 'APPROVE')) {
    return <p className="hint left">승인·반려는 {roleOnlyHint('APPROVE')}</p>
  }

  return (
    <div className="correction-decision">
      {mode === 'idle' && (
        <div className="lock-actions">
          <button type="button" className="btn" onClick={() => setMode('approve')}>
            승인
          </button>
          <button type="button" className="btn secondary" onClick={() => setMode('reject')}>
            반려
          </button>
        </div>
      )}
      {mode !== 'idle' && (
        <>
          {mode === 'approve' && <p className="closure-warning">{correctionEffect(correction)}</p>}
          <input
            className="input"
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
            placeholder={mode === 'approve' ? '승인 메모 (선택)' : '반려 사유 (필수)'}
            aria-label={mode === 'approve' ? '승인 메모' : '반려 사유'}
          />
          <div className="lock-actions">
            <button
              type="button"
              className={mode === 'approve' ? 'btn' : 'btn danger'}
              disabled={mutation.isPending || (mode === 'reject' && !comment.trim())}
              onClick={() => mutation.mutate(mode)}
            >
              {mode === 'approve' ? '승인 확정' : '반려 확정'}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={mutation.isPending}
              onClick={() => {
                setMode('idle')
                setComment('')
                mutation.reset()
              }}
            >
              취소
            </button>
          </div>
        </>
      )}
      {mutation.isError && <Notice tone="error" title={errorMessage(mutation.error)} />}
    </div>
  )
}
