import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // The cloudflare plugin serves the client AND the worker on a single origin in
  // dev. That is what makes SPEC-002 FR-001's "one command, no further
  // configuration" true, and why there is no sync-URL env var: the client builds
  // its socket URI from window.location.origin.
  plugins: [react(), cloudflare()],
  resolve: {
    // Twin of tsconfig.app.json's `paths`. Both are committed together; if one
    // moves without the other, imports resolve at type-check time and fail at
    // runtime (or the reverse).
    alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) },
  },
})
