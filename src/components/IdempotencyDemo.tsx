import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { deposit } from '../api/corebank'
import { errorMessage } from '../lib/errors'
import { formatWon } from '../lib/format'

interface Outcome {
  label: string
  text: string
  replayed: boolean
  ok: boolean
}

const DEMO_AMOUNT = 1_000

/**
 * 멱등성 키 시연. 같은 키로 1,000원 입금 요청 두 개를 "동시에" 보낸다.
 * 사용자가 결제 버튼을 연타했거나, 응답이 늦어 앱이 자동으로 다시 보낸 상황과 같다.
 * 서버는 두 번째 요청을 계좌 잠금에서 기다리게 했다가, 첫 번째 결과를 그대로 돌려준다. 잔액은 1,000원만 늘어야 한다.
 */
export function IdempotencyDemo({ accountId }: { accountId: number }) {
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null)

  const run = async () => {
    setRunning(true)
    setOutcomes(null)
    const key = crypto.randomUUID()
    const results = await Promise.allSettled([
      deposit(accountId, DEMO_AMOUNT, key),
      deposit(accountId, DEMO_AMOUNT, key),
    ])
    setOutcomes(
      results.map((result, index) =>
        result.status === 'fulfilled'
          ? {
              label: `요청 ${index + 1}`,
              text: `201 · 거래 번호 ${result.value.data.transactionId} · 거래 후 잔액 ${formatWon(result.value.data.balanceAfter)}`,
              replayed: result.value.replayed,
              ok: true,
            }
          : { label: `요청 ${index + 1}`, text: errorMessage(result.reason), replayed: false, ok: false },
      ),
    )
    setRunning(false)
    void queryClient.invalidateQueries({ queryKey: ['account', accountId] })
    void queryClient.invalidateQueries({ queryKey: ['history', accountId] })
  }

  return (
    <div>
      <p className="demo-desc">
        같은 요청 번호(Idempotency-Key)로 {formatWon(DEMO_AMOUNT)} 입금을 <b>동시에 2번</b> 보냅니다. 버튼 연타나 자동
        재전송과 같은 상황입니다. 두 요청이 같은 거래 번호를 받고, 잔액은 {formatWon(DEMO_AMOUNT)}만 늘어야 합니다.
      </p>
      <button type="button" className="btn secondary block" onClick={() => void run()} disabled={running}>
        {running && <span className="spinner" aria-hidden />}
        {running ? '보내는 중' : '같은 요청 동시에 2번 보내기'}
      </button>
      {outcomes && (
        <ul className="demo">
          {outcomes.map((outcome) => (
            <li key={outcome.label} className={outcome.ok ? '' : 'failed'}>
              <div className="demo-head">
                <strong>{outcome.label}</strong>
                <span
                  className={`badge ${!outcome.ok ? 'badge-failed' : outcome.replayed ? 'badge-replay' : 'badge-new'}`}
                >
                  {outcome.ok ? (outcome.replayed ? '재전송 · 처음 결과 반환' : '새로 처리') : '실패'}
                </span>
              </div>
              <span className="muted">{outcome.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
