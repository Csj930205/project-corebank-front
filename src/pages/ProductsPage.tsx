import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  accrueInterest,
  changeProductRate,
  createProduct,
  discontinueProduct,
  getAdminProducts,
  getAdminTimeDeposits,
  getInterestPayments,
  getProductRates,
  runMaturities,
  settleInterest,
} from '../api/admin'
import type { DepositProduct, ProductType, TimeDepositStatus } from '../api/types'
import { Notice } from '../components/Notice'
import { yesterday } from '../lib/closing'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWon } from '../lib/format'
import { TRIGGER_LABEL, formatRate, lastMonth, parseRate } from '../lib/interest'
import { TIME_DEPOSIT_STATUS_LABEL, formatTerm, timeDepositStatusClass } from '../lib/timeDeposit'
import { useSession } from '../hooks/useSession'
import { can, roleOnlyHint } from '../lib/roles'

const PRODUCTS_KEY = ['admin', 'products']
const PAYMENTS_KEY = ['admin', 'interest-payments']
const TIME_DEPOSITS_KEY = ['admin', 'time-deposits']

/** 상품 종류 이름 */
const TYPE_LABEL: Record<ProductType, string> = { DEMAND: '입출금', TIME: '정기예금' }

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
          입출금 통장은 매일 마감 잔액을 그날 금리로 쌓아(적수) 매달 1일에 지난달분을 지급합니다. 정기예금은 가입할 때 금리가
          고정되고 만기(또는 중도해지) 때 한 번에 지급합니다. 세전 이자 = Σ(잔액 × 연이율) ÷ 365, 원 미만은 버리고, 이자소득세
          14%와 지방소득세 1.4%를 뗍니다.
        </p>
      </div>
      {!canOperate && (
        <Notice tone="info" title={`상품 등록·금리 변경·판매 중지와 이자·만기 실행은 ${roleOnlyHint('OPERATE')}`} />
      )}
      <div className={canOperate ? 'grid-2' : 'stack'}>
        <ProductList canOperate={canOperate} />
        {canOperate && <CreateProduct />}
      </div>
      <RateChange canOperate={canOperate} />
      {canOperate && <InterestRun />}
      <TimeDepositList canOperate={canOperate} />
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
        <p>판매 중지해도 이미 연 계좌·정기예금은 그대로 이자가 붙습니다</p>
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
                <th className="num">지금 금리</th>
                <th aria-label="판매" />
              </tr>
            </thead>
            <tbody>
              {products.data.map((p: DepositProduct) => (
                <tr key={p.id}>
                  <td className="strong">
                    {p.name}
                    {p.id === 1 && <span className="muted"> (기본)</span>}
                    {/* 열을 늘리면 반쪽 카드에서 판매 버튼이 잘려 종류는 이름 아래에 둔다 */}
                    <span className="cell-sub">
                      {TYPE_LABEL[p.type]}
                      {p.termMonths !== null && ` · ${formatTerm(p.termMonths)}`}
                    </span>
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
  const typeId = useId()
  const rateId = useId()
  const termId = useId()
  const [name, setName] = useState('')
  const [type, setType] = useState<ProductType>('DEMAND')
  const [rate, setRate] = useState('')
  const [term, setTerm] = useState('12')
  const parsed = parseRate(rate)
  const termMonths = /^\d{1,2}$/.test(term) && Number(term) >= 1 && Number(term) <= 60 ? Number(term) : null
  const create = useMutation({
    mutationFn: () => createProduct(name.trim(), parsed ?? 0, type === 'TIME' ? (termMonths ?? 0) : undefined),
    onSuccess: () => {
      setName('')
      setRate('')
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
  const valid = name.trim().length > 0 && parsed !== null && (type === 'DEMAND' || termMonths !== null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid && !create.isPending) create.mutate()
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>상품 등록</h2>
        <p>금리는 나중에 바꿀 수 있고, 바꾼 이력이 남습니다</p>
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
          <label htmlFor={typeId}>종류</label>
          <select
            id={typeId}
            className="input"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ProductType)
              create.reset()
            }}
          >
            <option value="DEMAND">입출금 (변동 금리, 매달 이자)</option>
            <option value="TIME">정기예금 (가입 때 금리 고정, 만기 지급)</option>
          </select>
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
        {type === 'TIME' && (
          <div className="field">
            <label htmlFor={termId}>가입 기간(개월)</label>
            <input
              id={termId}
              className="input"
              inputMode="numeric"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value)
                create.reset()
              }}
              aria-invalid={termMonths === null}
            />
            {termMonths === null && <p className="hint left">1~60개월 사이로 입력하세요.</p>}
          </div>
        )}
        <button type="submit" className="btn" disabled={!valid || create.isPending}>
          {create.isPending ? '등록 중' : '상품 등록'}
        </button>
      </form>
      {create.isSuccess && <Notice tone="success" title={`${create.data.name} 상품을 등록했습니다.`} />}
      {create.isError && <Notice tone="error" title={errorMessage(create.error)} />}
    </section>
  )
}

/**
 * 금리 변경과 이력. 오늘부터 적용한다. 입출금 계좌는 오늘 마감 잔액부터 새 금리로 적수가 쌓이고(어제까지는 그대로),
 * 정기예금은 오늘부터 가입하는 예금에만 새 금리가 붙는다(이미 든 예금은 약정이율 고정).
 */
function RateChange({ canOperate }: { canOperate: boolean }) {
  const queryClient = useQueryClient()
  const productId = useId()
  const rateId = useId()
  const products = useQuery({ queryKey: PRODUCTS_KEY, queryFn: ({ signal }) => getAdminProducts(signal) })
  const [selected, setSelected] = useState<number | null>(null)
  const [rate, setRate] = useState('')
  const parsed = parseRate(rate)
  const current = products.data?.find((p) => p.id === selected) ?? products.data?.[0]
  const rates = useQuery({
    queryKey: [...PRODUCTS_KEY, 'rates', current?.id],
    queryFn: ({ signal }) => getProductRates(current!.id, signal),
    enabled: current !== undefined,
  })
  const change = useMutation({
    mutationFn: () => changeProductRate(current!.id, parsed ?? 0),
    onSuccess: () => {
      setRate('')
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  return (
    <section className="card">
      <div className="card-title">
        <h2>금리 변경·이력</h2>
        <p>오늘부터 적용. 입출금은 오늘 마감 잔액부터, 정기예금은 오늘 가입부터</p>
      </div>
      <form
        className="run-closing"
        onSubmit={(e) => {
          e.preventDefault()
          if (canOperate && current && parsed !== null && !change.isPending) change.mutate()
        }}
      >
        <div className="field">
          <label htmlFor={productId}>상품</label>
          <select
            id={productId}
            className="input"
            value={current?.id ?? ''}
            onChange={(e) => {
              setSelected(Number(e.target.value))
              change.reset()
            }}
          >
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {TYPE_LABEL[p.type]} · 지금 {formatRate(p.annualRate)}
              </option>
            ))}
          </select>
        </div>
        {canOperate && (
          <>
            <div className="field">
              <label htmlFor={rateId}>새 연이율(%)</label>
              <input
                id={rateId}
                className="input"
                inputMode="decimal"
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value)
                  change.reset()
                }}
                placeholder="예: 3.25"
                aria-invalid={rate !== '' && parsed === null}
              />
            </div>
            <button type="submit" className="btn secondary" disabled={!current || parsed === null || change.isPending}>
              금리 변경
            </button>
          </>
        )}
      </form>
      {change.isSuccess && (
        <Notice tone="success" title={`${change.data.name} 금리를 ${formatRate(change.data.annualRate)}로 바꿨습니다.`} />
      )}
      {change.isError && <Notice tone="error" title={errorMessage(change.error)} />}
      {rates.data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>적용일</th>
                <th className="num">금리</th>
                <th>바꾼 사람</th>
                <th className="hide-sm">기록</th>
              </tr>
            </thead>
            <tbody>
              {rates.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.effectiveFrom}부터</td>
                  <td className="num strong">{formatRate(r.annualRate)}</td>
                  <td>{r.changedBy ?? <span className="muted">상품 등록</span>}</td>
                  <td className="muted hide-sm">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** 정기예금 목록과 만기 처리 수동 실행(평소에는 매일 00:40 자동). */
function TimeDepositList({ canOperate }: { canOperate: boolean }) {
  const queryClient = useQueryClient()
  const statusId = useId()
  const [status, setStatus] = useState<TimeDepositStatus | ''>('')
  const [page, setPage] = useState(0)
  const deposits = useQuery({
    queryKey: [...TIME_DEPOSITS_KEY, status, page],
    queryFn: ({ signal }) => getAdminTimeDeposits(status === '' ? null : status, page, 20, signal),
    placeholderData: keepPreviousData,
  })
  const mature = useMutation({
    mutationFn: runMaturities,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TIME_DEPOSITS_KEY })
      void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY })
    },
  })
  const data = deposits.data

  return (
    <section className="card">
      <div className="card-title">
        <h2>정기예금</h2>
        <p>만기일이 되면 매일 00:40 에 약정이율로 이자를 붙여 연결계좌로 보냅니다</p>
      </div>
      <div className="run-closing">
        <div className="field">
          <label htmlFor={statusId}>상태</label>
          <select
            id={statusId}
            className="input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TimeDepositStatus | '')
              setPage(0)
            }}
          >
            <option value="">전체</option>
            {(Object.keys(TIME_DEPOSIT_STATUS_LABEL) as TimeDepositStatus[]).map((s) => (
              <option key={s} value={s}>
                {TIME_DEPOSIT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {canOperate && (
          <button type="button" className="btn secondary" disabled={mature.isPending} onClick={() => mature.mutate()}>
            오늘 만기 처리
          </button>
        )}
      </div>
      {mature.isSuccess && (
        <Notice
          tone={mature.data.failed > 0 ? 'error' : 'success'}
          title={`${mature.data.businessDate} 만기 처리: ${mature.data.matured}건 지급${
            mature.data.failed > 0 ? `, 실패 ${mature.data.failed}건(서버 로그 확인, 다시 실행하면 실패한 건만 다시 시도)` : ''
          }`}
        />
      )}
      {mature.isError && <Notice tone="error" title={errorMessage(mature.error)} />}
      {deposits.isError && <Notice tone="error" title={errorMessage(deposits.error)} />}
      {data && data.content.length === 0 && (
        <div className="empty">
          <strong>정기예금이 없습니다</strong>
        </div>
      )}
      {data && data.content.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>계좌</th>
                <th>예금주</th>
                <th className="hide-sm">상품</th>
                <th className="num">원금</th>
                <th className="num">약정이율</th>
                <th className="hide-sm">만기일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {data.content.map((d) => (
                <tr key={d.accountId}>
                  <td>
                    <Link to={`/accounts/${d.accountId}`}>#{d.accountId}</Link>
                  </td>
                  <td>{d.ownerName}</td>
                  <td className="hide-sm">
                    {d.productName} · {formatTerm(d.termMonths)}
                  </td>
                  <td className="num">{formatWon(d.principal)}</td>
                  <td className="num">{formatRate(d.annualRate)}</td>
                  <td className="muted hide-sm">{d.maturityDate}</td>
                  <td>
                    <span className={`status ${timeDepositStatusClass(d.status)}`}>
                      {TIME_DEPOSIT_STATUS_LABEL[d.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalPages > 1 && (
        <nav className="pager" aria-label="정기예금 쪽 이동">
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
          tone={settle.data.failed > 0 || settle.data.status !== 'COMPLETED' ? 'error' : 'success'}
          title={
            settle.data.status === 'COMPLETED'
              ? `${settle.data.month} 결산: ${settle.data.paid}개 계좌에 세후 ${formatWon(settle.data.totalNet)} 지급`
              : `${settle.data.month} 결산이 중간에 멈췄습니다(${settle.data.status}). 다시 결산하면 남은 계좌만 지급합니다.`
          }
        >
          세전 {formatWon(settle.data.totalGross)} · 세금 {formatWon(settle.data.totalTax)} · 해지 계좌 건너뜀{' '}
          {settle.data.skipped}개
          {settle.data.failed > 0 && ` · 실패 ${settle.data.failed}개(서버 로그 확인, 다시 결산하면 실패한 계좌만 다시 시도)`}
          {` · 배치 실행 #${settle.data.jobExecutionId}`}
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
