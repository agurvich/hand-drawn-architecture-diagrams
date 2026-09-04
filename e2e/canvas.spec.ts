import { test, expect, type Page } from '@playwright/test'

/** Shape count straight from the editor, not from the DOM. */
async function shapeCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__editor?.getCurrentPageShapes().length ?? -1)
}

async function canvasReady(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('canvas-host')).toBeVisible()
  await page.waitForFunction(() => !!window.__editor)
  await page.evaluate(() => window.__editor!.setCurrentTool('draw'))
}

test.describe('SPEC-001 FR-003 — touch and pen input', () => {
  test('a freehand stroke creates exactly one shape and does not scroll the page', async ({
    page,
  }) => {
    await canvasReady(page)
    expect(await shapeCount(page)).toBe(0)

    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      })

    await touch('touchStart', 300, 300)
    for (let i = 1; i <= 8; i++) await touch('touchMove', 300 + i * 20, 300 + i * 10)
    await touch('touchEnd', 460, 380)

    await expect.poll(() => shapeCount(page)).toBe(1)

    // The criterion that can actually fail: without touch-action/overscroll-behavior
    // the drag scrolls the page on iPad instead of drawing.
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({
      x: 0,
      y: 0,
    })
  })

  test('a pen pointerType stroke produces a shape', async ({ page }) => {
    await canvasReady(page)
    const cdp = await page.context().newCDPSession(page)
    const pen = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, y: number) =>
      cdp.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1,
        pointerType: 'pen',
        force: 0.6,
      })

    await pen('mousePressed', 250, 250)
    for (let i = 1; i <= 6; i++) await pen('mouseMoved', 250 + i * 25, 250 + i * 15)
    await pen('mouseReleased', 400, 340)

    await expect.poll(() => shapeCount(page)).toBe(1)
  })

  test('a two-finger gesture pans the canvas rather than creating a shape', async ({ page }) => {
    await canvasReady(page)
    const before = await page.evaluate(() => window.__editor!.getCamera())

    const cdp = await page.context().newCDPSession(page)
    const pts = (dx: number, dy: number) => [
      { x: 400 + dx, y: 300 + dy, id: 1 },
      { x: 500 + dx, y: 300 + dy, id: 2 },
    ]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0, 0) })
    for (let i = 1; i <= 6; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: pts(-i * 15, -i * 10),
      })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    expect(await shapeCount(page)).toBe(0)
    const after = await page.evaluate(() => window.__editor!.getCamera())
    expect({ x: after.x, y: after.y }).not.toEqual({ x: before.x, y: before.y })
  })
})

test.describe('SPEC-001 FR-002 — the client stores no document records', () => {
  /**
   * SUPERSEDED IN PART BY SPEC-002.
   *
   * SPEC-001 FR-002 required "reloading the page yields an empty canvas". That
   * was true of a single-player canvas and is deliberately FALSE now: SPEC-002
   * made the document live in a room, so a reload correctly restores it from the
   * Durable Object. Asserting emptiness here would assert against sync working.
   *
   * What survives from FR-002, and is still worth guarding: the CLIENT is not a
   * home for document state. No persistenceKey, no IndexedDB, and nothing in
   * localStorage but tldraw's own user preferences. That is the fence SPEC-001
   * actually cared about -- it exists so there is exactly one home for the
   * document -- and sync moved that home to the server rather than removing it.
   */
  test('no document records are stored client-side; the document lives in the room', async ({
    page,
  }) => {
    await canvasReady(page)
    await page.evaluate(() =>
      window.__editor!.createShape({ type: 'geo', x: 100, y: 100, props: { w: 120, h: 80 } }),
    )
    await expect.poll(() => shapeCount(page)).toBe(1)
    // Outlast the Durable Object's debounced persist before reloading, so this
    // asserts the steady state rather than a race. (A reload that beat the
    // debounce is why an earlier version of this test passed locally and failed
    // in CI.)
    await page.waitForTimeout(1500)

    const storage = await page.evaluate(async () => ({
      local: Object.keys(localStorage),
      idb: (await indexedDB.databases()).map((d) => d.name),
    }))
    // TLDRAW_USER_DATA_v3 is tldraw's own preferences (theme, tool defaults). The
    // SDK writes it regardless of persistenceKey, so forbidding it would make this
    // criterion false for a correct implementation. Document records are the target.
    expect(storage.local).toEqual(['TLDRAW_USER_DATA_v3'])
    expect(storage.idb).toEqual([])

    // And the document does survive -- from the server, not from the browser.
    await page.reload()
    await page.waitForFunction(() => !!window.__editor)
    await expect.poll(() => shapeCount(page), { timeout: 20_000 }).toBe(1)
  })
})

test('FR-001 — the app renders with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await canvasReady(page)
  expect(errors).toEqual([])
})
