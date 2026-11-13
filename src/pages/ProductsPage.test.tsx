import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession } from '../lib/session'
import { loginAdmin } from '../test/loginAdmin'
import type { DepositProduct } from '../api/types'
import { ProductsPage } from './ProductsPage'

const BASIC: DepositProduct = {
  id: 1,
  name: '기본 입출금 통장',
  type: 'DEMAND',
  annualRate: 0.1,
  termMonths: null,
  status: 'ACTIVE',
  createdAt: '2026-11-12T10:00:00',
  discontinuedAt: null,
}
const SAVINGS: DepositProduct = { ...BASIC, id: 2, name: '자유적립 예금', annualRate: 3.65 }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function fakeServer() {
  let products = [BASIC, SAVINGS]
  return vi.fn((url: string, init: RequestInit) => {
    if (init.method === 'POST' && url.includes('/discontinuation')) {
      products = products.map((p) => (p.id === 2 ? { ...p, status: 'DISCONTINUED' as const, discontinuedAt: 'x' } : p))
      return Promise.resolve(json(products[1]))
    }
    if (init.method === 'POST' && url.includes('/rate-changes')) {
      const { annualRate } = JSON.parse(init.body as string) as { annualRate: number }
      return Promise.resolve(json({ ...BASIC, annualRate }))
    }
    if (init.method === 'POST' && url.endsWith('/admin/time-deposits/maturities')) {
      return Promise.resolve(json({ businessDate: '2026-11-13', matured: 2, failed: 0 }))
    }
    if (init.method === 'POST' && url.endsWith('/admin/products')) {
      return Promise.resolve(json({ ...SAVINGS, id: 3, name: '새 상품' }, 201))
    }
    if (url.includes('/rates')) {
      return Promise.resolve(json({ productId: 1, content: [] }))
    }
    if (url.includes('/admin/time-deposits')) {
      return Promise.resolve(json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }))
    }
    if (url.includes('/admin/interest/payments')) {
      return Promise.resolve(json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }))
    }
    return Promise.resolve(json({ content: products }))
  })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('상품·이자 화면', () => {
  // 실행·변경 버튼은 운영 역할에게만 보인다.
  beforeEach(() => loginAdmin('OPERATOR'))
  afterEach(() => clearSession())

  it('상품과 금리를 보여 주고, 기본 상품에는 판매 중지 버튼이 없다', async () => {
    vi.stubGlobal('fetch', fakeServer())
    renderPage()

    expect(await screen.findByText('연 3.65%')).toBeInTheDocument()
    expect(screen.getByText('연 0.10%')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기본 입출금 통장 판매 중지' })).not.toBeInTheDocument()
  })

  it('운영 역할이 아니면 목록만 보이고 등록·판매 중지·이자 실행은 없다', async () => {
    loginAdmin('TELLER')
    vi.stubGlobal('fetch', fakeServer())
    renderPage()

    expect(await screen.findByText('연 3.65%')).toBeInTheDocument()
    expect(screen.getByText(/운영 역할만 할 수 있습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '자유적립 예금 판매 중지' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('상품 이름')).not.toBeInTheDocument()
  })

  it('판매 중지는 두 번 눌러야 요청한다', async () => {
    const fetchMock = fakeServer()
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '자유적립 예금 판매 중지' }))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/discontinuation'))).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: '중지 확정' }))

    expect(await screen.findByText('판매 중지')).toBeInTheDocument()
  })

  it('금리가 규칙에 맞아야 등록할 수 있다', async () => {
    const fetchMock = fakeServer()
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await userEvent.type(screen.getByLabelText('상품 이름'), '새 상품')
    await userEvent.type(screen.getByLabelText('연이율(%)'), '1.234')
    expect(screen.getByRole('button', { name: '상품 등록' })).toBeDisabled()
    expect(screen.getByText('0~20 사이, 소수 둘째 자리까지 입력하세요.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('연이율(%)'))
    await userEvent.type(screen.getByLabelText('연이율(%)'), '2.5')
    await userEvent.click(screen.getByRole('button', { name: '상품 등록' }))

    expect(await screen.findByText('새 상품 상품을 등록했습니다.')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([url, init]) => init.method === 'POST' && String(url).endsWith('/admin/products'))
    expect(JSON.parse(post![1].body as string)).toEqual({ name: '새 상품', annualRate: 2.5 })
  })

  it('정기예금 상품은 종류와 가입 기간을 함께 보낸다', async () => {
    const fetchMock = fakeServer()
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await userEvent.type(screen.getByLabelText('상품 이름'), '1년 정기예금')
    await userEvent.selectOptions(screen.getByLabelText('종류'), 'TIME')
    await userEvent.type(screen.getByLabelText('연이율(%)'), '3.5')
    await userEvent.clear(screen.getByLabelText('가입 기간(개월)'))
    await userEvent.type(screen.getByLabelText('가입 기간(개월)'), '61')
    expect(screen.getByRole('button', { name: '상품 등록' })).toBeDisabled()

    await userEvent.clear(screen.getByLabelText('가입 기간(개월)'))
    await userEvent.type(screen.getByLabelText('가입 기간(개월)'), '12')
    await userEvent.click(screen.getByRole('button', { name: '상품 등록' }))

    await screen.findByText(/상품을 등록했습니다/)
    const post = fetchMock.mock.calls.find(([url, init]) => init.method === 'POST' && String(url).endsWith('/admin/products'))
    expect(JSON.parse(post![1].body as string)).toEqual({
      name: '1년 정기예금',
      type: 'TIME',
      annualRate: 3.5,
      termMonths: 12,
    })
  })

  it('금리 변경은 고른 상품에 새 금리를 보낸다', async () => {
    const fetchMock = fakeServer()
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await screen.findByText('연 3.65%')
    await userEvent.type(screen.getByLabelText('새 연이율(%)'), '0.25')
    await userEvent.click(screen.getByRole('button', { name: '금리 변경' }))

    expect(await screen.findByText('기본 입출금 통장 금리를 연 0.25%로 바꿨습니다.')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([url]) => String(url).includes('/rate-changes'))
    expect(String(post![0])).toContain('/admin/products/1/rate-changes')
    expect(JSON.parse(post![1].body as string)).toEqual({ annualRate: 0.25 })
  })

  it('운영 역할은 오늘 만기 처리를 실행한다', async () => {
    vi.stubGlobal('fetch', fakeServer())
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '오늘 만기 처리' }))
    expect(await screen.findByText('2026-11-13 만기 처리: 2건 지급')).toBeInTheDocument()
  })
})
