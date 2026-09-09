import { test, expect, type Page } from '@playwright/test'
import {
  openRoom,
  newParticipant,
  addNode,
  addConnection,
  connectionKinds,
  openKindField,
  setCollapsed,
  setSketchMode,
  penStroke,
  dragEndpoint,
  roomId,
} from './helpers'

/**
 * SPEC-018 — the criteria that need a live browser.
 *
 * Everything here is here for a reason, not by preference. jsdom does not
 * resolve `currentColor` or a CSS custom property, nothing in this repo mounts a
 * `ShapeUtil`'s `component()` or a panel field under Testing Library, and undo,
 * sync and the merge index all want a real Editor. The pure halves -- the
 * strand geometry, the colour map, the merge union -- are unit-tested beside the
 * code they belong to.
 */

/** Write a connection's kinds directly, standing in for the panel. */
async function setKinds(page: Page, id: string, kinds: string[]) {
  await page.evaluate(
    ({ id, kinds }) => {
      window.__editor!.updateShape({
        id: id as never,
        type: 'diagramConnection',
        props: { kinds },
      })
    },
    { id, kinds },
  )
}

/** The strands actually drawn for a connection, with their resolved colours. */
async function strandColours(page: Page, id: string): Promise<string[]> {
  return page.evaluate((cid) => {
    const host = document.querySelector(`[data-shape-id="${cid}"]`)
    if (!host) throw new Error(`no element for ${cid}`)
    return [...host.querySelectorAll('[data-testid="diagram-connection-strand"]')].map(
      (line) => getComputedStyle(line).stroke,
    )
  }, id)
}

/** The arrowhead colour for each strand, resolved through its own marker. */
async function arrowheadColours(page: Page, id: string): Promise<string[]> {
  return page.evaluate((cid) => {
    const host = document.querySelector(`[data-shape-id="${cid}"]`)
    if (!host) throw new Error(`no element for ${cid}`)
    return [...host.querySelectorAll('[data-testid="diagram-connection-strand"]')].map((line) => {
      const ref = line.getAttribute('marker-end') ?? ''
      const markerId = ref.replace(/^url\(#/, '').replace(/\)$/, '')
      const marker = host.querySelector(`#${CSS.escape(markerId)}`)
      if (!marker) throw new Error(`no marker ${markerId}`)
      const path = marker.querySelector('path')
      if (!path) throw new Error(`marker ${markerId} has no path`)
      return getComputedStyle(path).fill
    })
  }, id)
}

test.describe('SPEC-018 FR-002 — the canvas draws every kind', () => {
  test('a line with NO kinds renders one strand, exactly as before', async ({ page }) => {
    // A NEW assertion, not "the old suite still passes": nothing in SPEC-005,
    // SPEC-011 or SPEC-015 asserts on the line element, its stroke or its
    // marker at all, so those specs staying green says nothing about the
    // stroke.
    await openRoom(page, roomId('ek-plain'))
    const a = await addNode(page, 'Web', { x: 100, y: 100 })
    const b = await addNode(page, 'DB', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)

    expect(await connectionKinds(page, conn)).toEqual([])
    expect(await strandColours(page, conn)).toHaveLength(1)
    await expect(page.locator(`[data-shape-id="${conn}"] > svg`)).not.toHaveAttribute('aria-label')
  })

  test('one strand per kind, each in its own colour', async ({ page }) => {
    await openRoom(page, roomId('ek-colours'))
    const a = await addNode(page, 'Bucket A', { x: 100, y: 100 })
    const b = await addNode(page, 'Bucket B', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)

    // The plain line first, so "not the default colour" is measured rather
    // than guessed at.
    const [plain] = await strandColours(page, conn)

    await setKinds(page, conn, ['data'])
    const one = await strandColours(page, conn)
    expect(one).toHaveLength(1)
    expect(one[0]).not.toBe(plain)

    await setKinds(page, conn, ['data', 'permission'])
    const two = await strandColours(page, conn)
    expect(two).toHaveLength(2)
    // DISTINCT from each other and from the default. Asserted on the COMPUTED
    // value, so a custom property that resolves to nothing fails here rather
    // than matching an attribute string that looks right.
    expect(new Set(two).size).toBe(2)
    for (const colour of two) {
      expect(colour).not.toBe(plain)
      expect(colour).toMatch(/^rgb/)
    }
  })

  test('each arrowhead is the colour of ITS OWN strand', async ({ page }) => {
    // The failure this catches: one shared `<marker>` with `fill="currentColor"`
    // draws coloured lines with default-coloured arrowheads, because a marker's
    // `currentColor` resolves against the marker's own inherited colour and not
    // against the line referencing it.
    await openRoom(page, roomId('ek-arrows'))
    const a = await addNode(page, 'Role', { x: 100, y: 100 })
    const b = await addNode(page, 'Transfer', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)
    await setKinds(page, conn, ['data', 'permission'])

    const strands = await strandColours(page, conn)
    const arrows = await arrowheadColours(page, conn)
    expect(arrows).toEqual(strands)
    expect(new Set(arrows).size).toBe(2)
  })

  test('the kinds are in the accessible name, not only in the colour', async ({ page }) => {
    await openRoom(page, roomId('ek-a11y'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)
    await setKinds(page, conn, ['data', 'sequence'])

    const label = await page.locator(`[data-shape-id="${conn}"] > svg`).getAttribute('aria-label')
    expect(label).toContain('data')
    expect(label).toContain('sequence')
  })

  test('hit-testing is unchanged: a three-kind line selects on its centre', async ({ page }) => {
    await openRoom(page, roomId('ek-hit'))
    const a = await addNode(page, 'A', { x: 100, y: 100, w: 120, h: 80 })
    const b = await addNode(page, 'B', { x: 600, y: 100, w: 120, h: 80 })
    const conn = await addConnection(page, a, b)
    await setKinds(page, conn, ['data', 'permission', 'sequence'])

    // The strands straddle the geometry, so the geometry is still what you hit.
    // Three strands offset off-centre would make the middle of the line a gap.
    const centre = await page.evaluate((cid) => {
      const bounds = window.__editor!.getShapePageBounds(cid as never)!
      const point = window.__editor!.pageToScreen({ x: bounds.center.x, y: bounds.center.y })
      return { x: point.x, y: point.y }
    }, conn)
    await page.mouse.click(centre.x, centre.y)
    const selected = await page.evaluate(() => window.__editor!.getSelectedShapeIds())
    expect(selected).toEqual([conn])
  })
})

test.describe('SPEC-018 FR-003 — setting kinds from the panel', () => {
  test('a toggle adds exactly one kind and disturbs no other', async ({ page }) => {
    await openRoom(page, roomId('ek-panel'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)
    await openKindField(page, conn)

    await page.getByTestId('kind-data').check()
    expect(await connectionKinds(page, conn)).toEqual(['data'])

    await page.getByTestId('kind-sequence').check()
    expect(await connectionKinds(page, conn)).toEqual(['data', 'sequence'])

    await page.getByTestId('kind-data').uncheck()
    expect(await connectionKinds(page, conn)).toEqual(['sequence'])
    await expect(page.getByTestId('kind-sequence')).toBeChecked()
  })

  test('one toggle is ONE undo step', async ({ page }) => {
    await openRoom(page, roomId('ek-undo'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)
    await openKindField(page, conn)

    await page.getByTestId('kind-data').check()
    await page.getByTestId('kind-permission').check()
    expect(await connectionKinds(page, conn)).toEqual(['data', 'permission'])

    // `undo()` RETURNS the Editor, which Playwright cannot serialise -- the
    // braces are what stop `page.evaluate` throwing on the way back.
    await page.evaluate(() => {
      window.__editor!.undo()
    })
    expect(await connectionKinds(page, conn)).toEqual(['data'])
    await page.evaluate(() => {
      window.__editor!.undo()
    })
    expect(await connectionKinds(page, conn)).toEqual([])
  })

  test('every control is keyboard-operable and named', async ({ page }) => {
    await openRoom(page, roomId('ek-keys'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)
    await openKindField(page, conn)

    const box = page.getByTestId('kind-permission')
    await box.focus()
    await page.keyboard.press('Space')
    expect(await connectionKinds(page, conn)).toEqual(['permission'])
    // Named by its own label, so a screen reader says which kind it is rather
    // than "checkbox".
    await expect(page.getByRole('checkbox', { name: 'Permission' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Carries' })).toBeVisible()
  })

  test('a MERGED line shows the union, read-only, and says why', async ({ page }) => {
    await openRoom(page, roomId('ek-merged'))
    const outer = await addNode(page, 'Account', { x: 100, y: 100, w: 400, h: 300 })
    const c1 = await addNode(page, 'Bucket 1', { x: 140, y: 140, w: 120, h: 80, parentId: outer })
    const c2 = await addNode(page, 'Bucket 2', { x: 140, y: 260, w: 120, h: 80, parentId: outer })
    const far = await addNode(page, 'Other', { x: 700, y: 200 })
    const k1 = await addConnection(page, c1, far)
    const k2 = await addConnection(page, c2, far)
    await setKinds(page, k1, ['data'])
    await setKinds(page, k2, ['permission'])

    await setCollapsed(page, outer, true)
    // The representative is the one you can hit-test; find whichever it is.
    const visible = await page.evaluate(
      ([a, b]) => (window.__editor!.isShapeHidden(a as never) ? b : a),
      [k1, k2],
    )
    await openKindField(page, visible)

    // EVERY kind its members name -- the SPEC-015 rule applied to a second
    // field. A merged line showing only the representative's would call a data
    // transfer a permission edge because the smallest id happened to be one.
    await expect(page.getByTestId('kind-data')).toBeChecked()
    await expect(page.getByTestId('kind-permission')).toBeChecked()
    await expect(page.getByTestId('kind-data')).toBeDisabled()
    await expect(page.getByTestId('kind-permission')).toBeDisabled()
    await expect(page.getByTestId('kind-field-merged')).toContainText('stands for 2 connections')

    // And EXPANDING gives each line its own kinds back, unmodified.
    await setCollapsed(page, outer, false)
    expect(await connectionKinds(page, k1)).toEqual(['data'])
    expect(await connectionKinds(page, k2)).toEqual(['permission'])
  })

  test('a kind set on one client reaches the other', async ({ page, browser }) => {
    const room = roomId('ek-sync')
    await openRoom(page, room)
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)

    const second = await newParticipant(browser)
    try {
      await openRoom(second.page, room)
      await second.page.waitForFunction((cid) => !!window.__editor!.getShape(cid as never), conn, {
        timeout: 15_000,
      })

      await openKindField(page, conn)
      await page.getByTestId('kind-data').check()

      await second.page.waitForFunction(
        (cid) =>
          (window.__editor!.getShape(cid as never)?.props as { kinds: string[] }).kinds.includes(
            'data',
          ),
        conn,
        { timeout: 15_000 },
      )
      expect(await connectionKinds(second.page, conn)).toEqual(['data'])
    } finally {
      await second.ctx.close()
    }
  })
})

test.describe('SPEC-018 FR-004 — the colour of the stroke', () => {
  const ACROSS: Array<[number, number]> = [
    [200, 200],
    [300, 200],
    [400, 200],
    [500, 200],
    [600, 200],
  ]

  test('an ORANGE stroke between two nodes becomes a data edge', async ({ page }) => {
    await openRoom(page, roomId('ek-orange'))
    await addNode(page, 'From', { x: 150, y: 150, w: 120, h: 100 })
    await addNode(page, 'To', { x: 570, y: 150, w: 120, h: 100 })
    await setSketchMode(page, true)

    await penStroke(page, ACROSS, 'orange')
    const conn = await page.evaluate(
      () =>
        window.__editor!.getCurrentPageShapes().find((s) => s.type === 'diagramConnection')
          ?.id as string,
    )
    expect(conn).toBeTruthy()
    expect(await connectionKinds(page, conn)).toEqual(['data'])
  })

  test('a BLACK stroke between the same two nodes carries no kind', async ({ page }) => {
    // The branch that is easiest to pass vacuously, and the one that keeps an
    // ordinary connection drawable: black is the default pen, so it records no
    // decision.
    await openRoom(page, roomId('ek-black'))
    await addNode(page, 'From', { x: 150, y: 150, w: 120, h: 100 })
    await addNode(page, 'To', { x: 570, y: 150, w: 120, h: 100 })
    await setSketchMode(page, true)

    await penStroke(page, ACROSS, 'black')
    const conn = await page.evaluate(
      () =>
        window.__editor!.getCurrentPageShapes().find((s) => s.type === 'diagramConnection')
          ?.id as string,
    )
    expect(conn).toBeTruthy()
    expect(await connectionKinds(page, conn)).toEqual([])
  })
})

test.describe('SPEC-018 FR-001 — re-aiming preserves the kinds', () => {
  test('dragging an endpoint to another node leaves kinds untouched', async ({ page }) => {
    // `onHandleDragEnd` updates a BINDING and creates no connection, so this is
    // a preservation criterion rather than a creation one -- and a preservation
    // criterion is exactly the kind that is assumed rather than checked.
    await openRoom(page, roomId('ek-reaim'))
    const a = await addNode(page, 'A', { x: 100, y: 400, w: 160, h: 100 })
    // The layout `connections.spec.ts` uses for this gesture, and for its
    // reason: the END handle anchors on B's border facing A, and SPEC-016's
    // dock covers the right of the canvas whenever one shape is selected. B
    // further right passes in landscape and misses in portrait.
    const b = await addNode(page, 'B', { x: 380, y: 400, w: 160, h: 100 })
    const c = await addNode(page, 'C', { x: 400, y: 80, w: 160, h: 100 })
    const conn = await addConnection(page, a, b)
    await setKinds(page, conn, ['data', 'sequence'])

    await dragEndpoint(page, conn, 'end', { x: 480, y: 130 })

    // The re-aim really happened, or the preservation below is vacuous.
    const endBinding = await page.evaluate(
      (cid) =>
        window
          .__editor!.getBindingsFromShape(cid as never, 'connectionEndpoint')
          .find((b) => (b.props as { terminal: string }).terminal === 'end')?.toId as string,
      conn,
    )
    expect(endBinding).toBe(c)
    expect(await connectionKinds(page, conn)).toEqual(['data', 'sequence'])
  })
})
