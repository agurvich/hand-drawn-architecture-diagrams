import { test, expect, type Page } from '@playwright/test'
import { openRoom, shapeCount, newParticipant, roomId } from './helpers'

const NODE = 'diagramNode'

async function addNode(page: Page, label: string, x = 150, y = 150) {
  await page.evaluate(
    ([lbl, px, py]) => {
      window.__editor!.createShape({
        type: 'diagramNode',
        x: px as number,
        y: py as number,
        props: { w: 220, h: 120, label: lbl as string, color: 'black' },
      })
    },
    [label, x, y] as const,
  )
}

async function nodeTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__editor!.getCurrentPageShapes().map((s) => s.type))
}

test.describe('SPEC-003 FR-005 — the custom shape crosses the room boundary', () => {
  test('a Node created in one client appears in another, with its label', async ({ browser }) => {
    const room = roomId('cshp')
    const a = await newParticipant(browser)
    const b = await newParticipant(browser)
    await openRoom(a.page, room)
    await openRoom(b.page, room)

    await addNode(a.page, 'Auth Service')
    await expect.poll(() => shapeCount(b.page), { timeout: 15_000 }).toBe(1)
    expect(await nodeTypes(b.page)).toEqual([NODE])
    expect(
      await b.page.evaluate(
        () => (window.__editor!.getCurrentPageShapes()[0].props as { label: string }).label,
      ),
    ).toBe('Auth Service')

    await a.ctx.close()
    await b.ctx.close()
  })

  test('a label edit propagates', async ({ browser }) => {
    const room = roomId('clbl')
    const a = await newParticipant(browser)
    const b = await newParticipant(browser)
    await openRoom(a.page, room)
    await openRoom(b.page, room)

    await addNode(a.page, 'before')
    await expect.poll(() => shapeCount(b.page), { timeout: 15_000 }).toBe(1)

    await a.page.evaluate(() => {
      const ed = window.__editor!
      const s = ed.getCurrentPageShapes()[0]
      ed.updateShape({ id: s.id, type: 'diagramNode', props: { label: 'after' } })
    })

    await expect
      .poll(
        () =>
          b.page.evaluate(
            () => (window.__editor!.getCurrentPageShapes()[0]?.props as { label: string })?.label,
          ),
        { timeout: 15_000 },
      )
      .toBe('after')

    await a.ctx.close()
    await b.ctx.close()
  })

  test('built-in shapes still sync alongside the custom one', async ({ browser }) => {
    // Guards the defaultShapeSchemas spread in src/worker/schema.ts: `shapes`
    // REPLACES the defaults, so omitting the spread makes every built-in an
    // unknown type at the room boundary while the custom shape keeps working.
    const room = roomId('cmix')
    const a = await newParticipant(browser)
    const b = await newParticipant(browser)
    await openRoom(a.page, room)
    await openRoom(b.page, room)

    await addNode(a.page, 'node')
    await a.page.evaluate(() => {
      // Block body on purpose: createShape returns the Editor (chainable), and
      // returning it makes page.evaluate fail trying to serialize it.
      window.__editor!.createShape({ type: 'geo', x: 400, y: 300, props: { w: 100, h: 80 } })
    })

    await expect.poll(() => shapeCount(b.page), { timeout: 15_000 }).toBe(2)
    expect((await nodeTypes(b.page)).sort()).toEqual(['diagramNode', 'geo'])

    await a.ctx.close()
    await b.ctx.close()
  })

  test('the custom shape reaches durable storage', async ({ browser, request }) => {
    const room = roomId('cdur')
    const p = await newParticipant(browser)
    await openRoom(p.page, room)

    const stored = async () =>
      (await (await request.get(`/api/dev/snapshot/${room}`)).json()) as {
        present: boolean
        documents: number
      }
    await expect.poll(async () => (await stored()).present, { timeout: 15_000 }).toBe(true)
    const baseline = (await stored()).documents

    await addNode(p.page, 'Persisted Node')
    await expect.poll(() => shapeCount(p.page)).toBe(1)
    await expect
      .poll(async () => (await stored()).documents, { timeout: 15_000 })
      .toBeGreaterThan(baseline)

    await p.ctx.close()
  })
})

test.describe('SPEC-003 FR-002 — the Node renders and is editable', () => {
  test('the toolbar entry creates a Node by dragging it out', async ({ page }) => {
    await openRoom(page, roomId('ctool'))
    await page.getByTestId(`tools.${NODE}`).click()
    await page.mouse.move(300, 250)
    await page.mouse.down()
    await page.mouse.move(520, 400, { steps: 8 })
    await page.mouse.up()

    await expect.poll(() => shapeCount(page)).toBe(1)
    expect(await nodeTypes(page)).toEqual([NODE])
    await expect(page.getByTestId('diagram-node')).toBeVisible()
  })

  test('a Node with an empty label renders, and can be given one afterwards', async ({ page }) => {
    await openRoom(page, roomId('cempt'))
    await page.evaluate(() => {
      window.__editor!.createShape({ type: 'diagramNode', x: 120, y: 120 })
    })
    await expect(page.getByTestId('diagram-node')).toBeVisible()
    expect(
      await page.evaluate(
        () => (window.__editor!.getCurrentPageShapes()[0].props as { label: string }).label,
      ),
    ).toBe('')

    await page.evaluate(() => {
      const ed = window.__editor!
      ed.updateShape({
        id: ed.getCurrentPageShapes()[0].id,
        type: 'diagramNode',
        props: { label: 'filled in' },
      })
    })
    await expect(page.getByTestId('diagram-node')).toContainText('filled in')
  })

  test('double-clicking enters label editing and the typed text lands in props', async ({
    page,
  }) => {
    // canEdit() defaults to FALSE on tldraw 5; without the override this does nothing.
    await openRoom(page, roomId('cedit'))
    await page.evaluate(() => {
      window.__editor!.createShape({
        type: 'diagramNode',
        x: 200,
        y: 200,
        props: { w: 240, h: 140, label: '', color: 'black' },
      })
    })
    await expect(page.getByTestId('diagram-node')).toBeVisible()

    await page.getByTestId('diagram-node').dblclick()
    const input = page.getByTestId('diagram-node-input')
    await expect(input).toBeVisible()
    await input.fill('Payments API')

    await expect
      .poll(() =>
        page.evaluate(
          () => (window.__editor!.getCurrentPageShapes()[0].props as { label: string }).label,
        ),
      )
      .toBe('Payments API')
  })

  test('a Node can be resized', async ({ page }) => {
    await openRoom(page, roomId('csize'))
    await page.evaluate(() => {
      window.__editor!.createShape({
        type: 'diagramNode',
        x: 200,
        y: 200,
        props: { w: 200, h: 120, color: 'black', label: 'r' },
      })
    })
    await expect.poll(() => shapeCount(page)).toBe(1)

    await page.evaluate(() => {
      const ed = window.__editor!
      const s = ed.getCurrentPageShapes()[0]
      ed.select(s.id)
      ed.resizeShape(s.id, { x: 1.5, y: 2 })
    })

    const size = await page.evaluate(() => {
      const p = window.__editor!.getCurrentPageShapes()[0].props as { w: number; h: number }
      return { w: p.w, h: p.h }
    })
    expect(size.w).toBeCloseTo(300, 0)
    expect(size.h).toBeCloseTo(240, 0)
  })
})

test.describe('SPEC-003 FR-003 — the worker validates at the room boundary', () => {
  test('a malformed record is rejected by the SERVER, surfaced as a sync error', async ({
    browser,
  }) => {
    const room = roomId('cinv')
    const victim = await newParticipant(browser)
    const attacker = await newParticipant(browser)

    // A bystander connected throughout, to prove a rejection does not wipe the room.
    await openRoom(victim.page, room)
    await victim.page.evaluate(() => {
      window.__editor!.createShape({ type: 'geo', x: 100, y: 100, props: { w: 80, h: 60 } })
    })
    await expect.poll(() => shapeCount(victim.page)).toBe(1)

    // Opt-in permissive client: without it the local store throws before the
    // socket is ever touched, and the worker never gets a chance to reject.
    await attacker.page.goto(`/${room}?unvalidated=1`)
    await attacker.page.waitForFunction(() => !!window.__editor, null, { timeout: 30_000 })
    await attacker.page.evaluate(() => {
      window.__editor!.createShape({
        type: 'diagramNode',
        x: 10,
        y: 10,
        props: { w: 'wide', h: 20, label: 'bad', color: 'black' },
      })
    })

    // The server closes the socket with a sync error reason, which Room.tsx
    // renders from store.error. Playwright cannot read a close code, so the
    // reason is asserted through the app's own error surface.
    await expect(attacker.page.getByTestId('room-error-sync')).toBeVisible({ timeout: 25_000 })
    await expect(attacker.page.getByTestId('room-error-sync')).toContainText(/INVALID_RECORD/i)

    // The bystander is untouched: a rejection removes the offending SESSION, it
    // does not reset the document.
    expect(await shapeCount(victim.page)).toBe(1)

    await victim.ctx.close()
    await attacker.ctx.close()
  })

  test('the dev-only unvalidated escape hatch is absent from a production build', async () => {
    // A gate nobody tests is not a gate. import.meta.env.DEV is compiled away in
    // a production build, so the marker string must not survive bundling.
    const { execSync } = await import('node:child_process')
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')

    execSync('npm run build', { stdio: 'pipe' })
    const assets = join(process.cwd(), 'dist/client/assets')
    const bundled = readdirSync(assets)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(assets, f), 'utf8'))
      .join('\n')

    expect(bundled.length).toBeGreaterThan(0)
    expect(bundled).not.toContain('HDAD_DEV_UNVALIDATED_CLIENT')
  })
})
