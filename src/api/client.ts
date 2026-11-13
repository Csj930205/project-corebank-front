import { saveToken } from '../lib/saveToken'
import { clearSession, getSession, isAccessTokenStale } from '../lib/session'
import type { ErrorBody, TokenResponse } from './types'

/** 개발 서버 프록시(vite.config.ts)를 거쳐 코어뱅킹 서버로 간다. */
const BASE_URL = '/api'

/**
 * 서버가 에러로 응답한 경우. 4xx 는 서버가 요청을 확실히 처리하지 않았다는 뜻이다(업무 오류 포함).
 * 5xx 는 서버 안에서 무슨 일이 있었는지 확실하지 않다.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, body: ErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
  }
}

/** 응답을 받지 못한 경우(서버 꺼짐, 네트워크 끊김). 요청이 처리됐는지 알 수 없다. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('서버에 연결하지 못했습니다.', { cause })
    this.name = 'NetworkError'
  }
}

/**
 * 결과를 알 수 없는 실패인지. 이런 실패는 서버가 처리했을 수도 있으므로, 다시 시도할 때 같은 멱등성 키를 써야
 * 두 번 처리되지 않는다. 4xx 처럼 처리되지 않은 것이 확실한 실패는 새 키로 다시 보내도 된다.
 */
export function isOutcomeUnknown(error: unknown): boolean {
  return error instanceof NetworkError || (error instanceof ApiError && error.status >= 500)
}

export interface ApiResult<T> {
  data: T
  /** 같은 멱등성 키로 다시 보낸 요청이라, 서버가 처음 결과를 그대로 돌려줬으면 true (Idempotent-Replayed 헤더) */
  replayed: boolean
  /** 응답의 Location 헤더 (계좌 개설, 이체) */
  location: string | null
}

interface RequestOptions {
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
  /**
   * false 면 토큰을 보내지 않는다(로그인 요청). 기본값은 로그인 상태면 토큰을 보내는 것이다.
   * 코어 서버는 계좌·이체 API 에도 로그인을 요구한다(관리자는 모든 계좌, 고객은 본인 계좌).
   */
  auth?: boolean
}

let refreshing: Promise<boolean> | null = null

/**
 * 리프레시 토큰(HttpOnly 쿠키)으로 새 액세스 토큰을 받는다. 성공하면 로그인 상태를 새 토큰으로 바꾸고 true.
 *
 * 동시에 여러 요청이 만료를 만나도 리프레시는 한 번만 보낸다(같은 Promise 를 나눠 쓴다). 서버는 리프레시 토큰을 쓸 때마다
 * 바꾸므로(회전), 같은 쿠키로 두 번 보내면 두 번째는 "이미 쓴 토큰" 으로 거부된다.
 *
 * 쿠키는 스크립트가 읽지 못한다. 같은 출처 요청이라 브라우저가 알아서 실어 보낸다(fetch 기본 credentials: same-origin).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function doRefresh(): Promise<boolean> {
  let response: Response
  try {
    response = await fetch(BASE_URL + '/auth/refresh', { method: 'POST', headers: { Accept: 'application/json' } })
  } catch {
    // 서버에 닿지 못했다. 로그인 상태는 그대로 두고, 원래 요청이 실패를 알린다.
    return false
  }
  if (!response.ok) {
    // 리프레시 토큰이 끝났거나(30분 미사용, 12시간), 로그아웃·도난 탐지로 세션이 끊겼다. 다시 로그인해야 한다.
    if (response.status === 401) clearSession()
    return false
  }
  saveToken((await response.json()) as TokenResponse)
  return true
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  // 액세스 토큰이 이미 만료됐으면 보내 봐야 401 이므로 먼저 리프레시한다.
  if (options.auth !== false) {
    const session = getSession()
    if (session && isAccessTokenStale(session)) {
      await refreshSession()
    }
  }
  return send<T>(method, path, options, false)
}

async function send<T>(method: string, path: string, options: RequestOptions, retried: boolean): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }
  const session = options.auth !== false ? getSession() : null
  if (session) {
    headers.Authorization = `Bearer ${session.accessToken}`
  }

  let response: Response
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause
    }
    throw new NetworkError(cause)
  }

  if (!response.ok) {
    if (session && response.status === 401) {
      // 토큰이 거부됐다(시계 차이로 만료가 일찍 왔거나, 다른 탭이 리프레시해 이 탭의 토큰이 낡음). 한 번만 리프레시해 다시 보낸다.
      // 401 은 보안 필터가 업무 처리 전에 막은 것이라, 멱등성 키가 없는 요청(계좌 개설)도 다시 보내도 두 번 처리되지 않는다.
      if (!retried && (await refreshSession())) {
        return send<T>(method, path, options, true)
      }
      // 리프레시도 안 되면 로그인 상태를 지운다. 화면은 로그인 페이지로 보낸다(RequireAuth).
      clearSession()
    }
    throw new ApiError(response.status, await readErrorBody(response))
  }
  return {
    // 204 No Content(잠금 해제 등)는 본문이 없다. json() 을 부르면 실패하므로 읽지 않는다.
    data: (response.status === 204 ? undefined : await response.json()) as T,
    replayed: response.headers.get('Idempotent-Replayed') === 'true',
    location: response.headers.get('Location'),
  }
}

/** 서버의 공통 에러 형식을 읽는다. 프록시 오류처럼 형식이 다르면 상태 코드로 대신한다. */
async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'code' in body && 'message' in body) {
      return { code: String(body.code), message: String(body.message) }
    }
  } catch {
    // JSON 이 아닌 응답
  }
  return { code: response.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN_ERROR', message: `HTTP ${response.status}` }
}
