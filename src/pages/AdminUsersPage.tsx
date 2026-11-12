import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { createAdminUser, getAdminUsers } from '../api/admin'
import { Notice } from '../components/Notice'
import { useSession } from '../hooks/useSession'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'

const USERS_KEY = ['admin', 'admins']
const USERNAME = /^[a-z][a-z0-9_]{3,29}$/

/**
 * 관리자 계정. 거래 정정은 요청한 사람이 아닌 다른 관리자가 승인해야 하므로 관리자가 두 명 이상 필요하다.
 * 첫 관리자는 서버 시작 때 .env 로 만들어지고, 그 뒤 관리자는 여기서 등록한다.
 */
export function AdminUsersPage() {
  const session = useSession()
  const users = useQuery({ queryKey: USERS_KEY, queryFn: ({ signal }) => getAdminUsers(signal) })

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>거래 정정을 승인하려면 요청한 사람과 다른 관리자가 필요합니다.</p>
      </div>
      <section className="card">
        <div className="card-title">
          <h2>관리자 목록</h2>
          <p>{users.data ? `${users.data.length}명 · 등록순` : ''}</p>
        </div>
        {users.isError && <Notice tone="error" title={errorMessage(users.error)} />}
        {users.isPending && <div className="skeleton skeleton-row" />}
        {users.data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>등록</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((user) => (
                  <tr key={user.id}>
                    <td className="mono strong">
                      {user.username}
                      {user.username === session?.username && <span className="muted"> (나)</span>}
                    </td>
                    <td className="muted">{formatDateTime(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <CreateAdminCard />
    </div>
  )
}

function CreateAdminCard() {
  const queryClient = useQueryClient()
  const nameId = useId()
  const passwordId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => createAdminUser(username, password),
    onSuccess: () => {
      setUsername('')
      setPassword('')
      void queryClient.invalidateQueries({ queryKey: USERS_KEY })
    },
  })

  const nameOk = USERNAME.test(username)
  const passwordOk = password.length >= 12 && password.length <= 100

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!nameOk || !passwordOk || mutation.isPending) return
    mutation.mutate()
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>관리자 등록</h2>
        <p>등록한 관리자는 같은 로그인 화면에서 로그인합니다</p>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor={nameId}>아이디</label>
          <input
            id={nameId}
            className="input"
            value={username}
            autoComplete="off"
            onChange={(e) => {
              setUsername(e.target.value.trim())
              mutation.reset()
            }}
            placeholder="영문 소문자로 시작, 4~30자"
          />
        </div>
        <div className="field">
          <label htmlFor={passwordId}>비밀번호</label>
          <input
            id={passwordId}
            className="input"
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => {
              setPassword(e.target.value)
              mutation.reset()
            }}
            placeholder="12자 이상"
          />
        </div>
        <button type="submit" className="btn" disabled={!nameOk || !passwordOk || mutation.isPending}>
          {mutation.isPending ? '등록 중' : '관리자 등록'}
        </button>
      </form>
      {mutation.isSuccess && <Notice tone="success" title={`${mutation.data.username} 관리자를 등록했습니다.`} />}
      {mutation.isError && <Notice tone="error" title={errorMessage(mutation.error)} />}
    </section>
  )
}
