/**
 * The control clusters the properties dock must not cover.
 *
 * `querySelectorAll`, never `querySelector`. tldraw reuses `.tlui-toolbar` for
 * more than one thing and the FIRST match is a different element at different
 * sizes: at 1024 the top menu row, at 820 a row inside the style panel, and at
 * 820 with a shape selected the navigation panel. That is why the overlap tests
 * in this suite never saw finding F5.
 *
 * LAYOUT CONTAINERS ARE DELIBERATELY ABSENT. `.tlui-layout__top__right` spans
 * the full height of the right side while holding one 44px panel, and
 * `.tlui-main-toolbar` is x 0-viewport with `pointer-events: none`. Either would
 * report an overlap for anything down the right edge or along the bottom, and
 * there would be nowhere to dock. Only clusters that take a tap belong here.
 *
 * The EXPANDED `[data-testid="diagram-io"]` is absent for a different reason: it
 * is centred and 420px wide, so no right-edge dock can clear it, and the dock
 * simply does not render while it is open. It and its launcher are mutually
 * exclusive in the DOM anyway.
 */
export const CHROME_SELECTORS = [
  '.tlui-menu-zone',
  '.tlui-style-panel',
  '.tlui-toolbar',
  '.tlui-navigation-panel',
  '.tlui-main-toolbar__extras__controls',
  '.narration',
  '.sketch-toggle',
  '[data-testid="diagram-io-open"]',
] as const

/** Selectors that legitimately match nothing in landscape. */
export const PORTRAIT_ONLY: readonly string[] = ['.tlui-main-toolbar__extras__controls']
