import { clearSession, getSession } from '../lib/session'
import type { ErrorBody } from './types'

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

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }
  if (options.auth !== false) {
    const session = getSession()
    if (session) {
      headers.Authorization = `Bearer ${session.accessToken}`
    }
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
    // 토큰이 만료됐거나 없거나 서버가 거부하면 로그인 상태를 지운다. 화면은 로그인 페이지로 보낸다(RequireAuth).
    if (options.auth !== false && response.status === 401) {
      clearSession()
    }
    throw new ApiError(response.status, await readErrorBody(response))
  }
  return {
    data: (await response.json()) as T,
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
