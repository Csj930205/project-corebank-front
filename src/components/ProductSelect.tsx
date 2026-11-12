import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { getProducts } from '../api/corebank'
import { formatRate } from '../lib/interest'

/**
 * 계좌를 열 때 고르는 예금 상품(판매 중인 것만). 고르지 않으면 서버 기본 상품이라, 상품을 못 불러와도 개설은 된다.
 * 값이 없으면 목록의 첫 상품(= 기본 상품, id 순)을 보여 준다.
 */
export function ProductSelect({ value, onChange }: { value: number | undefined; onChange: (id: number) => void }) {
  const id = useId()
  const products = useQuery({ queryKey: ['products'], queryFn: ({ signal }) => getProducts(signal) })
  const list = products.data ?? []

  return (
    <div className="field">
      <label htmlFor={id}>예금 상품</label>
      <select
        id={id}
        className="input"
        value={value ?? list[0]?.id ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={list.length === 0}
      >
        {list.length === 0 && <option value="">기본 입출금 통장</option>}
        {list.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name} · {formatRate(product.annualRate)}
          </option>
        ))}
      </select>
    </div>
  )
}
