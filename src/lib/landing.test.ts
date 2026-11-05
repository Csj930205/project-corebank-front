import { describe, expect, it } from 'vitest'
import { homeFor, landingAfterLogin } from './landing'

describe('로그인 뒤 갈 곳', () => {
  it('보려던 화면이 없으면 관리자는 관리자 화면, 고객은 내 계좌로 간다', () => {
    expect(landingAfterLogin('ADMIN', undefined)).toBe('/admin')
    expect(landingAfterLogin('CUSTOMER', undefined)).toBe('/my')
    expect(homeFor('CUSTOMER')).toBe('/my')
  })

  it('관리자는 보려던 화면으로 돌아간다', () => {
    expect(landingAfterLogin('ADMIN', '/admin/closings')).toBe('/admin/closings')
    expect(landingAfterLogin('ADMIN', '/accounts/3')).toBe('/accounts/3')
  })

  it('고객이 관리자 화면에서 왔으면 내 계좌로 보내고, 계좌 화면이면 그대로 간다', () => {
    expect(landingAfterLogin('CUSTOMER', '/admin')).toBe('/my')
    expect(landingAfterLogin('CUSTOMER', '/admin/closings/1')).toBe('/my')
    expect(landingAfterLogin('CUSTOMER', '/')).toBe('/my')
    expect(landingAfterLogin('CUSTOMER', '/accounts/3')).toBe('/accounts/3')
  })

  it('다른 사이트 주소로는 보내지 않는다', () => {
    expect(landingAfterLogin('ADMIN', '//evil.example')).toBe('/admin')
    expect(landingAfterLogin('ADMIN', 'https://evil.example')).toBe('/admin')
  })
})
