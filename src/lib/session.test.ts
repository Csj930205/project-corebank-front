import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSession, getSession, isExpired, saveSession, subscribe } from './session'

const future = () => new Date(Date.now() + 30 * 60_000).toISOString()

afterEach(() => {
  clearSession()
  sessionStorage.clear()
})

describe('session', () => {
  it('저장하면 sessionStorage 에도 남고, 지우면 사라진다', () => {
    saveSession({ accessToken: 't', username: 'admin', expiresAt: future(), role: 'ADMIN', name: null, adminRole: 'TELLER' })
    expect(getSession()?.username).toBe('admin')
    expect(sessionStorage.getItem('corebank.session')).toContain('"accessToken":"t"')

    clearSession()
    expect(getSession()).toBeNull()
    expect(sessionStorage.getItem('corebank.session')).toBeNull()
  })

  it('만료된 세션은 돌려주지 않고 지운다', () => {
    saveSession({ accessToken: 't', username: 'admin', expiresAt: new Date(Date.now() - 1000).toISOString(), role: 'ADMIN', name: null, adminRole: 'TELLER' })
    expect(getSession()).toBeNull()
  })

  it('isExpired 는 만료 시각을 기준으로 판단한다', () => {
    const session = { accessToken: 't', username: 'a', expiresAt: '2026-11-03T10:00:00Z', role: 'ADMIN' as const, name: null, adminRole: 'TELLER' as const }
    expect(isExpired(session, Date.parse('2026-11-03T09:59:59Z'))).toBe(false)
    expect(isExpired(session, Date.parse('2026-11-03T10:00:00Z'))).toBe(true)
  })

  it('로그인·로그아웃을 구독자에게 알린다', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    saveSession({ accessToken: 't', username: 'admin', expiresAt: future(), role: 'ADMIN', name: null, adminRole: 'TELLER' })
    clearSession()
    unsubscribe()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('저장소가 막혀도 메모리로 계속 동작한다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    saveSession({ accessToken: 't', username: 'admin', expiresAt: future(), role: 'ADMIN', name: null, adminRole: 'TELLER' })
    expect(getSession()?.accessToken).toBe('t')
  })
})
