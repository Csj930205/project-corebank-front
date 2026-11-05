import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('횟수 제한(429)은 언제 다시 할 수 있는지 담긴 서버 문장을 그대로 쓴다', () => {
    const message = '요청이 너무 많습니다. 45분 뒤에 다시 시도하세요.'
    expect(errorMessage(new ApiError(429, { code: 'RATE_LIMITED', message }))).toBe(message)
  })

  it('그 밖의 코드는 화면용 문장으로 바꾼다(서버 문장에는 id 같은 개발용 정보가 섞인다)', () => {
    expect(errorMessage(new ApiError(404, { code: 'ACCOUNT_NOT_FOUND', message: '계좌가 없습니다. id=3' }))).toBe(
      '계좌를 찾을 수 없습니다.',
    )
  })
})
