// 화면에 쓰는 작은 아이콘. 외부 아이콘 패키지 없이 SVG 로 직접 그린다. 색은 글자색(currentColor)을 따른다.

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** 들어온 돈 */
export function ArrowIn() {
  return (
    <svg {...base}>
      <path d="M17 7 7 17M7 9v8h8" />
    </svg>
  )
}

/** 나간 돈 */
export function ArrowOut() {
  return (
    <svg {...base}>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}

/** 이체 */
export function Swap() {
  return (
    <svg {...base}>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  )
}

export function BrandMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M3 10 12 4l9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Chevron() {
  return (
    <svg {...base} width={16} height={16}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
