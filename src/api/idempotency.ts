import { isOutcomeUnknown } from './client'

/**
 * 화면 쪽 멱등성 키 관리. 서버의 멱등성 키 규칙과 짝을 이룬다.
 *
 * - 같은 내용의 요청을 "다시 시도"할 때만 같은 키를 쓴다. 결과를 모르는 실패(네트워크 오류, 5xx) 뒤의 재시도가 그렇다.
 *   서버가 처음 요청을 처리했다면 같은 키 덕분에 두 번 처리되지 않고 처음 결과를 돌려받는다.
 * - 성공했거나, 4xx 로 처리되지 않은 것이 확실하면 키를 버린다. 다음 요청은 새 요청이므로 새 키를 쓴다.
 * - 재시도하기 전에 금액 등 내용을 바꾸면 새 요청이므로 새 키를 쓴다. 같은 키로 다른 내용을 보내면 서버가 422 로 거부한다.
 *
 * 내용 비교에는 fingerprint(요청 내용을 문자열로 만든 값)를 쓴다. 서버의 request_fingerprint 와 같은 생각이다.
 */
export class IdempotencyKeyHolder {
  private pending: { fingerprint: string; key: string } | null = null
  private readonly generate: () => string

  constructor(generate: () => string = () => crypto.randomUUID()) {
    this.generate = generate
  }

  /** 이 내용으로 보낼 요청의 키. 결과를 모르는 실패 뒤 같은 내용이면 이전 키를 다시 준다. */
  keyFor(fingerprint: string): string {
    if (this.pending === null || this.pending.fingerprint !== fingerprint) {
      this.pending = { fingerprint, key: this.generate() }
    }
    return this.pending.key
  }

  /** 요청이 끝나면 부른다. 성공(error 없음)이나 확실한 실패면 키를 버리고, 결과를 모르는 실패면 재시도를 위해 남긴다. */
  settle(error?: unknown): void {
    if (error === undefined || !isOutcomeUnknown(error)) {
      this.pending = null
    }
  }

  /** 결과를 모르는 실패 뒤라, 다음 요청이 재시도인지 */
  get hasPendingRetry(): boolean {
    return this.pending !== null
  }
}
