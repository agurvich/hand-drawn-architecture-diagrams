import { defineConfig, devices } from '@playwright/test'

/**
 * Chromium with an emulated iPad viewport — deliberately NOT devices['iPad …'],
 * whose defaultBrowserType is webkit. The touch specs drive raw CDP
 * (Input.dispatchTouchEvent / dispatchMouseEvent with pointerType 'pen'), and
 * newCDPSession is Chromium-only.
 */
/*
 * The dev server's port, overridable.
 *
 * Several agent sessions share this repo through separate worktrees, and
 * `reuseExistingServer` cannot tell one worktree's dev server from another's --
 * so a second session's run silently tests the FIRST session's build, passes or
 * fails on code it never wrote, and leaves no trace saying so. One `E2E_PORT`
 * per session is the whole fix.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173)
const ORIGIN = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // The corpus capture harness is a TOOL, not a test: it writes fixture files
  // and is run deliberately. Left in the suite it would rewrite the corpus on
  // every run, so the recogniser would be tuned against whatever it does now.
  testIgnore: '**/tools/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'list' : 'line',
  use: { baseURL: ORIGIN, trace: 'on-first-retry' },
  projects: [
    {
      name: 'ipad-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        isMobile: false, // isMobile+CDP touch conflicts in Chromium; hasTouch is what the specs need
        deviceScaleFactor: 2,
      },
    },
    {
      /*
       * PORTRAIT, the way the device is actually held to sketch. Added because
       * finding F5 -- our Scenes bar covering tldraw's undo/redo/delete/duplicate
       * -- survived for months behind a suite that only ever measured landscape.
       */
      name: 'ipad-portrait',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        isMobile: false,
        deviceScaleFactor: 2,
      },
    },
  ],
  // `vite preview` serves the built client but NOT the worker, so sync would
  // have no server to talk to. The dev server runs client and worker on ONE
  // origin (the Cloudflare plugin), which is the same topology the app assumes
  // in production and the reason there is no sync-URL env var.
  webServer: {
    command: `npm run dev -- --port ${PORT} --host 127.0.0.1`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
