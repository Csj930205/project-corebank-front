// 최근에 연 계좌 목록. 코어 API 에 계좌 목록 조회가 아직 없어서, 이 브라우저에서 연 계좌만 기억해 둔다.
// localStorage 는 개인정보 보호 모드 등에서 막힐 수 있으므로 실패해도 화면은 그대로 동작하게 한다.

export interface RecentAccount {
  id: number
  accountNumber: string
  ownerName: string
}

const STORAGE_KEY = 'corebank.recentAccounts'
const MAX = 8

export function loadRecentAccounts(): RecentAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as RecentAccount[]).slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberAccount(account: RecentAccount): void {
  try {
    const rest = loadRecentAccounts().filter((item) => item.id !== account.id)
    const next = [{ id: account.id, accountNumber: account.accountNumber, ownerName: account.ownerName }, ...rest]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX)))
  } catch {
    // 저장하지 못해도 기능에는 영향 없음
  }
}
