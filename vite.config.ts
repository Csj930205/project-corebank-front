import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 개발 서버(5173)가 /api 로 시작하는 요청을 코어뱅킹 서버(8080)로 넘긴다.
// 브라우저 입장에서는 같은 출처(5173)로 보내는 요청이라 CORS 설정이 필요 없다.
// 예: 브라우저 /api/accounts/1  →  코어 http://localhost:8080/accounts/1
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.COREBANK_API_URL ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
