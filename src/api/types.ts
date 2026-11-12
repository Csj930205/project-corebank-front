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
  /** 예금 상품. annualRate 는 연이율(%) */
  product: { id: number; name: string; annualRate: number }
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

/** REVERSAL_OUT·REVERSAL_IN 은 관리자 정정(역분개)으로 생긴 거래다. 잔액이 줄면 OUT, 늘면 IN */
export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'CLOSURE_PAYOUT'
  | 'REVERSAL_OUT'
  | 'REVERSAL_IN'
  | 'INTEREST'

/** TransactionHistoryResponse.Item */
export interface HistoryItem {
  transactionId: number
  type: TransactionType
  direction: 'IN' | 'OUT'
  amount: number
  balanceAfter: number
  transferId: number | null
  counterparty: { accountId: number; accountNumber: string; ownerName: string } | null
  /** 역분개일 때 되돌린 원래 거래 id. 그 밖에는 null */
  reversalOfId: number | null
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

/** 관리자 역할(AdminRole). 창구는 돈을 움직이고, 책임자는 승인하고, 운영은 마감·이자·상품·관리자 등록 요청을 한다. */
export type AdminRole = 'TELLER' | 'APPROVER' | 'OPERATOR'

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
  /** 관리자 역할. 고객은 null */
  adminRole: AdminRole | null
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
  | 'ACCOUNT_INTEREST'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'ACCOUNT_CLOSE'
  | 'TRANSFER'
  | 'PRODUCT_LIST'
  | 'ADMIN_ACCOUNT_SEARCH'
  | 'ADMIN_SUMMARY'
  | 'CLOSING_RUN'
  | 'CLOSING_LIST'
  | 'CLOSING_VIEW'
  | 'LOGIN_LOCK_LIST'
  | 'LOGIN_UNLOCK'
  | 'CORRECTION_REQUEST'
  | 'CORRECTION_LIST'
  | 'CORRECTION_VIEW'
  | 'CORRECTION_APPROVE'
  | 'CORRECTION_REJECT'
  | 'ADMIN_PRODUCT_LIST'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_DISCONTINUE'
  | 'INTEREST_ACCRUE'
  | 'INTEREST_SETTLE'
  | 'INTEREST_PAYMENT_LIST'
  | 'ADMIN_USER_LIST'
  | 'ADMIN_USER_CREATE'
  | 'ADMIN_USER_APPROVE'
  | 'ADMIN_USER_REJECT'
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

// ───────────────────────── 거래 정정 (CorrectionController) ─────────────────────────

export type CorrectionStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED'

/** CorrectionView. 이체는 출금 쪽 거래가 대상이고 받은 계좌는 counterpartAccountNumber 다. */
export interface Correction {
  id: number
  status: CorrectionStatus
  reason: string
  requestedBy: string
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionComment: string | null
  transactionId: number
  transactionType: TransactionType
  amount: number
  transactionAt: string
  transferId: number | null
  accountId: number
  accountNumber: string | null
  ownerName: string | null
  counterpartAccountNumber: string | null
  /** 승인으로 생긴 역분개 거래 id. 이체는 2개 */
  reversalTransactionIds: number[]
}

export interface CorrectionPage {
  content: Correction[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type AdminUserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED'

/** AdminController.AdminUserResponse */
export interface AdminUser {
  id: number
  username: string
  role: AdminRole
  /** PENDING 이면 책임자 승인 전이라 로그인할 수 없다 */
  status: AdminUserStatus
  /** 등록을 요청한 운영자. 서버 설정(.env)으로 만든 계정은 null */
  requestedBy: string | null
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
}

// ───────────────────────── 예금 상품·이자 (ProductController, InterestController) ─────────────────────────

/** ProductResponse. annualRate 는 연이율(%), 소수 둘째 자리까지 */
export interface DepositProduct {
  id: number
  name: string
  annualRate: number
  status: 'ACTIVE' | 'DISCONTINUED'
  createdAt: string
  discontinuedAt: string | null
}

/** InterestController.Payment. 금액은 원. 세전 = 소득세 + 지방세 + 세후 */
export interface InterestPayment {
  id: number
  accountId: number
  trigger: 'SETTLEMENT' | 'CLOSURE'
  periodFrom: string
  periodTo: string
  dayCount: number
  grossAmount: number
  incomeTax: number
  localTax: number
  netAmount: number
  /** 원장의 이자 거래. 이자가 0원이면 null */
  transactionId: number | null
  paidAt: string
}

/** InterestController.AccountInterestResponse */
export interface AccountInterest {
  accountId: number
  /** 어제까지 쌓였지만 아직 받지 않은 이자. 없으면 null */
  unpaid: {
    from: string
    to: string
    days: number
    /** Σ(일별 잔액 × 연이율%). 큰 수라 문자열 */
    balanceRateSum: string
    estimatedGross: number
    estimatedTax: number
    estimatedNet: number
  } | null
  payments: InterestPayment[]
}

/** InterestService.AccrualResult */
export interface AccrualResult {
  businessDate: string
  accrued: number
}

export type BatchStatus = 'COMPLETED' | 'FAILED' | 'STOPPED' | 'STARTED' | 'STARTING' | 'STOPPING' | 'ABANDONED' | 'UNKNOWN'

/** InterestService.SettlementResult. 결산은 Spring Batch 잡(interestSettlementJob)으로 돈다. */
export interface SettlementResult {
  month: string
  /** 배치 실행 번호(BATCH_JOB_EXECUTION) */
  jobExecutionId: number
  /** COMPLETED 면 끝까지 돌았다(실패 계좌가 있어도). 그 밖에는 중간에 멈췄다 */
  status: BatchStatus
  paid: number
  skipped: number
  failed: number
  totalGross: number
  totalTax: number
  totalNet: number
}

export interface InterestPaymentPage {
  content: InterestPayment[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}
