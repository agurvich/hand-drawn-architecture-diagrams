import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Twin of tsconfig.app.json's `paths`. Both are committed together; if one
    // moves without the other, imports resolve at type-check time and fail at
    // runtime (or the reverse).
    alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) },
  },
})
