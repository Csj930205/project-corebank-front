import type { AdminRole } from '../api/types'
import { saveSession } from '../lib/session'

/** 테스트용 관리자 로그인. 화면은 역할에 따라 버튼을 보여 주거나 숨긴다(lib/roles). */
export function loginAdmin(adminRole: AdminRole, username = 'admin') {
  saveSession({
    accessToken: 't',
    username,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    role: 'ADMIN',
    name: null,
    adminRole,
  })
}
