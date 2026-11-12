import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getHistory } from '../api/corebank'
import { useSession } from '../hooks/useSession'
import { isCorrectable } from '../lib/corrections'
import type { HistoryItem } from '../api/types'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatWon } from '../lib/format'
import { ArrowIn, ArrowOut, Swap } from './icons'
import { Notice } from './Notice'

const PAGE_SIZE = 10
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function title(item: HistoryItem): string {
  switch (item.type) {
    case 'DEPOSIT':
      return '입금'
    case 'WITHDRAWAL':
      return '출금'
    case 'TRANSFER_OUT':
      return `${item.counterparty?.ownerName ?? '알 수 없음'}님에게 이체`
    case 'TRANSFER_IN':
      return `${item.counterparty?.ownerName ?? '알 수 없음'}님이 보냄`
    case 'CLOSURE_PAYOUT':
      return '해지 잔액 지급'
    case 'INTEREST':
      return '이자'
    case 'REVERSAL_OUT':
    case 'REVERSAL_IN':
      return `거래 정정 · #${item.reversalOfId} 취소`
  }
}

function TxIcon({ item }: { item: HistoryItem }) {
  if (item.transferId !== null) {
    return (
      <span className="tx-icon transfer">
        <Swap />
      </span>
    )
  }
  return item.direction === 'IN' ? (
    <span className="tx-icon in">
      <ArrowIn />
    </span>
  ) : (
    <span className="tx-icon out">
      <ArrowOut />
    </span>
  )
}

/** "2026-11-03" → "11월 3일 화요일" */
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${m}월 ${d}일 ${weekday}요일`
}

/** 최신순 목록을 날짜별로 묶는다. 순서는 그대로 유지된다. */
function groupByDay(items: HistoryItem[]) {
  const groups: { date: string; items: HistoryItem[] }[] = []
  for (const item of items) {
    const date = item.createdAt.slice(0, 10)
    const last = groups.at(-1)
    if (last?.date === date) {
      last.items.push(item)
    } else {
      groups.push({ date, items: [item] })
    }
  }
  return groups
}

/**
 * 거래내역. 서버의 커서 방식 페이지 나누기를 그대로 쓴다.
 * 첫 페이지는 before 없이, "더보기"는 직전 응답의 nextBefore 를 before 로 보낸다. nextBefore 가 null 이면 끝이다.
 */
export function HistoryList({ accountId }: { accountId: number }) {
  // 관리자에게만 거래 번호와 정정 요청 링크를 보여 준다. 고객은 정정을 요청할 수 없다(서버도 /admin/** 로 막는다).
  const isAdmin = useSession()?.role === 'ADMIN'
  const history = useInfiniteQuery({
    queryKey: ['history', accountId],
    queryFn: ({ pageParam, signal }) => getHistory(accountId, pageParam, PAGE_SIZE, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextBefore,
  })

  if (history.isPending) {
    return (
      <div aria-label="거래내역을 불러오는 중">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-row" />
        ))}
      </div>
    )
  }
  if (history.isError) {
    return <Notice tone="error" title={errorMessage(history.error)} />
  }

  const items = history.data.pages.flatMap((page) => page.transactions)
  if (items.length === 0) {
    return (
      <div className="empty">
        <strong>아직 거래가 없습니다</strong>
        오른쪽에서 첫 입금을 해 보세요.
      </div>
    )
  }

  return (
    <div>
      {groupByDay(items).map((group) => (
        <section key={group.date} className="day">
          <h3 className="day-label">{dayLabel(group.date)}</h3>
          <ul className="tx-list">
            {group.items.map((item) => (
              <li key={item.transactionId} className="tx">
                <TxIcon item={item} />
                <div className="tx-main">
                  <div className="tx-title">{title(item)}</div>
                  <div className="tx-sub">
                    {formatDateTime(item.createdAt).slice(11)}
                    {item.counterparty && (
                      <>
                        {' · '}
                        <Link to={`/accounts/${item.counterparty.accountId}`}>{item.counterparty.accountNumber}</Link>
                      </>
                    )}
                    {isAdmin && (
                      <>
                        {' · '}#{item.transactionId}
                        {isCorrectable(item.type) && (
                          <>
                            {' · '}
                            <Link className="tx-correct" to={`/admin/corrections?transactionId=${item.transactionId}`}>
                              정정 요청
                            </Link>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="tx-amount">
                  <strong className={item.direction === 'IN' ? 'in' : 'out'}>
                    {item.direction === 'IN' ? '+' : '−'}
                    {formatWon(item.amount)}
                  </strong>
                  <span>잔액 {formatWon(item.balanceAfter)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {history.hasNextPage && (
        <button
          type="button"
          className="btn ghost block more"
          onClick={() => void history.fetchNextPage()}
          disabled={history.isFetchingNextPage}
        >
          {history.isFetchingNextPage && <span className="spinner" aria-hidden />}
          {history.isFetchingNextPage ? '불러오는 중' : '더보기'}
        </button>
      )}
    </div>
  )
}
