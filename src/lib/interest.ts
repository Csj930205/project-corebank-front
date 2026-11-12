// 예금 상품·이자 화면의 표시와 계산. 화면 컴포넌트에서 떼어 두어 단위 테스트하기 쉽게 한다.

/** 연이율 표시: 3.65 → "연 3.65%", 0.1 → "연 0.10%" (소수 둘째 자리까지 항상 보여 준다) */
export function formatRate(annualRate: number): string {
  return `연 ${annualRate.toFixed(2)}%`
}

/**
 * 금리 입력 검사. 서버와 같은 규칙: 0 이상 20 이하, 소수 둘째 자리까지. 맞으면 숫자, 아니면 null.
 * "1.234" 를 1.23 으로 잘라 보내지 않는다. 관리자가 넣은 금리와 다른 금리로 이자가 나가면 안 된다.
 */
export function parseRate(text: string): number | null {
  const value = text.trim()
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(value)) return null
  const rate = Number(value)
  return rate <= 20 ? rate : null
}

/** 지난달 "YYYY-MM" (브라우저 시각 기준. 서버와 같은 PC 라 시간대가 같다) */
export function lastMonth(today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const TRIGGER_LABEL = { SETTLEMENT: '월 결산', CLOSURE: '해지' } as const
