import { useQuery } from '@tanstack/react-query'
import { getProducts } from '../api/corebank'
import type { ProductType } from '../api/types'

/** ProductSelect 에서 고른 상품(없으면 그 종류의 첫 상품). 폼이 기간·금리 안내와 요청에 쓴다 */
export function useSelectedProduct(value: number | undefined, type: ProductType) {
  const products = useQuery({ queryKey: ['products'], queryFn: ({ signal }) => getProducts(signal) })
  const list = (products.data ?? []).filter((product) => product.type === type)
  return list.find((product) => product.id === value) ?? list[0]
}
