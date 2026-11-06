import { describe, expect, it } from 'vitest'
import { mainPathFor, navItemsFor } from './nav'

const labels = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((item) => item.label)
const activeAt = (role: Parameters<typeof navItemsFor>[0], path: string) =>
  navItemsFor(role)
    .filter((item) => item.match(path))
    .map((item) => item.label)

describe('상단 메뉴', () => {
  it('역할마다 메뉴가 다르다', () => {
    expect(labels('ADMIN')).toEqual(['계좌 조회·개설', '전체 계좌', '일 마감', '감사 로그', '로그인 잠금'])
    expect(labels('CUSTOMER')).toEqual(['내 계좌'])
    expect(labels(null)).toEqual(['로그인', '회원가입'])
  })

  it('지금 주소에 맞는 메뉴 하나만 강조한다', () => {
    expect(activeAt('ADMIN', '/')).toEqual(['계좌 조회·개설'])
    expect(activeAt('ADMIN', '/accounts/7')).toEqual(['계좌 조회·개설'])
    expect(activeAt('ADMIN', '/admin')).toEqual(['전체 계좌'])
    expect(activeAt('ADMIN', '/admin/closings/3')).toEqual(['일 마감'])
    expect(activeAt('CUSTOMER', '/accounts/7')).toEqual(['내 계좌'])
    expect(activeAt(null, '/signup')).toEqual(['회원가입'])
  })

  it('로고는 역할별 메인 화면으로', () => {
    expect(mainPathFor('ADMIN')).toBe('/')
    expect(mainPathFor('CUSTOMER')).toBe('/my')
    expect(mainPathFor(null)).toBe('/login')
  })
})
