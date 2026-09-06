import base from './playwright.config'

/**
 * The corpus capture harness only. See `e2e/tools/capture-strokes.spec.ts` --
 * it WRITES fixtures rather than asserting on the app, so the normal config
 * ignores `**\/tools\/**` and this config exists to run it deliberately:
 *
 *   npx playwright test --config=playwright.capture.ts
 */
export default { ...base, testIgnore: [], testMatch: '**/tools/**' }
