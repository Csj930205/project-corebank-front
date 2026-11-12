import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { getAccount } from '../api/corebank'
import type { Account } from '../api/types'
import { ClosureForm } from '../components/ClosureForm'
import { HistoryList } from '../components/HistoryList'
import { InterestCard } from '../components/InterestCard'
import { formatRate } from '../lib/interest'
import { IdempotencyDemo } from '../components/IdempotencyDemo'
import { MoneyForm } from '../components/MoneyForm'
import { Notice } from '../components/Notice'
import { TransferForm } from '../components/TransferForm'
import { useSession } from '../hooks/useSession'
import { errorMessage } from '../lib/errors'
import { formatAccountNumber, formatDateTime, formatWon, parseAccountId } from '../lib/format'
import { rememberAccount } from '../lib/recentAccounts'
import { can, roleOnlyHint } from '../lib/roles'

type Tab = 'deposit' | 'withdraw' | 'transfer' | 'demo' | 'close'

// 멱등성 시연은 운영 콘솔(관리자) 전용. 고객 화면에는 보이지 않는다.
const TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: 'deposit', label: '입금' },
  { id: 'withdraw', label: '출금' },
  { id: 'transfer', label: '이체' },
  { id: 'demo', label: '멱등성 시연', adminOnly: true },
  { id: 'close', label: '해지' },
]

export function AccountPage() {
  const params = useParams()
  const id = parseAccountId(params.id ?? '')
  if (id === null) {
    return <Notice tone="error" title="잘못된 계좌 주소입니다." />
  }
  // key: 다른 계좌로 이동하면 폼 입력과 결과 안내를 처음 상태로 되돌린다.
  return <AccountView key={id} id={id} />
}

/** 계좌번호 복사. 클립보드가 막힌 환경에서는 조용히 실패한다. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 복사 권한이 없으면 아무것도 하지 않는다
    }
  }
  return (
    <button type="button" className="copy" onClick={() => void copy()}>
      {copied ? '복사됨' : '복사'}
    </button>
  )
}

function Hero({ account }: { account: Account }) {
  const closed = account.status === 'CLOSED'
  return (
    <section className="hero" aria-label="계좌 요약">
      <div className="hero-top">
        <div>
          <p className="hero-owner">
            {account.ownerName}님의 {account.product.name}
          </p>
          <p className="hero-number">
            {formatAccountNumber(account.accountNumber)}
            <CopyButton text={account.accountNumber} />
          </p>
        </div>
        <span className={`pill ${closed ? 'pill-closed' : 'pill-active'}`}>{closed ? '해지' : '정상'}</span>
      </div>
      <div className="hero-balance">
        <span>잔액</span>
        <strong>{formatWon(account.balance)}</strong>
      </div>
      <p className="hero-meta">
        {formatRate(account.product.annualRate)} · 계좌 id {account.id} · 개설 {formatDateTime(account.createdAt)}
        {account.closedAt && ` · 해지 ${formatDateTime(account.closedAt)}`}
      </p>
    </section>
  )
}

function AccountView({ id }: { id: number }) {
  const location = useLocation()
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'
  // 창구가 아닌 관리자(책임자·운영)는 계좌를 보기만 한다. 돈을 움직이는 일은 창구가 한다.
  const canMove = can(session, 'MOVE_MONEY')
  const tabs = TABS.filter((item) => isAdmin || !item.adminOnly)
  const justOpened = (location.state as { opened?: boolean } | null)?.opened === true
  const [tab, setTab] = useState<Tab>('deposit')

  const account = useQuery({
    queryKey: ['account', id],
    queryFn: ({ signal }) => getAccount(id, signal),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  })

  useEffect(() => {
    if (account.data) {
      rememberAccount(account.data)
    }
  }, [account.data])

  if (account.isPending) {
    return <div className="skeleton skeleton-hero" aria-label="계좌를 불러오는 중" />
  }
  if (account.isError) {
    return (
      <Notice tone="error" title={errorMessage(account.error)}>
        <Link to={isAdmin ? '/' : '/my'}>처음으로 돌아가기</Link>
      </Notice>
    )
  }

  const data = account.data

  return (
    <div className="stack">
      {justOpened && <Notice tone="success" title="계좌를 개설했습니다. 첫 입금을 해 보세요." />}
      <Hero account={data} />

      <div className="grid-2 wide-left">
        <section className="card">
          <div className="card-title">
            <h2>거래내역</h2>
            <p>최신순</p>
          </div>
          <HistoryList accountId={id} />
        </section>

        {!canMove && (
          <section className="card sticky-panel">
            <Notice tone="info" title="조회만 할 수 있습니다.">
              입금·출금·이체·해지는 {roleOnlyHint('MOVE_MONEY')}
            </Notice>
          </section>
        )}
        {canMove && (
          <section className="card sticky-panel">
            <div className="segmented" role="tablist" aria-label="거래 종류">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {/* 해지 탭은 해지 일시와 함께 자체 안내를 보여 준다 */}
            {data.status === 'CLOSED' && tab !== 'close' && <Notice tone="info" title="해지된 계좌는 거래할 수 없습니다." />}
            {tab === 'deposit' && <MoneyForm accountId={id} kind="deposit" />}
            {tab === 'withdraw' && <MoneyForm accountId={id} kind="withdraw" />}
            {tab === 'transfer' && <TransferForm fromAccountId={id} fromAccountNumber={data.accountNumber} />}
            {tab === 'demo' && isAdmin && <IdempotencyDemo accountId={id} />}
            {tab === 'close' && <ClosureForm account={data} />}
          </section>
        )}
      </div>
      <InterestCard account={data} />
    </div>
  )
}
