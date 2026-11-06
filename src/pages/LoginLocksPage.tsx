import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { getLoginLocks, unlockLogin } from '../api/admin'
import type { LoginLock } from '../api/types'
import { Notice } from '../components/Notice'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { lockRemaining } from '../lib/loginLocks'

const LOCKS_KEY = ['admin', 'login-locks']

/**
 * 로그인 잠금 해제. 고객이 "잠겼다" 고 창구에 오면, 본인 확인을 한 뒤 15분을 기다리지 않고 바로 푼다.
 * 푼 것(LOGIN_UNLOCK)과 이 목록을 본 것(LOGIN_LOCK_LIST)은 서버 감사 로그에 남는다.
 */
export function LoginLocksPage() {
  const queryClient = useQueryClient()
  const [done, setDone] = useState<string | null>(null)

  const unlock = useMutation({
    mutationFn: unlockLogin,
    onSuccess: (_data, username) => {
      setDone(username)
      void queryClient.invalidateQueries({ queryKey: LOCKS_KEY })
    },
  })

  const run = (username: string) => {
    setDone(null)
    unlock.mutate(username)
  }

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>로그인을 5번 연속 틀린 아이디는 15분 동안 잠깁니다. 본인 확인을 마쳤다면 여기서 바로 풀 수 있습니다.</p>
      </div>
      {done && (
        <Notice tone="success" title={`${done} 의 로그인 잠금을 풀었습니다.`}>
          실패 횟수도 지워져 처음부터 다시 셉니다.
        </Notice>
      )}
      {unlock.isError && <Notice tone="error" title={errorMessage(unlock.error)} />}
      <LockTable onUnlock={run} pending={unlock.isPending ? unlock.variables : undefined} />
      <UnlockByName onUnlock={run} pending={unlock.isPending} />
    </div>
  )
}

function LockTable({ onUnlock, pending }: { onUnlock: (username: string) => void; pending?: string }) {
  const locks = useQuery({
    queryKey: LOCKS_KEY,
    queryFn: ({ signal }) => getLoginLocks(signal),
    // 잠금은 시간이 지나면 저절로 풀리므로 목록도 가끔 다시 읽는다.
    refetchInterval: 30_000,
  })
  // 해제는 되돌릴 수 없으니 한 번 더 누르게 한다(계좌 해지와 같은 방식). 한 번에 한 줄만 확인 중일 수 있다.
  const [confirming, setConfirming] = useState<string | null>(null)
  const data = locks.data

  return (
    <section className="card">
      <div className="card-title">
        <h2>잠긴 아이디</h2>
        <p>{data ? `${data.length.toLocaleString('ko-KR')}개 · 곧 풀리는 순서` : ''}</p>
      </div>

      {locks.isError && <Notice tone="error" title={errorMessage(locks.error)} />}
      {locks.isPending && <div className="skeleton skeleton-row" />}

      {data && data.length === 0 && (
        <div className="empty">
          <strong>지금 잠긴 아이디가 없습니다</strong>
        </div>
      )}

      {data && data.length > 0 && (
        <div className={`table-wrap ${locks.isFetching ? 'refreshing' : ''}`}>
          <table className="table">
            <thead>
              <tr>
                <th>아이디</th>
                <th className="num">실패</th>
                <th>풀리는 시각</th>
                <th className="hide-sm">기록</th>
                <th aria-label="해제" />
              </tr>
            </thead>
            <tbody>
              {data.map((lock: LoginLock) => (
                <tr key={lock.username}>
                  <td className="mono strong">{lock.username}</td>
                  <td className="num">{lock.failureCount}번</td>
                  <td>
                    {formatDateTime(lock.lockedUntil)}
                    <div className="muted audit-code">{lockRemaining(lock.lockedUntil)}</div>
                  </td>
                  <td className="hide-sm">
                    {/* 누가 어디서 틀렸는지 보고 본인 실수인지 공격인지 판단한다 */}
                    <Link to={`/admin/audit-logs?actor=${encodeURIComponent(lock.username)}&action=LOGIN`}>
                      로그인 기록
                    </Link>
                  </td>
                  <td className="num">
                    {confirming === lock.username ? (
                      <span className="lock-actions">
                        <button
                          type="button"
                          className="btn danger"
                          disabled={pending !== undefined}
                          onClick={() => {
                            setConfirming(null)
                            onUnlock(lock.username)
                          }}
                        >
                          해제 확정
                        </button>
                        <button type="button" className="btn ghost" onClick={() => setConfirming(null)}>
                          취소
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={pending !== undefined}
                        onClick={() => setConfirming(lock.username)}
                        aria-label={`${lock.username} 잠금 해제`}
                      >
                        {pending === lock.username ? '해제 중' : '해제'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint left">
        가입하지 않은 아이디도 잠깁니다. 잠기는지로 계정이 있는지 알아낼 수 없게 하려는 것입니다. 모르는 아이디가 많이 보이면
        누군가 아이디를 바꿔 가며 시도하고 있다는 뜻일 수 있습니다.
      </p>
    </section>
  )
}

/** 목록에 아직 안 보이는(방금 잠긴) 아이디도 바로 풀 수 있게, 아이디를 직접 넣어 푼다. */
function UnlockByName({ onUnlock, pending }: { onUnlock: (username: string) => void; pending: boolean }) {
  const [username, setUsername] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = username.trim()
    if (!value || pending) return
    onUnlock(value)
    setUsername('')
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>아이디로 해제</h2>
        <p>잠겨 있지 않은 아이디라면 바뀌는 것이 없습니다</p>
      </div>
      <form className="search" onSubmit={submit}>
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="로그인 아이디"
          aria-label="해제할 아이디"
          maxLength={50}
        />
        <button type="submit" className="btn secondary" disabled={pending || !username.trim()}>
          잠금 해제
        </button>
      </form>
    </section>
  )
}
