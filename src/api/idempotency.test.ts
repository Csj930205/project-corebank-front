import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from './client'
import { IdempotencyKeyHolder } from './idempotency'

function holder() {
  let n = 0
  return new IdempotencyKeyHolder(() => `key-${++n}`)
}

describe('IdempotencyKeyHolder', () => {
  it('성공하면 다음 요청은 새 키', () => {
    const h = holder()
    expect(h.keyFor('deposit|1|1000')).toBe('key-1')
    h.settle()
    expect(h.keyFor('deposit|1|1000')).toBe('key-2')
  })

  it('네트워크 오류 뒤 같은 내용으로 재시도하면 같은 키', () => {
    const h = holder()
    expect(h.keyFor('deposit|1|1000')).toBe('key-1')
    h.settle(new NetworkError(new TypeError('Failed to fetch')))
    expect(h.hasPendingRetry).toBe(true)
    expect(h.keyFor('deposit|1|1000')).toBe('key-1')
  })

  it('5xx 도 결과를 모르는 실패라 같은 키로 재시도', () => {
    const h = holder()
    h.keyFor('transfer|1|2|500')
    h.settle(new ApiError(502, { code: 'SERVER_ERROR', message: 'HTTP 502' }))
    expect(h.keyFor('transfer|1|2|500')).toBe('key-1')
  })

  it('4xx 는 처리되지 않은 것이 확실하므로 키를 버린다', () => {
    const h = holder()
    h.keyFor('withdraw|1|99999')
    h.settle(new ApiError(422, { code: 'INSUFFICIENT_BALANCE', message: '잔액이 부족합니다.' }))
    expect(h.hasPendingRetry).toBe(false)
    expect(h.keyFor('withdraw|1|99999')).toBe('key-2')
  })

  it('재시도 전에 금액을 바꾸면 새 요청이므로 새 키 (같은 키면 서버가 422 로 거부)', () => {
    const h = holder()
    h.keyFor('deposit|1|1000')
    h.settle(new NetworkError(null))
    expect(h.keyFor('deposit|1|2000')).toBe('key-2')
  })
})
