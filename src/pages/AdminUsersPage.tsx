import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { approveAdminUser, getAdminUsers, rejectAdminUser, requestAdminUser } from '../api/admin'
import type { AdminRole, AdminUser, AdminUserStatus } from '../api/types'
import { Notice } from '../components/Notice'
import { useSession } from '../hooks/useSession'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { ADMIN_ROLE_DESCRIPTION, ADMIN_ROLE_LABEL, can, roleOnlyHint } from '../lib/roles'

const USERS_KEY = ['admin', 'admins']
const USERNAME = /^[a-z][a-z0-9_]{3,29}$/
const ROLES: AdminRole[] = ['TELLER', 'APPROVER', 'OPERATOR']

const STATUS_LABEL: Record<AdminUserStatus, string> = { PENDING: '승인 대기', ACTIVE: '사용 중', REJECTED: '반려' }
const STATUS_CLASS: Record<AdminUserStatus, string> = {
  PENDING: 'status-running',
  ACTIVE: 'status-active',
  REJECTED: 'status-closed',
}

/**
 * 관리자 계정. 관리자마다 역할이 하나다(창구·책임자·운영). 운영자가 등록을 요청하고 책임자가 승인해야 로그인할 수 있다.
 * 한 사람이 혼자 계정을 늘려 자기 정정 요청을 자기가 승인하는 일을 막기 위해서다.
 * 첫 운영자와 책임자는 서버 시작 때 .env 로 만들어진다.
 */
export function AdminUsersPage() {
  const session = useSession()
  const users = useQuery({ queryKey: USERS_KEY, queryFn: ({ signal }) => getAdminUsers(signal) })
  const pending = users.data?.filter((u) => u.status === 'PENDING') ?? []

  return (
    <div className="stack">
      <div className="welcome">
        <h1>관리자</h1>
        <p>운영자가 등록을 요청하고 책임자가 승인해야 새 관리자가 로그인할 수 있습니다. 역할은 정한 뒤 바꿀 수 없습니다.</p>
      </div>
      {pending.length > 0 && <PendingCard pending={pending} />}
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
                  <th>역할</th>
                  <th>상태</th>
                  <th className="hide-sm">요청 · 승인</th>
                  <th className="hide-sm">등록</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((user) => (
                  <tr key={user.id}>
                    <td className="mono strong">
                      {user.username}
                      {user.username === session?.username && <span className="muted"> (나)</span>}
                    </td>
                    <td>{ADMIN_ROLE_LABEL[user.role]}</td>
                    <td>
                      <span className={`status ${STATUS_CLASS[user.status]}`}>{STATUS_LABEL[user.status]}</span>
                    </td>
                    <td className="muted hide-sm">{decisionText(user)}</td>
                    <td className="muted hide-sm">{formatDateTime(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {can(session, 'OPERATE') ? (
        <RequestAdminCard />
      ) : (
        <Notice tone="info" title={`관리자 등록 요청은 ${roleOnlyHint('OPERATE')}`} />
      )}
    </div>
  )
}

function decisionText(user: AdminUser): string {
  if (!user.requestedBy) return '서버 설정'
  if (!user.decidedBy) return `${user.requestedBy} 요청`
  return `${user.requestedBy} 요청 · ${user.decidedBy} ${user.status === 'ACTIVE' ? '승인' : '반려'}`
}

/** 승인을 기다리는 등록. 승인·반려 버튼은 책임자에게만 보인다. */
function PendingCard({ pending }: { pending: AdminUser[] }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const canApprove = can(session, 'APPROVE')
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: number; approve: boolean }) =>
      approve ? approveAdminUser(id) : rejectAdminUser(id),
    // 성공이든 실패(다른 책임자가 먼저 결정)든 목록을 새로 읽는다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })

  return (
    <section className="card">
      <div className="card-title">
        <h2>승인 대기</h2>
        <p>{canApprove ? '승인하면 바로 로그인할 수 있습니다' : `승인·반려는 ${roleOnlyHint('APPROVE')}`}</p>
      </div>
      {decide.isError && <Notice tone="error" title={errorMessage(decide.error)} />}
      <ul className="mismatch-list">
        {pending.map((user) => (
          <li key={user.id}>
            <div className="mismatch-top">
              <span className="mismatch-target mono">{user.username}</span>
              <span className="status status-running">{ADMIN_ROLE_LABEL[user.role]}</span>
            </div>
            <p className="mismatch-detail muted">
              {ADMIN_ROLE_DESCRIPTION[user.role]} · {user.requestedBy} 요청 · {formatDateTime(user.createdAt)}
            </p>
            {canApprove && (
              <div className="lock-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: user.id, approve: true })}
                  aria-label={`${user.username} 승인`}
                >
                  승인
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: user.id, approve: false })}
                  aria-label={`${user.username} 반려`}
                >
                  반려
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RequestAdminCard() {
  const queryClient = useQueryClient()
  const roleId = useId()
  const nameId = useId()
  const passwordId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminRole>('TELLER')

  const mutation = useMutation({
    mutationFn: () => requestAdminUser(username, password, role),
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
        <h2>관리자 등록 요청</h2>
        <p>책임자가 승인하면 같은 로그인 화면에서 로그인합니다</p>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label id={roleId}>역할</label>
          <div className="segmented" role="radiogroup" aria-labelledby={roleId}>
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                aria-selected={role === r}
                onClick={() => {
                  setRole(r)
                  mutation.reset()
                }}
              >
                {ADMIN_ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="hint left">{ADMIN_ROLE_DESCRIPTION[role]}</p>
        </div>
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
          {mutation.isPending ? '요청 중' : '등록 요청'}
        </button>
      </form>
      {mutation.isSuccess && (
        <Notice tone="success" title={`${mutation.data.username} (${ADMIN_ROLE_LABEL[mutation.data.role]}) 등록을 요청했습니다.`}>
          책임자가 승인하기 전까지는 로그인할 수 없습니다.
        </Notice>
      )}
      {mutation.isError && <Notice tone="error" title={errorMessage(mutation.error)} />}
    </section>
  )
}
