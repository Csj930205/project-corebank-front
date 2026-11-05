import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { IdempotencyKeyHolder } from '../api/idempotency'

interface Options<TVariables, TResult> {
  /** 요청 내용을 문자열로. 내용이 같으면 재시도로 보고 같은 키를 쓴다. */
  fingerprint: (variables: TVariables) => string
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TResult>
  onSuccess?: (result: TResult, variables: TVariables) => void
}

/**
 * 돈이 움직이는 요청용 mutation. 멱등성 키를 붙이고 두 가지 중복을 막는다.
 *
 * 1. 중복 클릭: 처리 중에는 submit 을 무시한다(isPending). 버튼도 비활성화한다.
 * 2. 재시도 중복: 결과를 모르는 실패 뒤 같은 내용으로 다시 보내면 같은 키를 쓴다. 서버가 이미 처리했다면 처음 결과를 돌려준다.
 */
export function useIdempotentMutation<TVariables, TResult>(options: Options<TVariables, TResult>) {
  const holder = useRef(new IdempotencyKeyHolder())
  // 버튼 비활성화(isPending)는 다시 렌더링된 뒤에 반영된다. 렌더링 시점에 기대지 않도록, 즉시 바뀌는 ref 로 한 번 더 막는다.
  // Enter 키 연타처럼 버튼을 거치지 않는 제출도 같은 경로로 막힌다.
  const inFlight = useRef(false)
  // holder 는 렌더링과 무관한 값이라 ref 에 두고, 화면에 보여 줄 "재시도 대기" 여부만 state 로 둔다.
  const [pendingRetry, setPendingRetry] = useState(false)

  const mutation = useMutation({
    mutationFn: (variables: TVariables) =>
      options.mutationFn(variables, holder.current.keyFor(options.fingerprint(variables))),
    onSuccess: (result, variables) => options.onSuccess?.(result, variables),
    onSettled: (_result, error) => {
      inFlight.current = false
      holder.current.settle(error ?? undefined)
      setPendingRetry(holder.current.hasPendingRetry)
    },
  })

  const submit = (variables: TVariables) => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    mutation.mutate(variables)
  }

  return { ...mutation, submit, pendingRetry }
}
