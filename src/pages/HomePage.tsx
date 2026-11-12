import { useMutation } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { openAccount } from '../api/corebank'
import { Chevron } from '../components/icons'
import { Notice } from '../components/Notice'
import { ProductSelect } from '../components/ProductSelect'
import { errorMessage } from '../lib/errors'
import { parseAccountId } from '../lib/format'
import { loadRecentAccounts, rememberAccount } from '../lib/recentAccounts'
import { useSession } from '../hooks/useSession'
import { can, roleOnlyHint } from '../lib/roles'

export function HomePage() {
  const navigate = useNavigate()
  const canOpen = can(useSession(), 'MOVE_MONEY')
  const nameId = useId()
  const lookupInputId = useId()
  const [ownerName, setOwnerName] = useState('')
  const [productId, setProductId] = useState<number | undefined>(undefined)
  const [lookupId, setLookupId] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const recent = loadRecentAccounts()

  // 계좌 개설은 돈이 움직이지 않아 서버가 멱등성 키를 요구하지 않는다. 중복 클릭만 버튼 비활성화로 막는다.
  const open = useMutation({
    mutationFn: (name: string) => openAccount(name, productId),
    onSuccess: ({ data }) => {
      rememberAccount(data)
      navigate(`/accounts/${data.id}`, { state: { opened: true } })
    },
  })

  const submitOpen = (event: FormEvent) => {
    event.preventDefault()
    const name = ownerName.trim()
    if (name && !open.isPending) {
      open.mutate(name)
    }
  }

  const submitLookup = (event: FormEvent) => {
    event.preventDefault()
    const id = parseAccountId(lookupId)
    if (id === null) {
      setLookupError('계좌 id 는 1 이상의 숫자입니다.')
      return
    }
    navigate(`/accounts/${id}`)
  }

  return (
    <>
      <div className="welcome">
        <h1>계좌 관리</h1>
        <p>새 계좌를 열거나, 계좌 id 로 잔액과 거래내역을 확인하세요.</p>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-title">
            <h2>계좌 개설</h2>
            <p>잔액 0원으로 시작합니다</p>
          </div>
          {!canOpen && <Notice tone="info" title={`계좌 개설은 ${roleOnlyHint('MOVE_MONEY')}`} />}
          {canOpen && (
            <form onSubmit={submitOpen} className="form">
              <div className="field">
                <label htmlFor={nameId}>예금주 이름</label>
                <input
                  id={nameId}
                  className="input"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  maxLength={100}
                  placeholder="홍길동"
                  autoComplete="off"
                  required
                />
              </div>
              <ProductSelect value={productId} onChange={setProductId} />
              <button type="submit" className="btn block" disabled={open.isPending || !ownerName.trim()}>
                {open.isPending && <span className="spinner" aria-hidden />}
                {open.isPending ? '개설 중' : '계좌 개설'}
              </button>
            </form>
          )}
          {open.isError && <Notice tone="error" title={errorMessage(open.error)} />}
        </section>

        <section className="card">
          <div className="card-title">
            <h2>계좌 조회</h2>
          </div>
          <form onSubmit={submitLookup} className="form">
            <div className="field">
              <label htmlFor={lookupInputId}>계좌 id</label>
              <input
                id={lookupInputId}
                className="input"
                value={lookupId}
                onChange={(e) => {
                  setLookupId(e.target.value)
                  setLookupError(null)
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="예: 1"
                aria-invalid={lookupError !== null}
                required
              />
            </div>
            <button type="submit" className="btn secondary block">
              조회
            </button>
          </form>
          {lookupError && <Notice tone="error" title={lookupError} />}

          <h3 className="divider-title">최근 연 계좌</h3>
          {recent.length === 0 ? (
            <p className="muted">아직 없습니다. 계좌를 개설하거나 조회하면 여기에 남습니다.</p>
          ) : (
            <ul className="recent">
              {recent.map((account) => (
                <li key={account.id}>
                  <Link to={`/accounts/${account.id}`}>
                    <span className="avatar" aria-hidden>
                      {account.ownerName.slice(0, 1)}
                    </span>
                    <span className="recent-text">
                      <span>{account.ownerName}</span>
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
      </div>
    </>
  )
}
