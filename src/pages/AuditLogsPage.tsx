import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { getAuditLogs, type AuditSearch } from '../api/admin'
import type { AuditAction, AuditOutcome } from '../api/types'
import { Notice } from '../components/Notice'
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ACTIONS,
  AUDIT_OUTCOME_LABEL,
  auditActor,
  auditOutcomeClass,
  auditSearchFromParams,
  auditSearchToParams,
} from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'

const PAGE_SIZE = 50

/**
 * 감사 로그: 누가, 언제, 무엇을, 어느 계좌에, 결과는. 조회 조건과 쪽 번호는 주소에 담아,
 * 다른 관리자에게 링크로 "이 계좌 기록" 을 그대로 넘길 수 있게 한다. 이 화면을 연 것도 서버에 기록된다.
 */
export function AuditLogsPage() {
  const [params, setParams] = useSearchParams()
  const search = auditSearchFromParams(params)

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>API 요청마다 남는 감사 기록입니다. 실패하거나 거부된 시도도 남고, 기록은 고치거나 지울 수 없습니다.</p>
      </div>
      {/* 주소가 바뀌면(뒤로 가기 등) 입력란도 주소 값으로 다시 채운다 */}
      <AuditFilters key={params.toString()} initial={search} onSearch={(s) => setParams(auditSearchToParams(s))} />
      <AuditTable search={search} onPage={(page) => setParams(auditSearchToParams({ ...search, page }))} />
    </div>
  )
}

function AuditFilters({ initial, onSearch }: { initial: AuditSearch; onSearch: (search: AuditSearch) => void }) {
  const [form, setForm] = useState<AuditSearch>({ ...initial, page: 0 })
  const set = (key: keyof AuditSearch) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value || undefined }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch({ ...form, page: 0 })
  }

  return (
    <section className="card">
      <form className="filter-form" onSubmit={submit} role="search" aria-label="감사 기록 검색">
        <div className="field">
          <label htmlFor="audit-actor">아이디</label>
          <input id="audit-actor" className="input" value={form.actor ?? ''} onChange={set('actor')} maxLength={50} />
        </div>
        <div className="field">
          <label htmlFor="audit-account">계좌 id</label>
          <input
            id="audit-account"
            className="input"
            inputMode="numeric"
            pattern="\d*"
            value={form.accountId ?? ''}
            onChange={set('accountId')}
          />
        </div>
        <div className="field">
          <label htmlFor="audit-action">작업</label>
          <select id="audit-action" className="input" value={form.action ?? ''} onChange={set('action')}>
            <option value="">전체</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {AUDIT_ACTION_LABEL[action]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="audit-outcome">결과</label>
          <select id="audit-outcome" className="input" value={form.outcome ?? ''} onChange={set('outcome')}>
            <option value="">전체</option>
            {(Object.keys(AUDIT_OUTCOME_LABEL) as AuditOutcome[]).map((outcome) => (
              <option key={outcome} value={outcome}>
                {AUDIT_OUTCOME_LABEL[outcome]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="audit-from">시작일</label>
          <input id="audit-from" className="input" type="date" value={form.from ?? ''} onChange={set('from')} />
        </div>
        <div className="field">
          <label htmlFor="audit-to">종료일</label>
          <input id="audit-to" className="input" type="date" value={form.to ?? ''} onChange={set('to')} />
        </div>
        <div className="filter-actions">
          <button type="submit" className="btn">
            검색
          </button>
          <button type="button" className="btn ghost" onClick={() => onSearch({})}>
            초기화
          </button>
        </div>
      </form>
    </section>
  )
}

function AuditTable({ search, onPage }: { search: AuditSearch; onPage: (page: number) => void }) {
  const page = search.page ?? 0
  const logs = useQuery({
    queryKey: ['admin', 'audit-logs', search],
    queryFn: ({ signal }) => getAuditLogs(search, PAGE_SIZE, signal),
    placeholderData: keepPreviousData,
  })
  const data = logs.data

  return (
    <section className="card">
      <div className="card-title">
        <h2>감사 기록</h2>
        <p>{data ? `${data.totalElements.toLocaleString('ko-KR')}건 · 최신순` : ''}</p>
      </div>

      {logs.isError && <Notice tone="error" title={errorMessage(logs.error)} />}
      {logs.isPending && (
        <div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton skeleton-row" />
          ))}
        </div>
      )}

      {data && data.content.length === 0 && (
        <div className="empty">
          <strong>조건에 맞는 기록이 없습니다</strong>
          조건을 줄이거나 초기화해 보세요.
        </div>
      )}

      {data && data.content.length > 0 && (
        <div className={`table-wrap ${logs.isFetching ? 'refreshing' : ''}`}>
          <table className="table">
            <thead>
              <tr>
                <th>시각</th>
                <th>사용자</th>
                <th>작업</th>
                <th>계좌</th>
                <th>결과</th>
                <th className="hide-sm">요청</th>
                <th className="hide-sm">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.content.map((entry) => (
                <tr key={entry.id}>
                  <td className="muted">{formatDateTime(entry.occurredAt)}</td>
                  <td>{auditActor(entry)}</td>
                  <td>{AUDIT_ACTION_LABEL[entry.action as AuditAction] ?? entry.action}</td>
                  <td className="mono">
                    {entry.targetAccountId !== null && (
                      <Link to={`/accounts/${entry.targetAccountId}`}>{entry.targetAccountId}</Link>
                    )}
                    {entry.counterpartAccountId !== null && <> → {entry.counterpartAccountId}</>}
                  </td>
                  <td>
                    <span className={`status ${auditOutcomeClass(entry.outcome)}`}>
                      {AUDIT_OUTCOME_LABEL[entry.outcome]} {entry.statusCode}
                    </span>
                    {entry.errorCode && <div className="muted audit-code">{entry.errorCode}</div>}
                  </td>
                  <td className="hide-sm">
                    <div className="mono audit-path">
                      {entry.httpMethod} {entry.path}
                    </div>
                    {/* 고객 문의의 응답 헤더 X-Request-Id 와 맞춰 볼 수 있게 보여 준다 */}
                    <div className="muted mono audit-code" title="X-Request-Id">
                      {entry.requestId} · {entry.durationMs}ms
                    </div>
                  </td>
                  <td className="muted mono hide-sm">{entry.clientIp}</td>
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
