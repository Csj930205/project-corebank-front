import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { getClosings, runClosing } from '../api/admin'
import type { ClosingSummary } from '../api/types'
import { Notice } from '../components/Notice'
import {
  CLOSING_STATUS_LABEL,
  closingDuration,
  closingStatusClass,
  yesterday,
} from '../lib/closing'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWonString } from '../lib/format'

const PAGE_SIZE = 20

/** 일 마감 첫 화면: 마감 실행 + 실행 기록 목록. 쪽 번호는 주소(?page=)에 담는다. */
export function ClosingsPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0)

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>영업일마다 계좌 잔액과 원장을 대사한 결과입니다. 매일 00:10 에 전날을 자동 마감합니다.</p>
      </div>
      <RunClosingCard />
      <ClosingTable page={page} onPage={(p) => setParams(p ? { page: String(p) } : {})} />
    </div>
  )
}

/**
 * 수동 마감. 서버가 배치를 끝까지 돌린 뒤 응답하므로, 응답이 오면 바로 결과 화면으로 간다.
 * 마감은 돈을 움직이지 않고 같은 날을 다시 실행해도 되므로 멱등성 키를 쓰지 않는다. 대신 연타로 두 번 실행되지 않게 막는다.
 */
function RunClosingCard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const inputId = useId()
  const max = yesterday()
  const [date, setDate] = useState(max)
  // 버튼 비활성화는 다시 그린 뒤에 반영되므로, 즉시 바뀌는 ref 로 한 번 더 막는다(useIdempotentMutation 과 같은 이유).
  const inFlight = useRef(false)

  const mutation = useMutation({
    mutationFn: runClosing,
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin', 'closing', detail.closing.id], detail)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'closings'] })
      navigate(`/admin/closings/${detail.closing.id}`)
    },
    onSettled: () => {
      inFlight.current = false
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (inFlight.current || !date) return
    inFlight.current = true
    mutation.mutate(date)
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>마감 실행</h2>
        <p>오늘과 미래는 아직 끝나지 않아 마감할 수 없습니다</p>
      </div>
      <form className="run-closing" onSubmit={submit}>
        <div className="field">
          <label htmlFor={inputId}>영업일</label>
          <input
            id={inputId}
            className="input"
            type="date"
            value={date}
            max={max}
            required
            onChange={(e) => {
              setDate(e.target.value)
              mutation.reset()
            }}
          />
        </div>
        <button type="submit" className="btn" disabled={mutation.isPending || !date}>
          {mutation.isPending && <span className="spinner" aria-hidden />}
          {mutation.isPending ? '대사 중' : '마감 실행'}
        </button>
      </form>
      {mutation.isPending && <p className="hint left">배치가 끝날 때까지 기다립니다. 계좌가 많으면 시간이 걸립니다.</p>}
      {mutation.isError && <Notice tone="error" title={errorMessage(mutation.error)} />}
    </section>
  )
}

function ClosingTable({ page, onPage }: { page: number; onPage: (page: number) => void }) {
  const navigate = useNavigate()
  const closings = useQuery({
    queryKey: ['admin', 'closings', page],
    queryFn: ({ signal }) => getClosings(page, PAGE_SIZE, signal),
    placeholderData: keepPreviousData,
  })
  const data = closings.data
  const open = (closing: ClosingSummary) => navigate(`/admin/closings/${closing.id}`)

  return (
    <section className="card">
      <div className="card-title">
        <h2>마감 기록</h2>
        <p>{data ? `${data.totalElements.toLocaleString('ko-KR')}건 · 최근 실행순` : ''}</p>
      </div>

      {closings.isError && <Notice tone="error" title={errorMessage(closings.error)} />}
      {closings.isPending && (
        <div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton skeleton-row" />
          ))}
        </div>
      )}

      {data && data.content.length === 0 && (
        <div className="empty">
          <strong>아직 마감 기록이 없습니다</strong>
          위에서 어제 날짜로 첫 마감을 실행해 보세요.
        </div>
      )}

      {data && data.content.length > 0 && (
        <div className={`table-wrap ${closings.isFetching ? 'refreshing' : ''}`}>
          <table className="table">
            <thead>
              <tr>
                <th>영업일</th>
                <th>결과</th>
                <th className="num">불일치</th>
                <th className="num hide-sm">계좌</th>
                <th className="num hide-sm">예금 잔액</th>
                <th className="hide-sm">실행</th>
                <th className="hide-sm">시작</th>
              </tr>
            </thead>
            <tbody>
              {data.content.map((closing) => (
                <tr
                  key={closing.id}
                  className="row-link"
                  tabIndex={0}
                  onClick={() => open(closing)}
                  onKeyDown={(e) => e.key === 'Enter' && open(closing)}
                >
                  <td className="mono">
                    <Link to={`/admin/closings/${closing.id}`} onClick={(e) => e.stopPropagation()}>
                      {closing.businessDate}
                    </Link>
                  </td>
                  <td>
                    <span className={`status ${closingStatusClass(closing.status)}`}>
                      {CLOSING_STATUS_LABEL[closing.status]}
                    </span>
                  </td>
                  <td className={`num ${closing.mismatchCount ? 'strong danger-text' : ''}`}>
                    {closing.mismatchCount === null ? '-' : `${closing.mismatchCount.toLocaleString('ko-KR')}건`}
                  </td>
                  <td className="num hide-sm">{closing.accountCount?.toLocaleString('ko-KR') ?? '-'}</td>
                  <td className="num hide-sm">
                    {closing.depositLiability === null ? '-' : formatWonString(closing.depositLiability)}
                  </td>
                  <td className="muted hide-sm">
                    {closing.trigger === 'SCHEDULED' ? '자동' : `수동 · ${closing.requestedBy ?? ''}`}
                  </td>
                  <td className="muted hide-sm">
                    {formatDateTime(closing.startedAt)}
                    {closingDuration(closing) && ` (${closingDuration(closing)})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
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
    </section>
  )
}
