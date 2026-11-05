import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { AuditLogEntry } from '../api/types'
import { AuditLogsPage } from './AuditLogsPage'

const FAILED_TRANSFER: AuditLogEntry = {
  id: 9,
  occurredAt: '2026-11-05T14:00:00.000',
  requestId: '3f2a9c1e-0000-4000-8000-000000000009',
  actorType: 'CUSTOMER',
  actorUsername: 'kim',
  customerId: 3,
  action: 'TRANSFER',
  httpMethod: 'POST',
  path: '/transfers',
  statusCode: 422,
  outcome: 'FAILURE',
  errorCode: 'INSUFFICIENT_BALANCE',
  targetAccountId: 7,
  counterpartAccountId: 8,
  clientIp: '10.0.0.5',
  userAgent: 'Mozilla',
  durationMs: 12,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function page(content: AuditLogEntry[]) {
  return json({ content, page: 0, size: 50, totalElements: content.length, totalPages: content.length ? 1 : 0 })
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('감사 로그 화면', () => {
  it('누가, 무엇을, 어느 계좌에, 결과와 에러 코드까지 보여 준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page([FAILED_TRANSFER])))
    renderAt('/admin/audit-logs')

    expect(await screen.findByText('고객 · kim')).toBeInTheDocument()
    // '이체' 는 작업 고르기의 선택지에도 있어 표의 칸으로 좁힌다
    expect(screen.getByRole('cell', { name: '이체' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '7' })).toHaveAttribute('href', '/accounts/7')
    expect(screen.getByText('실패 422')).toBeInTheDocument()
    expect(screen.getByText('INSUFFICIENT_BALANCE')).toBeInTheDocument()
    expect(screen.getByText(/3f2a9c1e-0000-4000-8000-000000000009/)).toBeInTheDocument()
  })

  it('주소의 조건으로 조회하고, 입력란도 그 값으로 채운다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([]))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/admin/audit-logs?accountId=7&outcome=DENIED')

    expect(await screen.findByText('조건에 맞는 기록이 없습니다')).toBeInTheDocument()
    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://x')
    expect(url.pathname).toBe('/api/admin/audit-logs')
    expect(url.searchParams.get('accountId')).toBe('7')
    expect(url.searchParams.get('outcome')).toBe('DENIED')
    expect(screen.getByLabelText('계좌 id')).toHaveValue('7')
    expect(screen.getByLabelText('결과')).toHaveValue('DENIED')
  })

  it('검색하면 고른 조건으로 첫 쪽부터 다시 조회한다', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(page([])))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/admin/audit-logs?page=3')
    await screen.findByText('조건에 맞는 기록이 없습니다')

    await userEvent.type(screen.getByLabelText('아이디'), 'kim')
    await userEvent.selectOptions(screen.getByLabelText('작업'), 'LOGIN')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))

    await vi.waitFor(() => {
      const url = new URL(fetchMock.mock.calls.at(-1)![0] as string, 'http://x')
      expect(url.searchParams.get('actor')).toBe('kim')
      expect(url.searchParams.get('action')).toBe('LOGIN')
      expect(url.searchParams.get('page')).toBe('0')
    })
  })
})
