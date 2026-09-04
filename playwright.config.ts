import { defineConfig, devices } from '@playwright/test'

/**
 * Chromium with an emulated iPad viewport — deliberately NOT devices['iPad …'],
 * whose defaultBrowserType is webkit. The touch specs drive raw CDP
 * (Input.dispatchTouchEvent / dispatchMouseEvent with pointerType 'pen'), and
 * newCDPSession is Chromium-only.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'list' : 'line',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry' },
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
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
