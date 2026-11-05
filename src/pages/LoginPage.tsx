import { useMutation } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { login } from '../api/auth'
import { Notice } from '../components/Notice'
import { useSession } from '../hooks/useSession'
import { errorMessage } from '../lib/errors'
import { landingAfterLogin } from '../lib/landing'
import { saveToken } from '../lib/saveToken'

/**
 * 로그인. 관리자와 고객이 같은 화면을 쓴다. 서버가 아이디를 보고 관리자 토큰 또는 고객 토큰을 주고,
 * 화면은 토큰의 역할에 따라 관리자 화면 또는 내 계좌로 보낸다.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const session = useSession()
  const userId = useId()
  const passwordId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  // 로그인 전에 보려던 화면
  const from = (location.state as { from?: string } | null)?.from

  const mutation = useMutation({
    mutationFn: () => login(username.trim(), password),
    onSuccess: (token) => {
      saveToken(token)
      navigate(landingAfterLogin(token.role, from), { replace: true })
    },
    // 실패하면 비밀번호 칸만 비운다. 아이디는 다시 치지 않아도 되게 둔다.
    onError: () => setPassword(''),
  })

  if (session && !mutation.isPending) {
    return <Navigate to={landingAfterLogin(session.role, from)} replace />
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!mutation.isPending && username.trim() && password) {
      mutation.mutate()
    }
  }

  return (
    <div className="login-wrap">
      <section className="card login-card">
        <div className="login-head">
          <h1>로그인</h1>
          <p>아이디와 비밀번호를 입력하세요.</p>
        </div>
        <form onSubmit={onSubmit} className="form">
          <div className="field">
            <label htmlFor={userId}>아이디</label>
            <input
              id={userId}
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={50}
              required
            />
          </div>
          <div className="field">
            <label htmlFor={passwordId}>비밀번호</label>
            <input
              id={passwordId}
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              maxLength={200}
              required
            />
          </div>
          <button type="submit" className="btn block" disabled={mutation.isPending || !username.trim() || !password}>
            {mutation.isPending && <span className="spinner" aria-hidden />}
            {mutation.isPending ? '로그인 중' : '로그인'}
          </button>
        </form>
        {mutation.isError && <Notice tone="error" title={errorMessage(mutation.error)} />}
        <p className="login-foot">
          처음이신가요? <Link to="/signup">회원가입</Link>
          <br />
          로그인은 30분 동안 유지되고, 탭을 닫으면 끝납니다.
        </p>
      </section>
    </div>
  )
}
