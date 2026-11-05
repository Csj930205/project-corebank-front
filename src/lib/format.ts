/** 15000 → "15,000원" */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}

/**
 * 문자열로 온 큰 금액(예: 관리자 요약의 잔액 합계) → "18,446,744,073,709,551,614원".
 * number 로 바꾸면 2^53 을 넘는 자리가 틀어지므로 BigInt 로 계산한다.
 */
export function formatWonString(amount: string): string {
  try {
    return `${BigInt(amount).toLocaleString('ko-KR')}원`
  } catch {
    return `${amount}원`
  }
}

/** 서버 LocalDateTime("2026-11-03T13:09:36.795003") → "2026-11-03 13:09:36". 서버가 시간대 없이 한국 시각으로 준다. */
export function formatDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 19)
}

/**
 * 금액 입력을 원 단위 정수로 바꾼다. 쉼표와 공백은 허용하고, 1원 미만·소수·문자는 null.
 * 서버도 같은 규칙으로 거부하지만, 화면에서 먼저 막아 불필요한 요청을 줄인다.
 */
export function parseAmount(input: string): number | null {
  const normalized = input.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(normalized)) {
    return null
  }
  const amount = Number(normalized)
  return Number.isSafeInteger(amount) && amount >= 1 ? amount : null
}

/** 계좌번호 입력. 하이픈과 공백을 빼고 숫자 13자리면 돌려준다. 붙여 넣은 "110-0000-000002" 도 받는다. */
export function parseAccountNumber(input: string): string | null {
  const digits = input.replace(/[-\s]/g, '')
  return /^\d{13}$/.test(digits) ? digits : null
}

/** 계좌번호 표시. 1100000000002 → 110-0000-000002 */
export function formatAccountNumber(accountNumber: string): string {
  return accountNumber.replace(/^(\d{3})(\d{4})(\d{6})$/, '$1-$2-$3')
}

/** 계좌 id 입력. 1 이상의 정수만 */
export function parseAccountId(input: string): number | null {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }
  const id = Number(trimmed)
  return Number.isSafeInteger(id) && id >= 1 ? id : null
}
