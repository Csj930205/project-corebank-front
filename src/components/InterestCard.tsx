import { useQuery } from '@tanstack/react-query'
import { getAccountInterest } from '../api/corebank'
import type { Account } from '../api/types'
import { errorMessage } from '../lib/errors'
import { formatWon } from '../lib/format'
import { TRIGGER_LABEL, formatRate } from '../lib/interest'
import { Notice } from './Notice'

/**
 * 계좌 이자. 매일 마감 잔액을 쌓아(적수) 매달 1일에 지난달 이자를 줍니다. 아직 받지 않은 이자는 "예상" 으로 보여 주고,
 * 받은 이자는 세전·세금·세후로 나눠 보여 줍니다(거래내역에는 세후 금액만 "이자" 로 들어온다).
 */
export function InterestCard({ account }: { account: Account }) {
  const interest = useQuery({
    queryKey: ['interest', account.id],
    queryFn: ({ signal }) => getAccountInterest(account.id, signal),
  })
  const data = interest.data

  return (
    <section className="card">
      <div className="card-title">
        <h2>이자</h2>
        <p>
          {account.product.name} · {formatRate(account.product.annualRate)} · 매달 1일 지급, 이자소득세 15.4%
        </p>
      </div>
      {interest.isError && <Notice tone="error" title={errorMessage(interest.error)} />}
      {interest.isPending && <div className="skeleton skeleton-row" />}
      {data && (
        <>
          {data.unpaid ? (
            <dl className="closure-facts">
              <div>
                <dt>
                  쌓인 기간 {data.unpaid.from} ~ {data.unpaid.to} ({data.unpaid.days}일)
                </dt>
                <dd />
              </div>
              <div>
                <dt>예상 이자(세전)</dt>
                <dd>{formatWon(data.unpaid.estimatedGross)}</dd>
              </div>
              <div>
                <dt>세금</dt>
                <dd>−{formatWon(data.unpaid.estimatedTax)}</dd>
              </div>
              <div>
                <dt>받을 금액(세후)</dt>
                <dd>{formatWon(data.unpaid.estimatedNet)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">아직 쌓인 이자가 없습니다. 하루가 끝나면 그날 마감 잔액으로 쌓입니다.</p>
          )}
          {data.payments.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>지급</th>
                    <th className="hide-sm">기간</th>
                    <th className="num">세전</th>
                    <th className="num hide-sm">세금</th>
                    <th className="num">세후</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.paidAt.slice(0, 10)}
                        <div className="muted audit-code">{TRIGGER_LABEL[p.trigger]}</div>
                      </td>
                      <td className="muted hide-sm">
                        {p.periodFrom} ~ {p.periodTo} ({p.dayCount}일)
                      </td>
                      <td className="num">{formatWon(p.grossAmount)}</td>
                      <td className="num hide-sm">{formatWon(p.incomeTax + p.localTax)}</td>
                      <td className="num strong">{formatWon(p.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
