import base from './playwright.config'

/**
 * The corpus capture harness only. See `e2e/tools/capture-strokes.spec.ts` --
 * it WRITES fixtures rather than asserting on the app, so the normal config
 * ignores `**\/tools\/**` and this config exists to run it deliberately:
 *
 *   npx playwright test --config=playwright.capture.ts
 */
export default {
  ...base,
  testIgnore: [],
  testMatch: '**/tools/**',
  /*
   * ONE project, deliberately. `base.projects` gained a portrait entry, and
   * spreading it here would run the harness twice, concurrently
   * (`fullyParallel: true`), with both passes calling `writeFileSync` on the
   * same fixed fixture paths from two different viewports. Its gestures top out
   * at (540, 452), so BOTH passes succeed and the corpus is corrupted silently
   * rather than failing.
   */
  projects: base.projects!.filter((p) => p.name === 'ipad-chromium'),
}
