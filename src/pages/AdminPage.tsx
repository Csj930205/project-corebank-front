import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { getAdminAccounts, getAdminSummary, type AccountSearch } from '../api/admin'
import type { AccountStatus, AdminSummary } from '../api/types'
import { Notice } from '../components/Notice'
import {
  accountSearchFromParams,
  accountSearchToParams,
  hasRangeFilter,
  parseBalanceInput,
  rangeProblem,
} from '../lib/accountSearch'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWon, formatWonString } from '../lib/format'

const PAGE_SIZE = 20
const STATUS_OPTIONS: { value: '' | AccountStatus; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'ACTIVE', label: '정상' },
  { value: 'CLOSED', label: '해지' },
]

/**
 * 관리자 첫 화면: 요약 카드 + 계좌 목록. 검색 조건(검색어, 상태, 개설일·잔액 범위, 쪽)은 주소에 담아
 * 새로 고침·뒤로 가기에도 유지한다(lib/accountSearch).
 */
export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const search = accountSearchFromParams(params)

  const update = (next: AccountSearch) => setParams(accountSearchToParams({ ...search, ...next }))

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>전체 계좌 현황과 원장 점검 결과입니다.</p>
      </div>
      <SummaryCards />
      <AccountTable
        search={search}
        // 검색 폼은 상태를 모르므로 상태는 지금 값을 그대로 둔다
        onSearch={(next) => setParams(accountSearchToParams({ ...next, status: search.status, page: 0 }))}
        onStatus={(status) => update({ status, page: 0 })}
        onPage={(page) => update({ page })}
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
  search: AccountSearch
  onSearch: (search: AccountSearch) => void
  onStatus: (status: AccountStatus | undefined) => void
  onPage: (page: number) => void
}

/** 입력칸 값. 잔액은 친 그대로(쉼표 등) 두고 검색할 때 숫자로 바꾼다. */
interface FormValues {
  query: string
  openedFrom: string
  openedTo: string
  minBalance: string
  maxBalance: string
}

function toFormValues(search: AccountSearch): FormValues {
  const won = (value?: number) => (value === undefined ? '' : value.toLocaleString('ko-KR'))
  return {
    query: search.query ?? '',
    openedFrom: search.openedFrom ?? '',
    openedTo: search.openedTo ?? '',
    minBalance: won(search.minBalance),
    maxBalance: won(search.maxBalance),
  }
}

/**
 * 검색 폼: 검색어, 개설일 범위, 잔액 범위. 주소가 바뀌면(뒤로 가기 등) key 가 바뀌어 새로 만들어지므로,
 * 입력칸이 주소와 항상 같은 값에서 시작한다. 잘못된 잔액이나 거꾸로 된 범위는 요청하지 않고 바로 알려 준다.
 */
function SearchForm({ search, onSearch }: { search: AccountSearch; onSearch: (search: AccountSearch) => void }) {
  const [form, setForm] = useState<FormValues>(() => toFormValues(search))
  const [problem, setProblem] = useState<string | null>(null)
  const set = (key: keyof FormValues) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setProblem(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const minBalance = parseBalanceInput(form.minBalance)
    const maxBalance = parseBalanceInput(form.maxBalance)
    if (minBalance === null || maxBalance === null) {
      setProblem('잔액은 0 이상의 원 단위 숫자로 입력해 주세요.')
      return
    }
    const next: AccountSearch = {
      query: form.query.trim() || undefined,
      openedFrom: form.openedFrom || undefined,
      openedTo: form.openedTo || undefined,
      minBalance,
      maxBalance,
    }
    const reversed = rangeProblem(next)
    if (reversed) {
      setProblem(reversed)
      return
    }
    onSearch(next)
  }

  return (
    <form onSubmit={submit} className="filter-form account-filters" role="search" aria-label="계좌 검색">
      <div className="field account-query">
        <label htmlFor="account-query">검색어</label>
        <input
          id="account-query"
          className="input"
          value={form.query}
          onChange={set('query')}
          placeholder="계좌번호 앞자리 또는 예금주 이름"
          maxLength={100}
        />
      </div>
      <div className="field">
        <label htmlFor="opened-from">개설일 시작</label>
        <input id="opened-from" className="input" type="date" value={form.openedFrom} onChange={set('openedFrom')} />
      </div>
      <div className="field">
        <label htmlFor="opened-to">개설일 끝</label>
        <input id="opened-to" className="input" type="date" value={form.openedTo} onChange={set('openedTo')} />
      </div>
      <div className="field">
        <label htmlFor="min-balance">최소 잔액(원)</label>
        <input
          id="min-balance"
          className="input"
          inputMode="numeric"
          value={form.minBalance}
          onChange={set('minBalance')}
          placeholder="0"
          aria-invalid={parseBalanceInput(form.minBalance) === null}
        />
      </div>
      <div className="field">
        <label htmlFor="max-balance">최대 잔액(원)</label>
        <input
          id="max-balance"
          className="input"
          inputMode="numeric"
          value={form.maxBalance}
          onChange={set('maxBalance')}
          placeholder="제한 없음"
          aria-invalid={parseBalanceInput(form.maxBalance) === null}
        />
      </div>
      <div className="filter-actions">
        <button type="submit" className="btn">
          검색
        </button>
        <button type="button" className="btn ghost" onClick={() => onSearch({})}>
          초기화
        </button>
      </div>
      {problem && (
        <p className="filter-problem" role="alert">
          {problem}
        </p>
      )}
    </form>
  )
}

function AccountTable({ search, onSearch, onStatus, onPage }: TableProps) {
  const navigate = useNavigate()
  const page = search.page ?? 0
  const status = search.status ?? ''

  const accounts = useQuery({
    queryKey: ['admin', 'accounts', search],
    queryFn: ({ signal }) => getAdminAccounts({ ...search, page, size: PAGE_SIZE }, signal),
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

      <SearchForm key={JSON.stringify(accountSearchToParams({ ...search, status: undefined, page: 0 }))} search={search} onSearch={onSearch} />
      <div className="toolbar">
        <div className="filter" role="group" aria-label="상태">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={status === option.value}
              onClick={() => onStatus(option.value || undefined)}
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
          {hasRangeFilter(search) ? '검색어, 상태, 개설일·잔액 범위를 바꿔 보세요.' : '검색어나 상태를 바꿔 보세요.'}
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
