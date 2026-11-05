// 코어뱅킹 API(project-corebank)의 요청·응답 형태. 서버의 Java record 와 필드 이름이 같아야 한다.
// 금액은 원 단위 정수다. 서버는 long 이지만 JS number 는 2^53 까지만 정확하므로, 그보다 큰 잔액은 표시가 부정확할 수 있다.

export type AccountStatus = 'ACTIVE' | 'CLOSED'

/** AccountResponse */
export interface Account {
  id: number
  accountNumber: string
  ownerName: string
  /** 계좌 주인(고객 번호). 관리자가 이름만으로 연 계좌와 고객 기능 전 계좌는 null */
  customerId: number | null
  balance: number
  status: AccountStatus
  createdAt: string
  /** 해지 시각. 정상 계좌는 null */
  closedAt: string | null
}

/** DepositResponse, WithdrawalResponse */
export interface MoneyTransaction {
  transactionId: number
  accountId: number
  amount: number
  balanceAfter: number
  createdAt: string
}

/** AccountClosureResponse */
export interface AccountClosure {
  accountId: number
  accountNumber: string
  status: AccountStatus
  /** 해지하면서 지급한 잔액. 잔액이 없었으면 0 */
  payoutAmount: number
  /** 지급을 기록한 원장 거래 번호. 지급이 없었으면 null */
  payoutTransactionId: number | null
  closedAt: string
}

/** TransferResponse */
export interface TransferResult {
  transferId: number
  fromAccountId: number
  toAccountId: number
  amount: number
  fromBalanceAfter: number
  /** 받는 계좌 잔액. 관리자에게만 오고, 고객에게는 null */
  toBalanceAfter: number | null
  createdAt: string
}

export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'CLOSURE_PAYOUT'

/** TransactionHistoryResponse.Item */
export interface HistoryItem {
  transactionId: number
  type: TransactionType
  direction: 'IN' | 'OUT'
  amount: number
  balanceAfter: number
  transferId: number | null
  counterparty: { accountId: number; accountNumber: string; ownerName: string } | null
  createdAt: string
}

/** TransactionHistoryResponse */
export interface TransactionHistory {
  accountId: number
  transactions: HistoryItem[]
  /** 다음 페이지 요청에 before 로 넣을 값. 더 없으면 null */
  nextBefore: number | null
}

/** 서버 공통 에러 응답 ErrorResponse */
export interface ErrorBody {
  code: string
  message: string
}

/** RecipientResponse. 수취인 조회 결과. 예금주 이름은 가려져 온다(홍*동). */
export interface Recipient {
  accountNumber: string
  ownerName: string
}

/** AccountController.MyAccounts */
export interface MyAccounts {
  accounts: Account[]
}

/** AuthController.TokenResponse */
export interface TokenResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  expiresAt: string
  username: string
  role: 'ADMIN' | 'CUSTOMER'
  /** 고객 이름. 관리자는 null */
  name: string | null
}

/** AdminController.AccountPage (쪽 번호 방식, page 는 0부터) */
export interface AdminAccountPage {
  content: Account[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** AdminSummary. 금액 합계는 long 범위를 넘을 수 있어 문자열로 온다. */
export interface AdminSummary {
  accountCount: number
  activeAccountCount: number
  closedAccountCount: number
  totalBalance: string
  transactionCount: number
  todayTransactionCount: number
  transferCount: number
  ledger: {
    balanced: boolean
    debitMinusCredit: string
    clearingBalance: string
    mismatchedAccounts: number
  }
}

// ───────────────────────── 일 마감 (ClosingController) ─────────────────────────

/** BALANCED: 불일치 없음, UNBALANCED: 불일치 있음(배치는 성공), FAILED: 배치 자체가 실패, RUNNING: 실행 중 */
export type ClosingStatus = 'RUNNING' | 'BALANCED' | 'UNBALANCED' | 'FAILED'

export type MismatchType =
  | 'BALANCE_LEDGER_MISMATCH'
  | 'SNAPSHOT_MISMATCH'
  | 'UNBALANCED_TRANSACTION'
  | 'INCOMPLETE_TRANSFER'
  | 'CLEARING_NOT_ZERO'

/** ClosingSummary. 금액은 long 범위를 넘을 수 있어 문자열로 온다. 실행이 끝나기 전에는 집계 값이 null 이다. */
export interface ClosingSummary {
  id: number
  businessDate: string
  status: ClosingStatus
  trigger: 'SCHEDULED' | 'MANUAL'
  requestedBy: string | null
  jobExecutionId: number | null
  accountCount: number | null
  depositLiability: string | null
  mismatchCount: number | null
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
}

/** 일계표 한 줄 */
export interface ClosingTotal {
  type: TransactionType
  count: number
  amount: string
}

/** 불일치 한 건. expected 는 원장 기준 값, actual 은 비교한 값 */
export interface ClosingMismatch {
  id: number
  type: MismatchType
  accountId: number | null
  transactionId: number | null
  transferId: number | null
  expected: string | null
  actual: string | null
  detail: string
}

/** ClosingDetail. mismatches 는 앞의 최대 200건이고, 전체 건수는 closing.mismatchCount 다. */
export interface ClosingDetail {
  closing: ClosingSummary
  totals: ClosingTotal[]
  mismatches: ClosingMismatch[]
}

export interface ClosingPage {
  content: ClosingSummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

// ───────────────────────── 감사 로그 (AuditLogController) ─────────────────────────

/** AuditAction. 서버 enum 이름 그대로 */
export type AuditAction =
  | 'LOGIN'
  | 'CUSTOMER_LOGIN'
  | 'CUSTOMER_SIGNUP'
  | 'ACCOUNT_OPEN'
  | 'MY_ACCOUNTS'
  | 'RECIPIENT_LOOKUP'
  | 'ACCOUNT_VIEW'
  | 'TRANSACTION_HISTORY'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'ACCOUNT_CLOSE'
  | 'TRANSFER'
  | 'ADMIN_ACCOUNT_SEARCH'
  | 'ADMIN_SUMMARY'
  | 'CLOSING_RUN'
  | 'CLOSING_LIST'
  | 'CLOSING_VIEW'
  | 'AUDIT_LOG_SEARCH'

/** SUCCESS: 2xx, DENIED: 401/403, FAILURE: 그 밖 */
export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE'

/** AuditLogEntry. 로그인·가입은 토큰이 없어 actorType 이 ANONYMOUS 이고 actorUsername 은 시도한 아이디다. */
export interface AuditLogEntry {
  id: number
  occurredAt: string
  requestId: string
  actorType: 'ADMIN' | 'CUSTOMER' | 'ANONYMOUS'
  actorUsername: string | null
  customerId: number | null
  action: AuditAction
  httpMethod: string
  path: string
  statusCode: number
  outcome: AuditOutcome
  errorCode: string | null
  targetAccountId: number | null
  counterpartAccountId: number | null
  clientIp: string
  userAgent: string | null
  durationMs: number
}

export interface AuditLogPage {
  content: AuditLogEntry[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

// ───────────────────────── 로그인 잠금 (AdminController) ─────────────────────────

/** LoginThrottle.LockedLogin. 가입하지 않은 아이디도 잠기므로(계정 존재를 숨기려고) 목록에 나올 수 있다. */
export interface LoginLock {
  username: string
  /** 잠기기까지의 연속 실패 수 */
  failureCount: number
  /** 이 시각에 저절로 풀린다(서버 시각, 시간대 없음) */
  lockedUntil: string
}
