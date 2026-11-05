import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { getAdminAccounts, getAdminSummary } from '../api/admin'
import type { AccountStatus, AdminSummary } from '../api/types'
import { AdminNav } from '../components/AdminNav'
import { Notice } from '../components/Notice'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWon, formatWonString } from '../lib/format'

const PAGE_SIZE = 20
const STATUS_OPTIONS: { value: '' | AccountStatus; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'ACTIVE', label: '정상' },
  { value: 'CLOSED', label: '해지' },
]

/** 관리자 첫 화면: 요약 카드 + 계좌 목록. 검색 조건은 주소(?query=&status=&page=)에 담아 새로 고침·뒤로 가기에도 유지한다. */
export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('query') ?? ''
  const status = (params.get('status') ?? '') as '' | AccountStatus
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0)

  const update = (next: { query?: string; status?: string; page?: number }) => {
    const merged = { query, status, page, ...next }
    const search = new URLSearchParams()
    if (merged.query) search.set('query', merged.query)
    if (merged.status) search.set('status', merged.status)
    if (merged.page) search.set('page', String(merged.page))
    setParams(search)
  }

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>전체 계좌 현황과 원장 점검 결과입니다.</p>
      </div>
      <AdminNav />
      <SummaryCards />
      <AccountTable
        query={query}
        status={status}
        page={page}
        onSearch={(q) => update({ query: q, page: 0 })}
        onStatus={(s) => update({ status: s, page: 0 })}
        onPage={(p) => update({ page: p })}
      />
    </div>
  )
}

function SummaryCards() {
  const summary = useQuery({ queryKey: ['admin', 'summary'], queryFn: ({ signal }) => getAdminSummary(signal) })

  if (summary.isPending) {
    return (
      <div className="stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton stat-skeleton" />
        ))}
      </div>
    )
  }
  if (summary.isError) {
    return <Notice tone="error" title={errorMessage(summary.error)} />
  }

  const s = summary.data
  return (
    <div className="stats">
      <div className="stat">
        <span>전체 계좌</span>
        <strong>{s.accountCount.toLocaleString('ko-KR')}개</strong>
        <small>
          정상 {s.activeAccountCount.toLocaleString('ko-KR')} · 해지 {s.closedAccountCount.toLocaleString('ko-KR')}
        </small>
      </div>
      <div className="stat">
        <span>예금 잔액 합계</span>
        <strong className="stat-money">{formatWonString(s.totalBalance)}</strong>
        <small>모든 계좌 잔액의 합</small>
      </div>
      <div className="stat">
        <span>원장 거래</span>
        <strong>{s.transactionCount.toLocaleString('ko-KR')}건</strong>
        <small>
          오늘 {s.todayTransactionCount.toLocaleString('ko-KR')}건 · 이체 {s.transferCount.toLocaleString('ko-KR')}건
        </small>
      </div>
      <LedgerStat ledger={s.ledger} />
    </div>
  )
}

/** 원장 점검. 세 값이 모두 0 이어야 정상이다. 하나라도 어긋나면 어떤 항목인지 보여 준다. */
function LedgerStat({ ledger }: { ledger: AdminSummary['ledger'] }) {
  return (
    <div className={`stat ${ledger.balanced ? 'stat-ok' : 'stat-bad'}`}>
      <span>원장 점검</span>
      <strong>{ledger.balanced ? '정상' : '불일치'}</strong>
      <small>
        차변−대변 {ledger.debitMinusCredit} · 가계정 {ledger.clearingBalance} · 잔액 불일치 계좌{' '}
        {ledger.mismatchedAccounts}
      </small>
    </div>
  )
}

interface TableProps {
  query: string
  status: '' | AccountStatus
  page: number
  onSearch: (query: string) => void
  onStatus: (status: string) => void
  onPage: (page: number) => void
}

/**
 * 검색칸. 주소의 검색어가 바뀌면(뒤로 가기 등) key 가 바뀌어 새로 만들어지므로, 입력칸이 주소와 항상 같은 값에서 시작한다.
 */
function SearchForm({ query, onSearch }: { query: string; onSearch: (query: string) => void }) {
  const [input, setInput] = useState(query)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(input.trim())
  }
  return (
    <form onSubmit={submit} className="search" role="search">
      <input
        className="input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="계좌번호 앞자리 또는 예금주 이름"
        aria-label="계좌 검색"
        maxLength={100}
      />
      <button type="submit" className="btn secondary">
        검색
      </button>
    </form>
  )
}

function AccountTable({ query, status, page, onSearch, onStatus, onPage }: TableProps) {
  const navigate = useNavigate()

  const accounts = useQuery({
    queryKey: ['admin', 'accounts', query, status, page],
    queryFn: ({ signal }) =>
      getAdminAccounts({ query: query || undefined, status: status || undefined, page, size: PAGE_SIZE }, signal),
    // 쪽을 넘길 때 이전 목록을 잠시 보여 줘서 표가 깜빡이지 않게 한다.
    placeholderData: keepPreviousData,
  })

  const data = accounts.data

  return (
    <section className="card">
      <div className="card-title">
        <h2>계좌 목록</h2>
        <p>{data ? `${data.totalElements.toLocaleString('ko-KR')}건 · 최신 개설순` : ''}</p>
      </div>

      <div className="toolbar">
        <SearchForm key={query} query={query} onSearch={onSearch} />
        <div className="filter" role="group" aria-label="상태">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={status === option.value}
              onClick={() => onStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {accounts.isError && <Notice tone="error" title={errorMessage(accounts.error)} />}
      {accounts.isPending && (
        <div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton skeleton-row" />
          ))}
        </div>
      )}

      {data && data.content.length === 0 && (
        <div className="empty">
          <strong>조건에 맞는 계좌가 없습니다</strong>
          검색어나 상태를 바꿔 보세요.
        </div>
      )}

      {data && data.content.length > 0 && (
        <div className={`table-wrap ${accounts.isFetching ? 'refreshing' : ''}`}>
          <table className="table">
            <thead>
              <tr>
                <th className="hide-sm">id</th>
                <th>계좌번호</th>
                <th>예금주</th>
                <th>상태</th>
                <th className="num">잔액</th>
                <th className="hide-sm">개설</th>
              </tr>
            </thead>
            <tbody>
              {data.content.map((account) => (
                <tr
                  key={account.id}
                  className="row-link"
                  tabIndex={0}
                  onClick={() => navigate(`/accounts/${account.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/accounts/${account.id}`)}
                >
                  <td className="muted hide-sm">{account.id}</td>
                  <td className="mono">{account.accountNumber}</td>
                  {/* 이름은 100자까지 될 수 있어 줄이고, 마우스를 올리면 전체를 보여 준다 */}
                  <td className="owner" title={account.ownerName}>
                    {account.ownerName}
                  </td>
                  <td>
                    <span className={`status ${account.status === 'ACTIVE' ? 'status-active' : 'status-closed'}`}>
                      {account.status === 'ACTIVE' ? '정상' : '해지'}
                    </span>
                  </td>
                  <td className="num strong">{formatWon(account.balance)}</td>
                  <td className="muted hide-sm">{formatDateTime(account.createdAt).slice(0, 10)}</td>
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
