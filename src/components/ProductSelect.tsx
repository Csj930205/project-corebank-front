import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { getProducts } from '../api/corebank'
import type { ProductType } from '../api/types'
import { formatRate } from '../lib/interest'
import { formatTerm } from '../lib/timeDeposit'

/**
 * 예금 상품 고르기(판매 중인 것만). type 으로 입출금(계좌 개설)과 정기예금(정기예금 가입) 상품을 나눈다.
 * 입출금은 고르지 않으면 서버 기본 상품이라, 상품을 못 불러와도 개설은 된다. 값이 없으면 목록의 첫 상품(id 순)을 보여 준다.
 */
export function ProductSelect({
  value,
  onChange,
  type = 'DEMAND',
}: {
  value: number | undefined
  onChange: (id: number) => void
  type?: ProductType
}) {
  const id = useId()
  // 두 종류가 같은 응답에 섞여 오므로 queryKey 는 하나로 두고(캐시 공유) 화면에서 거른다.
  const products = useQuery({ queryKey: ['products'], queryFn: ({ signal }) => getProducts(signal) })
  const list = (products.data ?? []).filter((product) => product.type === type)

  return (
    <div className="field">
      <label htmlFor={id}>{type === 'TIME' ? '정기예금 상품' : '예금 상품'}</label>
      <select
        id={id}
        className="input"
        value={value ?? list[0]?.id ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={list.length === 0}
      >
        {list.length === 0 && <option value="">{type === 'TIME' ? '판매 중인 정기예금이 없습니다' : '기본 입출금 통장'}</option>}
        {list.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name} · {product.termMonths !== null && `${formatTerm(product.termMonths)} · `}
            {formatRate(product.annualRate)}
          </option>
        ))}
      </select>
    </div>
  )
}
