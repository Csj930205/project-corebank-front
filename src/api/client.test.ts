import { describe, expect, it, vi } from 'vitest'
import { clearSession, getSession, saveSession } from '../lib/session'
import { ApiError, NetworkError, isOutcomeUnknown, refreshSession, request } from './client'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('request (로그인 토큰)', () => {
  const future = () => new Date(Date.now() + 60_000).toISOString()

  it('로그인 상태면 관리자 API 뿐 아니라 계좌 API 에도 토큰을 붙이고, auth: false(로그인 요청)면 붙이지 않는다', async () => {
    saveSession({ accessToken: 'tok-123', username: 'admin', expiresAt: future(), role: 'ADMIN', name: null, adminRole: 'TELLER' })
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, {})))
    vi.stubGlobal('fetch', fetchMock)

    await request('GET', '/admin/accounts', { auth: true })
    await request('GET', '/accounts/1')
    await request('POST', '/auth/login', { body: {}, auth: false })

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123')
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok-123')
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBeUndefined()
    clearSession()
  })

  it('로그인하지 않았으면 토큰 없이 보낸다', async () => {
    clearSession()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}))
    vi.stubGlobal('fetch', fetchMock)

    await request('GET', '/accounts/1')

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('계좌 API 가 401 이어도(토큰 만료) 로그인 상태를 지운다', async () => {
    saveSession({ accessToken: 'expired', username: 'admin', expiresAt: future(), role: 'ADMIN', name: null, adminRole: 'TELLER' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED', message: 'x' })))

    await request('GET', '/accounts/1').catch(() => undefined)

    expect(getSession()).toBeNull()
  })

  it('관리자 API 가 401 이면 로그인 상태를 지운다', async () => {
    saveSession({ accessToken: 'expired', username: 'admin', expiresAt: future(), role: 'ADMIN', name: null, adminRole: 'TELLER' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED', message: 'x' })))

    await request('GET', '/admin/summary', { auth: true }).catch(() => undefined)

    expect(getSession()).toBeNull()
  })

  it('로그인 실패(401, auth: false)는 다른 세션을 건드리지 않는다', async () => {
    saveSession({ accessToken: 'keep', username: 'admin', expiresAt: future(), role: 'ADMIN', name: null, adminRole: 'TELLER' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'x' })))

    await request('POST', '/auth/login', { body: {}, auth: false }).catch(() => undefined)

    expect(getSession()?.accessToken).toBe('keep')
    clearSession()
  })
})

describe('request (리프레시)', () => {
  const at = (ms: number) => new Date(Date.now() + ms).toISOString()
  const login = (accessToken: string, expiresInMs: number) =>
    saveSession({
      accessToken,
      username: 'admin',
      expiresAt: at(expiresInMs),
      refreshExpiresAt: at(30 * 60_000),
      role: 'ADMIN',
      name: null,
      adminRole: 'TELLER',
    })
  const refreshed = (accessToken: string) =>
    jsonResponse(200, {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      expiresAt: at(15 * 60_000),
      refreshExpiresAt: at(30 * 60_000),
      sessionExpiresAt: at(12 * 3600_000),
      username: 'admin',
      role: 'ADMIN',
      name: null,
      adminRole: 'TELLER',
    })

  it('액세스 토큰이 이미 만료됐으면 먼저 리프레시하고 새 토큰으로 보낸다', async () => {
    login('old', -1000)
    const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
      Promise.resolve(url === '/api/auth/refresh' ? refreshed('new') : jsonResponse(200, {})),
    )
    vi.stubGlobal('fetch', fetchMock)

    await request('GET', '/accounts/1')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/auth/refresh', '/api/accounts/1'])
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer new')
    expect(getSession()?.accessToken).toBe('new')
    clearSession()
  })

  it('401 을 받으면 한 번 리프레시해 다시 보낸다', async () => {
    login('stale', 60_000)
    let calls = 0
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url === '/api/auth/refresh') return Promise.resolve(refreshed('fresh'))
      calls++
      return Promise.resolve(calls === 1 ? jsonResponse(401, { code: 'UNAUTHORIZED', message: 'x' }) : jsonResponse(200, { ok: 1 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await request<{ ok: number }>('GET', '/accounts/1')

    expect(result.data.ok).toBe(1)
    expect(new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe('Bearer fresh')
    clearSession()
  })

  it('동시에 만료를 만나도 리프레시는 한 번만 보낸다(회전된 토큰을 두 번 쓰지 않게)', async () => {
    login('old', -1000)
    const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
      Promise.resolve(url === '/api/auth/refresh' ? refreshed('new') : jsonResponse(200, {})),
    )
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([request('GET', '/accounts/1'), request('GET', '/accounts/2'), refreshSession()])

    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1)
    clearSession()
  })

  it('리프레시도 401 이면 로그인 상태를 지우고 원래 요청의 401 을 알린다', async () => {
    login('old', 60_000)
    const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
      Promise.resolve(
        url === '/api/auth/refresh'
          ? jsonResponse(401, { code: 'INVALID_REFRESH_TOKEN', message: 'x' })
          : jsonResponse(401, { code: 'UNAUTHORIZED', message: 'x' }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const error = await request('GET', '/accounts/1').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('UNAUTHORIZED')
    expect(getSession()).toBeNull()
    // 원래 요청 1번 + 리프레시 1번. 다시 보내지 않는다.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('request', () => {
  it('/api 를 붙이고, 멱등성 키와 JSON 본문을 보낸다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { transactionId: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    await request('POST', '/accounts/1/deposits', { body: { amount: 1000 }, idempotencyKey: 'k-1' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/accounts/1/deposits')
    expect(init.headers['Idempotency-Key']).toBe('k-1')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"amount":1000}')
  })

  it('Idempotent-Replayed 헤더를 replayed 로 알려 준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, {}, { 'Idempotent-Replayed': 'true' })))

    const result = await request('POST', '/transfers', { body: {}, idempotencyKey: 'k' })

    expect(result.replayed).toBe(true)
  })

  it('서버 공통 에러 형식을 ApiError 로 바꾼다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(422, { code: 'INSUFFICIENT_BALANCE', message: '잔액이 부족합니다. id=1' })),
    )

    const error = await request('POST', '/accounts/1/withdrawals', { body: {} }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).code).toBe('INSUFFICIENT_BALANCE')
    expect(isOutcomeUnknown(error)).toBe(false)
  })

  it('연결 실패는 NetworkError 이고, 결과를 모르는 실패다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await request('GET', '/accounts/1').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NetworkError)
    expect(isOutcomeUnknown(error)).toBe(true)
  })

  it('JSON 이 아닌 5xx(프록시 오류 등)도 ApiError 로, 결과를 모르는 실패다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })))

    const error = await request('GET', '/accounts/1').catch((e: unknown) => e)

    expect((error as ApiError).code).toBe('SERVER_ERROR')
    expect(isOutcomeUnknown(error)).toBe(true)
  })
})
