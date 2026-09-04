import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/client/test/setup.ts'],
    // e2e/ is Playwright's; without this exclude, vitest tries to run those
    // files and fails on the missing Playwright test context.
    exclude: ['e2e/**', 'node_modules/**', '.wrangler/**'],
  },
})
