import { request } from './client'
import type { TokenResponse } from './types'

// 로그인과 가입. 요청에 (만료됐을 수 있는) 이전 토큰을 보내지 않는다(auth: false).

/** 로그인. 관리자 계정이면 role=ADMIN, 고객이면 role=CUSTOMER 토큰을 받는다. */
export async function login(username: string, password: string) {
  return (await request<TokenResponse>('POST', '/auth/login', { body: { username, password }, auth: false })).data
}

/**
 * 로그아웃. 서버가 로그인 세션을 끊고 리프레시 쿠키를 지운다. 그 세션의 액세스 토큰도 바로 쓸 수 없게 된다.
 * 실패해도(서버 꺼짐 등) 화면의 로그아웃은 막지 않는다. 그 경우 세션은 쓰지 않으면 30분 뒤에 끝난다.
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // 무시
  }
}

/** 고객 가입. 가입하면 바로 로그인된 토큰을 준다. */
export async function signUp(username: string, password: string, name: string) {
  return (
    await request<TokenResponse>('POST', '/auth/customer/signup', { body: { username, password, name }, auth: false })
  ).data
}
