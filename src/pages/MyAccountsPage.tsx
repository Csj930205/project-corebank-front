import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { getMyAccounts, openAccount } from '../api/corebank'
import { Chevron } from '../components/icons'
import { Notice } from '../components/Notice'
import { ProductSelect } from '../components/ProductSelect'
import { useSession } from '../hooks/useSession'
import { errorMessage } from '../lib/errors'
import { formatWon } from '../lib/format'

/** 고객 첫 화면. 내 계좌 목록과 계좌 개설. */
export function MyAccountsPage() {
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const welcome = (location.state as { welcome?: boolean } | null)?.welcome === true
  const [productId, setProductId] = useState<number | undefined>(undefined)

  const accounts = useQuery({ queryKey: ['my-accounts'], queryFn: ({ signal }) => getMyAccounts(signal) })

  // 고객은 이름 없이 보내면 서버가 본인 명의로 연다. 돈이 움직이지 않아 멱등성 키 없이, 연타만 막는다.
  const open = useMutation({
    mutationFn: () => openAccount(undefined, productId),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: ['my-accounts'] })
      navigate(`/accounts/${data.id}`, { state: { opened: true } })
    },
  })

  const active = accounts.data?.filter((a) => a.status === 'ACTIVE') ?? []
  const total = active.reduce((sum, a) => sum + a.balance, 0)

  return (
    <>
      <div className="welcome">
        <h1>{session?.name ?? session?.username}님의 계좌</h1>
        <p>계좌를 눌러 거래내역을 보고 입금·출금·이체를 할 수 있습니다. 정기예금은 입출금 계좌 화면의 "정기예금" 탭에서 가입합니다.</p>
      </div>
      {welcome && <Notice tone="success" title="가입을 환영합니다. 첫 계좌를 열어 보세요." />}

      <div className="grid-2 wide-left">
        <section className="card">
          <div className="card-title">
            <h2>내 계좌</h2>
            {accounts.data && <p>정상 계좌 {active.length}개 · 합계 {formatWon(total)}</p>}
          </div>
          {accounts.isPending && <div className="skeleton" aria-label="계좌를 불러오는 중" />}
          {accounts.isError && <Notice tone="error" title={errorMessage(accounts.error)} />}
          {accounts.data?.length === 0 && <p className="muted">아직 계좌가 없습니다. 오른쪽에서 계좌를 열어 보세요.</p>}
          {accounts.data && accounts.data.length > 0 && (
            <ul className="recent">
              {accounts.data.map((account) => (
                <li key={account.id}>
                  <Link to={`/accounts/${account.id}`}>
                    <span className="recent-text">
                      <span>
                        {formatWon(account.balance)}
                        {account.product.type === 'TIME' && <span className="pill pill-active">정기예금</span>}
                        {account.status === 'CLOSED' && <span className="pill pill-closed">해지</span>}
                      </span>
                      <span className="mono">
                        {account.accountNumber} · id {account.id}
                      </span>
                    </span>
                    <span className="chevron">
                      <Chevron />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-title">
            <h2>계좌 개설</h2>
            <p>내 이름으로, 잔액 0원으로 시작합니다</p>
          </div>
          <div className="form">
            <ProductSelect value={productId} onChange={setProductId} />
          </div>
          <button type="button" className="btn block" disabled={open.isPending} onClick={() => open.mutate()}>
            {open.isPending && <span className="spinner" aria-hidden />}
            {open.isPending ? '개설 중' : '새 계좌 열기'}
          </button>
          {open.isError && <Notice tone="error" title={errorMessage(open.error)} />}
        </section>
      </div>
    </>
  )
}
