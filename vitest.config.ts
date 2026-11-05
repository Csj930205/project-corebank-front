import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 테스트 설정. 브라우저 대신 jsdom 으로 화면을 그려 컴포넌트를 검증한다. 실제 서버는 띄우지 않고 fetch 를 가짜로 바꾼다.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
