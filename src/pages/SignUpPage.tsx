import { useMutation } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { signUp } from '../api/auth'
import { Notice } from '../components/Notice'
import { useSession } from '../hooks/useSession'
import { errorMessage } from '../lib/errors'
import { homeFor } from '../lib/landing'
import { saveToken } from '../lib/saveToken'

// 서버 규칙(AuthController.SignUpRequest)과 같다. 화면에서 먼저 알려 주고, 최종 확인은 서버가 한다.
const USERNAME_RULE = /^[a-z][a-z0-9_]{3,29}$/
const PASSWORD_MIN = 10

/** 고객 가입. 가입하면 바로 로그인되어 내 계좌로 간다. */
export function SignUpPage() {
  const navigate = useNavigate()
  const session = useSession()
  const nameId = useId()
  const userId = useId()
  const passwordId = useId()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => signUp(username, password, name.trim()),
    onSuccess: (token) => {
      saveToken(token)
      navigate('/my', { replace: true, state: { welcome: true } })
    },
  })

  if (session && !mutation.isPending) {
    return <Navigate to={homeFor(session.role)} replace />
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (mutation.isPending) return
    const error = !name.trim()
      ? '이름을 입력해 주세요.'
      : !USERNAME_RULE.test(username)
        ? '아이디는 영문 소문자로 시작하는 4~30자(영문 소문자, 숫자, _)입니다.'
        : password.length < PASSWORD_MIN
          ? `비밀번호는 ${PASSWORD_MIN}자 이상입니다.`
          : null
    setInputError(error)
    if (error === null) {
      mutation.mutate()
    } else {
      mutation.reset()
    }
  }

  return (
    <div className="login-wrap">
      <section className="card login-card">
        <div className="login-head">
          <h1>회원가입</h1>
          <p>가입하면 내 이름으로 계좌를 열 수 있습니다.</p>
        </div>
        <form onSubmit={onSubmit} className="form" noValidate>
          <div className="field">
            <label htmlFor={nameId}>이름</label>
            <input
              id={nameId}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
              placeholder="예금주 이름이 됩니다"
            />
          </div>
          <div className="field">
            <label htmlFor={userId}>아이디</label>
            <input
              id={userId}
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              maxLength={30}
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
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              maxLength={100}
              placeholder={`${PASSWORD_MIN}자 이상`}
            />
          </div>
          <button type="submit" className="btn block" disabled={mutation.isPending}>
            {mutation.isPending && <span className="spinner" aria-hidden />}
            {mutation.isPending ? '가입 중' : '가입하기'}
          </button>
        </form>
        {inputError && <Notice tone="error" title={inputError} />}
        {mutation.isError && <Notice tone="error" title={errorMessage(mutation.error)} />}
        <p className="login-foot">
          이미 계정이 있으면 <Link to="/login">로그인</Link>
        </p>
      </section>
    </div>
  )
}
