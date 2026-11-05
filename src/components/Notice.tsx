import type { ReactNode } from 'react'

interface Props {
  tone: 'success' | 'error' | 'info'
  title: string
  children?: ReactNode
}

const ICON = { success: '✓', error: '!', info: 'i' } as const

/** 요청 결과 안내. 화면 낭독기가 바로 읽도록 role 을 준다. */
export function Notice({ tone, title, children }: Props) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon" aria-hidden>
        {ICON[tone]}
      </span>
      <strong>{title}</strong>
      {children && <div className="notice-body">{children}</div>}
    </div>
  )
}
