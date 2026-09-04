import { test, expect, type Page } from '@playwright/test'
import {
  allBindings,
  dragEndpoint,
  openRoom,
  newParticipant,
  addNode,
  addConnection,
  setCollapsed,
  shapeGeometry,
  visibleConnections,
  connectionCount,
  roomId,
} from './helpers'

/** Every record id in the store, so absence is enumerated rather than counted. */
async function recordIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window
      .__editor!.store.allRecords()
      .filter((r) => r.typeName === 'shape' || r.typeName === 'binding')
      .map((r) => r.id as string)
      .sort(),
  )
}

async function countBadges(page: Page): Promise<string[]> {
  return page.locator('[data-testid="diagram-connection-count"]').allTextContents()
}

test.describe('SPEC-006 FR-001 — an endpoint resolves to the container standing in for it', () => {
  test('a crossing connection is drawn against the container, and expanding restores it', async ({
    page,
  }) => {
    await openRoom(page, roomId('mg1'))
    const y = await addNode(page, 'Y', { x: 80, y: 500, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 200, w: 400, h: 260 })
    const x = await addNode(page, 'X', { x: 40, y: 60, w: 160, h: 90, parentId: p })
    const conn = await addConnection(page, x, y)

    expect(await visibleConnections(page)).toEqual([{ id: conn, start: x, end: y, count: 1 }])
    const expanded = await shapeGeometry(page, conn)

    await setCollapsed(page, p, true)
    expect(await visibleConnections(page)).toEqual([{ id: conn, start: p, end: y, count: 1 }])
    expect(await shapeGeometry(page, conn)).not.toBe(expanded)

    await setCollapsed(page, p, false)
    expect(await visibleConnections(page)).toEqual([{ id: conn, start: x, end: y, count: 1 }])
    expect(await shapeGeometry(page, conn)).toBe(expanded)
  })

  test('the connections own props never change, however far the line moves', async ({ page }) => {
    // SPEC-005's fence, re-asserted through resolution: a future change that
    // starts caching anchors fails here.
    await openRoom(page, roomId('mg2'))
    const y = await addNode(page, 'Y', { x: 80, y: 500 })
    const p = await addNode(page, 'P', { x: 600, y: 200, w: 400, h: 260 })
    const x = await addNode(page, 'X', { x: 40, y: 60, w: 160, h: 90, parentId: p })
    const conn = await addConnection(page, x, y)

    const props = () =>
      page.evaluate((id) => JSON.stringify(window.__editor!.getShape(id as never)!.props), conn)
    const before = await props()
    await setCollapsed(page, p, true)
    expect(await props()).toBe(before)
  })

  test('resolves to the OUTERMOST collapsed ancestor, not the nearest', async ({ page }) => {
    // Resolving to the nearest (q) draws a line to a shape that is itself
    // hidden. Every other criterion in this file passes either way.
    await openRoom(page, roomId('mg3'))
    const y = await addNode(page, 'Y', { x: 80, y: 600, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 500, y: 120, w: 460, h: 340 })
    const q = await addNode(page, 'Q', { x: 40, y: 60, w: 320, h: 220, parentId: p })
    const x = await addNode(page, 'X', { x: 30, y: 50, w: 140, h: 80, parentId: q })
    const conn = await addConnection(page, x, y)

    await setCollapsed(page, q, true)
    await setCollapsed(page, p, true)
    expect(await visibleConnections(page)).toEqual([{ id: conn, start: p, end: y, count: 1 }])
  })

  test('both endpoints hidden by DIFFERENT containers gives one line between them', async ({
    page,
  }) => {
    await openRoom(page, roomId('mg4'))
    const p = await addNode(page, 'P', { x: 120, y: 120, w: 360, h: 240 })
    const x = await addNode(page, 'X', { x: 30, y: 50, w: 140, h: 80, parentId: p })
    const r = await addNode(page, 'R', { x: 700, y: 500, w: 360, h: 240 })
    const z = await addNode(page, 'Z', { x: 30, y: 50, w: 140, h: 80, parentId: r })
    const conn = await addConnection(page, x, z)

    await setCollapsed(page, p, true)
    await setCollapsed(page, r, true)
    expect(await visibleConnections(page)).toEqual([{ id: conn, start: p, end: r, count: 1 }])
  })

  test('moving a COLLAPSED container re-routes the lines resolved onto it', async ({ page }) => {
    // The place resolution could lose SPEC-005's guarantee: if the index cached
    // anchors instead of ids, this is the assertion that fails.
    await openRoom(page, roomId('mg5'))
    const y = await addNode(page, 'Y', { x: 80, y: 600, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 200, w: 400, h: 260 })
    const x = await addNode(page, 'X', { x: 40, y: 60, w: 160, h: 90, parentId: p })
    const conn = await addConnection(page, x, y)

    await setCollapsed(page, p, true)
    const before = await shapeGeometry(page, conn)
    await page.evaluate((id) => {
      window.__editor!.updateShape({ id: id as never, type: 'diagramNode', x: 200, y: 900 })
    }, p)
    expect(await shapeGeometry(page, conn)).not.toBe(before)
  })

  test('a connection with no endpoint hidden by collapse is drawn exactly as before', async ({
    page,
  }) => {
    await openRoom(page, roomId('mg6'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 400 })
    const p = await addNode(page, 'P', { x: 100, y: 700, w: 300, h: 200 })
    await addNode(page, 'Inner', { x: 20, y: 20, w: 120, h: 80, parentId: p })
    const conn = await addConnection(page, a, b)

    const before = await shapeGeometry(page, conn)
    await setCollapsed(page, p, true)
    expect(await shapeGeometry(page, conn)).toBe(before)
    expect(await visibleConnections(page)).toEqual([{ id: conn, start: a, end: b, count: 1 }])
  })
})

test.describe('SPEC-006 FR-002 — a connection internal to a collapsed container disappears', () => {
  test('both endpoints inside the container: hidden, and restored on expand', async ({ page }) => {
    await openRoom(page, roomId('mi1'))
    const p = await addNode(page, 'P', { x: 300, y: 200, w: 500, h: 340 })
    const x = await addNode(page, 'X', { x: 30, y: 40, w: 140, h: 80, parentId: p })
    const y = await addNode(page, 'Y', { x: 260, y: 200, w: 140, h: 80, parentId: p })
    const conn = await addConnection(page, x, y)

    await setCollapsed(page, p, true)
    expect(await visibleConnections(page)).toEqual([])
    await setCollapsed(page, p, false)
    expect(await visibleConnections(page)).toEqual([{ id: conn, start: x, end: y, count: 1 }])
  })

  test('a node to its own EXPANDED ancestor stays visible', async ({ page }) => {
    // The predecessor skipped this for want of an anchor; SPEC-005 built one, so
    // the skip is not ported.
    await openRoom(page, roomId('mi2'))
    const p = await addNode(page, 'P', { x: 300, y: 200, w: 500, h: 340 })
    const x = await addNode(page, 'X', { x: 30, y: 40, w: 140, h: 80, parentId: p })
    const conn = await addConnection(page, x, p)
    expect(await visibleConnections(page)).toEqual([{ id: conn, start: x, end: p, count: 1 }])
  })

  test('deleting an endpoint node while collapsed removes the connection entirely', async ({
    page,
  }) => {
    await openRoom(page, roomId('mi3'))
    const y = await addNode(page, 'Y', { x: 80, y: 600 })
    const p = await addNode(page, 'P', { x: 600, y: 200, w: 400, h: 260 })
    const x = await addNode(page, 'X', { x: 40, y: 60, w: 160, h: 90, parentId: p })
    await addConnection(page, x, y)

    await setCollapsed(page, p, true)
    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, y)

    expect(await connectionCount(page)).toBe(0)
    expect(await visibleConnections(page)).toEqual([])
  })
})

test.describe('SPEC-006 FR-003 — connections that become the same relationship merge', () => {
  async function threeIntoOne(page: Page) {
    const y = await addNode(page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 400 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const c2 = await addNode(page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: p })
    const c3 = await addNode(page, 'C3', { x: 30, y: 260, w: 140, h: 70, parentId: p })
    const conns = [
      await addConnection(page, c1, y),
      await addConnection(page, c2, y),
      await addConnection(page, c3, y),
    ]
    return { y, p, children: [c1, c2, c3], conns }
  }

  test('three become one line carrying a count of 3, and expanding restores all three', async ({
    page,
  }) => {
    await openRoom(page, roomId('mm1'))
    const { y, p, children, conns } = await threeIntoOne(page)

    await setCollapsed(page, p, true)
    const merged = await visibleConnections(page)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ start: p, end: y, count: 3 })
    expect(conns).toContain(merged[0]!.id)
    // The representative is the smallest id, with no coordination anywhere.
    expect(merged[0]!.id).toBe([...conns].sort()[0])
    expect(await countBadges(page)).toEqual(['×3'])

    await setCollapsed(page, p, false)
    expect(await visibleConnections(page)).toEqual(
      [...conns]
        .sort()
        .map((id) => ({ id, start: children[conns.indexOf(id)]!, end: y, count: 1 })),
    )
    expect(await countBadges(page)).toEqual([])
  })

  test('a line standing for one connection shows NO count', async ({ page }) => {
    await openRoom(page, roomId('mm2'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 400 })
    await addConnection(page, a, b)
    expect(await countBadges(page)).toEqual([])
  })

  test('direction is part of the identity: opposite directions stay two lines', async ({
    page,
  }) => {
    // Asserted on the visible-connection SET, not on pixels: with parallel-line
    // offsetting out of scope the two lines are coincident on screen.
    await openRoom(page, roomId('mm3'))
    const y = await addNode(page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 300 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const c2 = await addNode(page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: p })
    const out = await addConnection(page, c1, y)
    const back = await addConnection(page, y, c2)

    await setCollapsed(page, p, true)
    const visible = await visibleConnections(page)
    expect(visible).toHaveLength(2)
    expect(visible.find((v) => v.id === out)).toEqual({ id: out, start: p, end: y, count: 1 })
    expect(visible.find((v) => v.id === back)).toEqual({ id: back, start: y, end: p, count: 1 })
  })

  test('two connections between two VISIBLE nodes do not merge', async ({ page }) => {
    // Merging is a consequence of collapse. Without the gate, an expanded diagram
    // would lose a line and grow a count badge.
    await openRoom(page, roomId('mm4'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 400 })
    const c1 = await addConnection(page, a, b)
    const c2 = await addConnection(page, a, b)

    const visible = await visibleConnections(page)
    expect(visible.map((v) => v.id).sort()).toEqual([c1, c2].sort())
    expect(visible.every((v) => v.count === 1)).toBe(true)
    expect(await countBadges(page)).toEqual([])
  })

  test('the mixed case: a resolved member pulls a hand-drawn duplicate into the merge', async ({
    page,
  }) => {
    await openRoom(page, roomId('mm5'))
    const y = await addNode(page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 300 })
    const x = await addNode(page, 'X', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const crossing = await addConnection(page, x, y)
    const drawn = await addConnection(page, p, y)

    await setCollapsed(page, p, true)
    const merged = await visibleConnections(page)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ start: p, end: y, count: 2 })

    await setCollapsed(page, p, false)
    const restored = await visibleConnections(page)
    expect(restored).toHaveLength(2)
    expect(restored.find((v) => v.id === crossing)).toMatchObject({ start: x, count: 1 })
    expect(restored.find((v) => v.id === drawn)).toMatchObject({ start: p, count: 1 })
  })
})

test.describe('SPEC-006 FR-004 — the merged view is derived, never materialized', () => {
  test('collapsing and expanding creates and deletes ZERO records', async ({ page }) => {
    await openRoom(page, roomId('md1'))
    const y = await addNode(page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 300 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const c2 = await addNode(page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: p })
    await addConnection(page, c1, y)
    await addConnection(page, c2, y)

    const before = await recordIds(page)
    await setCollapsed(page, p, true)
    expect(await recordIds(page)).toEqual(before)
    await setCollapsed(page, p, false)
    expect(await recordIds(page)).toEqual(before)
  })

  test('durable storage holds no shape type nobody drew, and no extra connections', async ({
    browser,
    request,
  }) => {
    const room = roomId('md2')
    const p1 = await newParticipant(browser)
    await openRoom(p1.page, room)
    const y = await addNode(p1.page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(p1.page, 'P', { x: 600, y: 120, w: 420, h: 300 })
    const c1 = await addNode(p1.page, 'C1', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const c2 = await addNode(p1.page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: p })
    await addConnection(p1.page, c1, y)
    await addConnection(p1.page, c2, y)
    await setCollapsed(p1.page, p, true)

    const snapshot = async () =>
      (await (await request.get(`/api/dev/snapshot/${room}`)).json()) as {
        shapeTypes?: Record<string, number>
      }
    await expect
      .poll(async () => (await snapshot()).shapeTypes?.diagramConnection, { timeout: 20_000 })
      .toBe(2)

    const stored = await snapshot()
    // The test's own constant, not a count of what a client rendered: this is
    // worker storage, and joining it to a client render would assert something
    // other than what it says.
    expect(stored.shapeTypes).toEqual({ diagramNode: 4, diagramConnection: 2 })

    await p1.ctx.close()
  })

  test('two clients derive the same representative from the collapse alone', async ({
    browser,
  }) => {
    const room = roomId('md3')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const y = await addNode(p1.page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const container = await addNode(p1.page, 'P', { x: 600, y: 120, w: 420, h: 400 })
    const c1 = await addNode(p1.page, 'C1', { x: 30, y: 40, w: 140, h: 70, parentId: container })
    const c2 = await addNode(p1.page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: container })
    const c3 = await addNode(p1.page, 'C3', { x: 30, y: 260, w: 140, h: 70, parentId: container })
    await addConnection(p1.page, c1, y)
    await addConnection(p1.page, c2, y)
    await addConnection(p1.page, c3, y)

    await expect.poll(() => connectionCount(p2.page), { timeout: 15_000 }).toBe(3)
    await setCollapsed(p1.page, container, true)

    await expect
      .poll(async () => (await visibleConnections(p2.page)).length, { timeout: 15_000 })
      .toBe(1)

    const [seenByOne] = await visibleConnections(p1.page)
    const [seenByTwo] = await visibleConnections(p2.page)
    // The same line, chosen by both without one telling the other which.
    expect(seenByTwo).toEqual(seenByOne)
    expect(seenByTwo).toMatchObject({ start: container, end: y, count: 3 })
    // On B's own DOM, not only through B's index.
    expect(
      await p2.page.locator('[data-testid="diagram-connection-count"]').allTextContents(),
    ).toEqual(['×3'])
    // And B added nothing locally to render it.
    expect(await recordIds(p2.page)).toEqual(await recordIds(p1.page))

    await p1.ctx.close()
    await p2.ctx.close()
  })
})

test.describe('SPEC-006 FR-006 — a merged line is not edited as one connection', () => {
  test('a merged line offers no endpoint handles; an unmerged one keeps them', async ({ page }) => {
    await openRoom(page, roomId('mh1'))
    const y = await addNode(page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 300 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const c2 = await addNode(page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: p })
    const a = await addConnection(page, c1, y)
    await addConnection(page, c2, y)

    const handleCount = (id: string) =>
      page.evaluate((cid) => window.__editor!.getShapeHandles(cid as never)?.length ?? 0, id)
    expect(await handleCount(a)).toBe(2)

    await setCollapsed(page, p, true)
    const [merged] = await visibleConnections(page)
    expect(merged!.count).toBe(2)
    expect(await handleCount(merged!.id)).toBe(0)
  })

  test('a single connection resolved onto a container keeps its handles AND can still be re-aimed', async ({
    page,
  }) => {
    // Both halves of the criterion. Asserting the handle count alone leaves a
    // silent refusal to re-aim a RESOLVED terminal undetectable -- a mutation
    // that otherwise survives the whole suite.
    await openRoom(page, roomId('mh2'))
    const y = await addNode(page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 300 })
    const x = await addNode(page, 'X', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const c = await addNode(page, 'C', { x: 100, y: 100, w: 160, h: 100 })
    const conn = await addConnection(page, x, y)

    await setCollapsed(page, p, true)
    expect(
      await page.evaluate(
        (cid) => window.__editor!.getShapeHandles(cid as never)?.length ?? 0,
        conn,
      ),
    ).toBe(2)

    // The start terminal is DRAWN against P but BOUND to X. Re-aiming it must
    // move the binding, not be refused for being resolved.
    await dragEndpoint(page, conn, 'start', { x: 180, y: 150 })
    const bindings = await allBindings(page)
    expect(bindings).toHaveLength(2)
    expect(bindings.find((b) => b.toId === c)).toBeTruthy()
    expect(bindings.find((b) => b.toId === x)).toBeFalsy()
    expect(await visibleConnections(page)).toEqual([{ id: conn, start: c, end: y, count: 1 }])
  })

  test('deleting a merged line deletes exactly one connection, and the count does NOT just decrement', async ({
    page,
  }) => {
    // Two arrangements, because the derivation reruns rather than decrementing.
    await openRoom(page, roomId('mh3'))
    const z = await addNode(page, 'Z', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 300 })
    const x = await addNode(page, 'X', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const y = await addNode(page, 'Y', { x: 30, y: 150, w: 140, h: 70, parentId: p })
    await addConnection(page, x, z)
    await addConnection(page, y, z)

    await setCollapsed(page, p, true)
    const [merged] = await visibleConnections(page)
    expect(merged!.count).toBe(2)

    await page.evaluate((id) => {
      const ed = window.__editor!
      ed.markHistoryStoppingPoint()
      ed.deleteShapes([id as never])
    }, merged!.id)

    expect(await connectionCount(page)).toBe(1)
    const after = await visibleConnections(page)
    expect(after).toHaveLength(1)
    expect(after[0]!.count).toBe(1)
    expect(await countBadges(page)).toEqual([])

    // Undo restores the connection and the count.
    await page.evaluate(() => {
      window.__editor!.undo()
    })
    expect(await connectionCount(page)).toBe(2)
    expect((await visibleConnections(page))[0]!.count).toBe(2)
  })

  test('the gate flips back OFF when the only resolved member is deleted', async ({ page }) => {
    // Three lines merged as x3; deleting the resolved one leaves the group with
    // no resolved member at all, so the remainder return to two uncounted lines.
    // "The count drops by one" is the obvious wrong expectation here.
    await openRoom(page, roomId('mh4'))
    const y = await addNode(page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
    const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 300 })
    const x = await addNode(page, 'X', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const crossing = await addConnection(page, x, y)
    await addConnection(page, p, y)
    await addConnection(page, p, y)

    await setCollapsed(page, p, true)
    const [merged] = await visibleConnections(page)
    expect(merged).toMatchObject({ count: 3 })
    // The drawn line IS the resolved member here -- assert that rather than
    // assume it, or this deletes a hidden shape and tests nothing reachable.
    expect(merged!.id).toBe(crossing)

    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, merged!.id)

    const after = await visibleConnections(page)
    expect(after).toHaveLength(2)
    expect(after.every((v) => v.count === 1)).toBe(true)
    expect(await countBadges(page)).toEqual([])
  })
})
