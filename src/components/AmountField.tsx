import { useId } from 'react'
import { formatWon, parseAmount } from '../lib/format'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}

// 빠른 입력 버튼. 누르면 지금 입력값에 더한다.
const QUICK = [
  { label: '+1만', amount: 10_000 },
  { label: '+5만', amount: 50_000 },
  { label: '+10만', amount: 100_000 },
  { label: '+100만', amount: 1_000_000 },
]

/**
 * 금액 입력칸. 입력값은 사용자가 친 그대로 두고(검증은 parseAmount), 아래에 읽기 쉬운 금액을 미리 보여 준다.
 * 입력 중에 쉼표를 자동으로 넣으면 커서가 튀고, "1.5" 같은 잘못된 입력을 몰래 고쳐 버리기 때문에 그렇게 하지 않는다.
 */
export function AmountField({ label, value, onChange, invalid = false }: Props) {
  const id = useId()
  const amount = parseAmount(value)

  const add = (delta: number) => {
    const next = (amount ?? 0) + delta
    if (Number.isSafeInteger(next)) {
      onChange(next.toLocaleString('ko-KR'))
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          aria-invalid={invalid}
        />
        <span className="suffix">원</span>
      </div>
      <div className="hint" aria-live="polite">
        {amount !== null && formatWon(amount)}
      </div>
      <div className="chips">
        {QUICK.map((item) => (
          <button key={item.label} type="button" className="chip" onClick={() => add(item.amount)}>
            {item.label}
          </button>
        ))}
        <button type="button" className="chip clear" onClick={() => onChange('')}>
          지우기
        </button>
      </div>
    </div>
  )
}
