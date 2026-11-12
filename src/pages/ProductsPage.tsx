import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  accrueInterest,
  createProduct,
  discontinueProduct,
  getAdminProducts,
  getInterestPayments,
  settleInterest,
} from '../api/admin'
import type { DepositProduct } from '../api/types'
import { Notice } from '../components/Notice'
import { yesterday } from '../lib/closing'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWon } from '../lib/format'
import { TRIGGER_LABEL, formatRate, lastMonth, parseRate } from '../lib/interest'
import { useSession } from '../hooks/useSession'
import { can, roleOnlyHint } from '../lib/roles'

const PRODUCTS_KEY = ['admin', 'products']
const PAYMENTS_KEY = ['admin', 'interest-payments']

/**
 * 예금 상품과 이자 운영. 상품 등록·판매 중지, 이자 적립·결산 수동 실행(평소에는 매일·매달 자동), 최근 이자 지급.
 */
export function ProductsPage() {
  const canOperate = can(useSession(), 'OPERATE')
  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>
          이자는 매일 마감 잔액을 쌓아(적수) 매달 1일에 지난달분을 지급합니다. 세전 이자 = Σ(일별 잔액 × 연이율) ÷ 365, 원
          미만은 버리고, 이자소득세 14%와 지방소득세 1.4%를 뗍니다.
        </p>
      </div>
      {!canOperate && <Notice tone="info" title={`상품 등록·판매 중지와 이자 실행은 ${roleOnlyHint('OPERATE')}`} />}
      <div className={canOperate ? 'grid-2' : 'stack'}>
        <ProductList canOperate={canOperate} />
        {canOperate && <CreateProduct />}
      </div>
      {canOperate && <InterestRun />}
      <PaymentList />
    </div>
  )
}

function ProductList({ canOperate }: { canOperate: boolean }) {
  const queryClient = useQueryClient()
  const products = useQuery({ queryKey: PRODUCTS_KEY, queryFn: ({ signal }) => getAdminProducts(signal) })
  // 판매 중지는 되돌릴 수 없어 두 번 눌러야 한다(로그인 잠금 해제와 같은 방식).
  const [confirming, setConfirming] = useState<number | null>(null)
  const stop = useMutation({
    mutationFn: discontinueProduct,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onSettled: () => setConfirming(null),
  })

  return (
    <section className="card">
      <div className="card-title">
        <h2>예금 상품</h2>
        <p>판매 중지해도 이미 연 계좌는 그 금리로 계속 이자가 붙습니다</p>
      </div>
      {products.isError && <Notice tone="error" title={errorMessage(products.error)} />}
      {stop.isError && <Notice tone="error" title={errorMessage(stop.error)} />}
      {products.isPending && <div className="skeleton skeleton-row" />}
      {products.data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>상품</th>
                <th className="num">금리</th>
                <th aria-label="판매" />
              </tr>
            </thead>
            <tbody>
              {products.data.map((p: DepositProduct) => (
                <tr key={p.id}>
                  <td className="strong">
                    {p.name}
                    {p.id === 1 && <span className="muted"> (기본)</span>}
                  </td>
                  <td className="num">{formatRate(p.annualRate)}</td>
                  <td className="num">
                    {p.status === 'DISCONTINUED' ? (
                      <span className="status status-closed">판매 중지</span>
                    ) : p.id === 1 || !canOperate ? (
                      <span className="status status-active">판매 중</span>
                    ) : confirming === p.id ? (
                      <span className="lock-actions">
                        <button type="button" className="btn danger" disabled={stop.isPending} onClick={() => stop.mutate(p.id)}>
                          중지 확정
                        </button>
                        <button type="button" className="btn ghost" onClick={() => setConfirming(null)}>
                          취소
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn secondary"
                        aria-label={`${p.name} 판매 중지`}
                        onClick={() => setConfirming(p.id)}
                      >
                        판매 중지
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CreateProduct() {
  const queryClient = useQueryClient()
  const nameId = useId()
  const rateId = useId()
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const parsed = parseRate(rate)
  const create = useMutation({
    mutationFn: () => createProduct(name.trim(), parsed ?? 0),
    onSuccess: () => {
      setName('')
      setRate('')
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
  const valid = name.trim().length > 0 && parsed !== null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid && !create.isPending) create.mutate()
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>상품 등록</h2>
        <p>금리는 바꿀 수 없습니다. 금리를 바꾸려면 새 상품을 만드세요</p>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor={nameId}>상품 이름</label>
          <input
            id={nameId}
            className="input"
            value={name}
            maxLength={50}
            onChange={(e) => {
              setName(e.target.value)
              create.reset()
            }}
            placeholder="예: 자유적립 예금"
          />
        </div>
        <div className="field">
          <label htmlFor={rateId}>연이율(%)</label>
          <input
            id={rateId}
            className="input"
            inputMode="decimal"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value)
              create.reset()
            }}
            placeholder="예: 3.65"
            aria-invalid={rate !== '' && parsed === null}
          />
          {rate !== '' && parsed === null && <p className="hint left">0~20 사이, 소수 둘째 자리까지 입력하세요.</p>}
        </div>
        <button type="submit" className="btn" disabled={!valid || create.isPending}>
          {create.isPending ? '등록 중' : '상품 등록'}
        </button>
      </form>
      {create.isSuccess && <Notice tone="success" title={`${create.data.name} 상품을 등록했습니다.`} />}
      {create.isError && <Notice tone="error" title={errorMessage(create.error)} />}
    </section>
  )
}

/** 적립·결산 수동 실행. 평소에는 매일 00:20, 매달 1일 00:30 에 자동으로 돈다. 다시 실행해도 두 번 쌓거나 주지 않는다. */
function InterestRun() {
  const queryClient = useQueryClient()
  const dateId = useId()
  const monthId = useId()
  const [date, setDate] = useState(yesterday())
  const [month, setMonth] = useState(lastMonth())
  const accrue = useMutation({ mutationFn: () => accrueInterest(date) })
  const settle = useMutation({
    mutationFn: () => settleInterest(month),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY }),
  })

  return (
    <section className="card">
      <div className="card-title">
        <h2>이자 실행</h2>
        <p>평소에는 매일 00:20 적립, 매달 1일 00:30 결산이 자동으로 돕니다</p>
      </div>
      <div className="grid-2">
        <form
          className="run-closing"
          onSubmit={(e) => {
            e.preventDefault()
            if (!accrue.isPending) accrue.mutate()
          }}
        >
          <div className="field">
            <label htmlFor={dateId}>적립할 날</label>
            <input
              id={dateId}
              className="input"
              type="date"
              value={date}
              max={yesterday()}
              onChange={(e) => {
                setDate(e.target.value)
                accrue.reset()
              }}
            />
          </div>
          <button type="submit" className="btn secondary" disabled={!date || accrue.isPending}>
            적립
          </button>
        </form>
        <form
          className="run-closing"
          onSubmit={(e) => {
            e.preventDefault()
            if (!settle.isPending) settle.mutate()
          }}
        >
          <div className="field">
            <label htmlFor={monthId}>결산할 달</label>
            <input
              id={monthId}
              className="input"
              type="month"
              value={month}
              max={lastMonth()}
              onChange={(e) => {
                setMonth(e.target.value)
                settle.reset()
              }}
            />
          </div>
          <button type="submit" className="btn" disabled={!month || settle.isPending}>
            결산
          </button>
        </form>
      </div>
      {accrue.isSuccess && (
        <Notice tone="success" title={`${accrue.data.businessDate} 적수를 ${accrue.data.accrued}개 계좌에 쌓았습니다.`}>
          이미 쌓인 계좌는 건너뜁니다(0개면 이미 적립된 날).
        </Notice>
      )}
      {accrue.isError && <Notice tone="error" title={errorMessage(accrue.error)} />}
      {settle.isSuccess && (
        <Notice
          tone={settle.data.failed > 0 ? 'error' : 'success'}
          title={`${settle.data.month} 결산: ${settle.data.paid}개 계좌에 세후 ${formatWon(settle.data.totalNet)} 지급`}
        >
          세전 {formatWon(settle.data.totalGross)} · 세금 {formatWon(settle.data.totalTax)} · 해지 계좌 건너뜀{' '}
          {settle.data.skipped}개
          {settle.data.failed > 0 && ` · 실패 ${settle.data.failed}개(서버 로그 확인, 다시 결산하면 실패한 계좌만 다시 시도)`}
        </Notice>
      )}
      {settle.isError && <Notice tone="error" title={errorMessage(settle.error)} />}
    </section>
  )
}

function PaymentList() {
  const [page, setPage] = useState(0)
  const payments = useQuery({
    queryKey: [...PAYMENTS_KEY, page],
    queryFn: ({ signal }) => getInterestPayments(page, 20, signal),
    placeholderData: keepPreviousData,
  })
  const data = payments.data

  return (
    <section className="card">
      <div className="card-title">
        <h2>최근 이자 지급</h2>
        <p>{data ? `${data.totalElements.toLocaleString('ko-KR')}건` : ''}</p>
      </div>
      {payments.isError && <Notice tone="error" title={errorMessage(payments.error)} />}
      {data && data.content.length === 0 && (
        <div className="empty">
          <strong>아직 지급한 이자가 없습니다</strong>
        </div>
      )}
      {data && data.content.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>계좌</th>
                <th>구분</th>
                <th className="hide-sm">기간</th>
                <th className="num">세전</th>
                <th className="num hide-sm">세금</th>
                <th className="num">세후</th>
                <th className="hide-sm">지급</th>
              </tr>
            </thead>
            <tbody>
              {data.content.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/accounts/${p.accountId}`}>#{p.accountId}</Link>
                  </td>
                  <td>{TRIGGER_LABEL[p.trigger]}</td>
                  <td className="muted hide-sm">
                    {p.periodFrom} ~ {p.periodTo} ({p.dayCount}일)
                  </td>
                  <td className="num">{formatWon(p.grossAmount)}</td>
                  <td className="num hide-sm">{formatWon(p.incomeTax + p.localTax)}</td>
                  <td className="num strong">{formatWon(p.netAmount)}</td>
                  <td className="muted hide-sm">{formatDateTime(p.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalPages > 1 && (
        <nav className="pager" aria-label="쪽 이동">
          <button type="button" className="btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
            이전
          </button>
          <span>
            {page + 1} / {data.totalPages}
          </span>
          <button
            type="button"
            className="btn ghost"
            disabled={page + 1 >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            다음
          </button>
        </nav>
      )}
    </section>
  )
}
