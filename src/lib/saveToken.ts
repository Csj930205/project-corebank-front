import type { TokenResponse } from '../api/types'
import { saveSession } from './session'

/** 로그인·가입 응답을 로그인 상태로 저장한다. */
export function saveToken(token: TokenResponse): void {
  saveSession({
    accessToken: token.accessToken,
    username: token.username,
    expiresAt: token.expiresAt,
    role: token.role,
    name: token.name,
  })
}
