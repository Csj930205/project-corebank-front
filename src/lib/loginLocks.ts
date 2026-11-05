// 로그인 잠금 화면의 계산. 화면 컴포넌트에서 떼어 두어 단위 테스트하기 쉽게 한다.

/**
 * 잠금이 풀릴 때까지 남은 시간 문구. 서버 시각에는 시간대가 없지만 서버와 브라우저가 같은 PC(같은 시간대)라
 * 브라우저 시각 기준으로 읽는다(일 마감 날짜와 같은 가정).
 */
export function lockRemaining(lockedUntil: string, now: Date = new Date()): string {
  const ms = new Date(lockedUntil).getTime() - now.getTime()
  if (Number.isNaN(ms) || ms <= 0) return '곧 풀림'
  const minutes = Math.ceil(ms / 60_000)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 남음` : `${minutes}분 남음`
}
