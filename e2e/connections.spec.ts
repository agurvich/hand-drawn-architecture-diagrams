import { test, expect, type Page } from '@playwright/test'
import {
  dragEndpoint,
  shapeGeometry as connGeometry,
  openRoom,
  newParticipant,
  addNode,
  addConnection,
  allBindings,
  connectionCount,
  setCollapsed,
  shapeCount,
  roomId,
} from './helpers'

/** FR-005's sweep: no binding may point at a shape that no longer exists. */
async function expectNoDanglingBindings(page: Page) {
  const dangling = await page.evaluate(() =>
    window
      .__editor!.store.allRecords()
      .filter((r) => r.typeName === 'binding')
      .filter((b) => !window.__editor!.getShape(b.fromId) || !window.__editor!.getShape(b.toId))
      .map((b) => b.id),
  )
  expect(dangling).toEqual([])
}

test.describe('SPEC-005 FR-002 — drawing a connection', () => {
  test('a connection is one shape and exactly two bindings, one per terminal', async ({ page }) => {
    await openRoom(page, roomId('cx1'))
    const a = await addNode(page, 'Web', { x: 100, y: 100 })
    const b = await addNode(page, 'DB', { x: 500, y: 350 })
    const conn = await addConnection(page, a, b)

    expect(await connectionCount(page)).toBe(1)
    const bindings = await allBindings(page)
    expect(bindings).toHaveLength(2)
    expect(bindings.every((x) => x.fromId === conn)).toBe(true)
    expect(bindings.map((x) => x.toId).sort()).toEqual([a, b].sort())
  })

  test('the line meets the nodes borders, not their centres', async ({ page }) => {
    await openRoom(page, roomId('cx2'))
    const a = await addNode(page, 'A', { x: 100, y: 100, w: 200, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 400, w: 200, h: 100 })
    const conn = await addConnection(page, a, b)

    const { start, centreA } = await page.evaluate(
      ({ conn, a }) => {
        const ed = window.__editor!
        const util = ed.getShapeUtil(ed.getShape(conn as never)!) as never as {
          getTerminalsInPageSpace(s: unknown): { start: { x: number; y: number } }
        }
        return {
          start: util.getTerminalsInPageSpace(ed.getShape(conn as never)).start,
          centreA: ed.getShapePageBounds(a as never)!.center.toJson(),
        }
      },
      { conn, a },
    )
    // The anchor is on A's border, so it is measurably away from A's centre.
    const dx = start.x - centreA.x
    const dy = start.y - centreA.y
    expect(Math.hypot(dx, dy)).toBeGreaterThan(40)
  })

  test('anchors are DERIVED, never written to props', async ({ page }) => {
    await openRoom(page, roomId('cx3'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 400 })
    const conn = await addConnection(page, a, b)
    await page.evaluate((id) => {
      window.__editor!.updateShape({ id: id as never, type: 'diagramNode', x: 900 })
    }, b)

    // Props stay at their defaults however far the endpoints travel. If a future
    // change starts storing anchors, this fails -- which is the point.
    const props = await page.evaluate((id) => window.__editor!.getShape(id as never)!.props, conn)
    expect(props).toEqual({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 } })
  })
})

test.describe('SPEC-005 FR-003 — connections follow their endpoints', () => {
  test('moving and resizing an endpoint re-routes the line', async ({ page }) => {
    await openRoom(page, roomId('cx4'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 400 })
    const conn = await addConnection(page, a, b)

    const g0 = await connGeometry(page, conn)
    await page.evaluate((id) => {
      window.__editor!.updateShape({ id: id as never, type: 'diagramNode', x: 800, y: 120 })
    }, b)
    const g1 = await connGeometry(page, conn)
    expect(g1).not.toBe(g0)

    await page.evaluate((id) => {
      const ed = window.__editor!
      ed.updateShape({ id: id as never, type: 'diagramNode', props: { w: 400, h: 260 } })
    }, b)
    expect(await connGeometry(page, conn)).not.toBe(g1)
  })

  test('moving a CONTAINER re-routes connections bound to its descendants', async ({ page }) => {
    // The criterion the binding hooks cannot satisfy: onAfterChangeToShape fires
    // for the bound shape's own record and its parentId, and moving a container
    // changes neither. Deriving geometry at render time is what makes this pass.
    await openRoom(page, roomId('cx5'))
    const outside = await addNode(page, 'Outside', { x: 80, y: 80 })
    const container = await addNode(page, 'Platform', { x: 500, y: 300, w: 420, h: 260 })
    const child = await addNode(page, 'Inner', { x: 40, y: 60, w: 160, h: 90, parentId: container })
    const conn = await addConnection(page, outside, child)

    const before = await connGeometry(page, conn)
    await page.evaluate((id) => {
      window.__editor!.updateShape({ id: id as never, type: 'diagramNode', x: 200, y: 700 })
    }, container)
    expect(await connGeometry(page, conn)).not.toBe(before)
  })

  test('SPEC-006 FR-001 — a connection crossing a collapse boundary is RE-DRAWN, not hidden', async ({
    page,
  }) => {
    // Superseded SPEC-005 FR-003's last criterion, which hid the connection as
    // the deliberate placeholder until merging existed. The arrangement is
    // unchanged so the case stays covered; the expected answer is the new one.
    await openRoom(page, roomId('cx6'))
    const outside = await addNode(page, 'Outside', { x: 80, y: 80 })
    const container = await addNode(page, 'Platform', { x: 500, y: 300, w: 420, h: 260 })
    const child = await addNode(page, 'Inner', { x: 40, y: 60, w: 160, h: 90, parentId: container })
    const conn = await addConnection(page, outside, child)

    const expanded = await connGeometry(page, conn)
    expect(await page.evaluate((id) => window.__editor!.isShapeHidden(id as never), conn)).toBe(
      false,
    )

    await setCollapsed(page, container, true)
    expect(await page.evaluate((id) => window.__editor!.isShapeHidden(id as never), conn)).toBe(
      false,
    )
    // Drawn against the CONTAINER now, so the geometry moved.
    const collapsed = await connGeometry(page, conn)
    expect(collapsed).not.toBe(expanded)

    await setCollapsed(page, container, false)
    expect(await page.evaluate((id) => window.__editor!.isShapeHidden(id as never), conn)).toBe(
      false,
    )
    expect(await connGeometry(page, conn)).toBe(expanded)
  })

  test('the connection stays parented to the page, not dragged into a container', async ({
    page,
  }) => {
    await openRoom(page, roomId('cx7'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const container = await addNode(page, 'C', { x: 500, y: 300, w: 400, h: 240 })
    const child = await addNode(page, 'Inner', { x: 40, y: 40, w: 150, h: 80, parentId: container })
    const conn = await addConnection(page, a, child)
    expect(
      await page.evaluate((id) => window.__editor!.getShape(id as never)!.parentId, conn),
    ).toMatch(/^page:/)
  })
})

test.describe('SPEC-005 FR-005 — lifecycle', () => {
  test('deleting a node deletes its connections, and leaves no dangling binding', async ({
    page,
  }) => {
    await openRoom(page, roomId('cx8'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 400 })
    await addConnection(page, a, b)
    expect(await connectionCount(page)).toBe(1)

    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, b)
    await expect.poll(() => connectionCount(page)).toBe(0)
    await expectNoDanglingBindings(page)
  })

  test('deleting a CONTAINER deletes connections bound to its descendants', async ({ page }) => {
    await openRoom(page, roomId('cx9'))
    const outside = await addNode(page, 'Outside', { x: 80, y: 80 })
    const container = await addNode(page, 'C', { x: 500, y: 300, w: 400, h: 240 })
    const child = await addNode(page, 'Inner', { x: 40, y: 40, w: 150, h: 80, parentId: container })
    await addConnection(page, outside, child)
    expect(await connectionCount(page)).toBe(1)

    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, container)
    await expect.poll(() => connectionCount(page)).toBe(0)
    await expectNoDanglingBindings(page)
  })

  test('deleting a connection leaves both nodes, and undo restores node AND connection', async ({
    page,
  }) => {
    await openRoom(page, roomId('cxa'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 400 })
    const conn = await addConnection(page, a, b)

    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, conn)
    expect(await connectionCount(page)).toBe(0)
    expect(await shapeCount(page)).toBe(2)
    await expectNoDanglingBindings(page)

    // Mark first: undo rewinds to the last history stopping point, and these
    // shapes were created programmatically without one -- so a bare undo() would
    // rewind past the setup and empty the page. A real user action always leaves
    // a mark, which is what this reproduces.
    await page.evaluate((id) => {
      const ed = window.__editor!
      ed.markHistoryStoppingPoint('before-delete')
      ed.deleteShapes([id as never])
    }, b)
    await expect.poll(() => shapeCount(page)).toBe(1)
    await page.evaluate(() => {
      window.__editor!.undo()
    })
    await expect.poll(() => shapeCount(page)).toBe(2)
    await expectNoDanglingBindings(page)
  })
})

test.describe('SPEC-005 FR-006 — synced and durable', () => {
  test('a connection and both bindings sync to another client', async ({ browser }) => {
    const room = roomId('cxb')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const a = await addNode(p1.page, 'A', { x: 100, y: 100 })
    const b = await addNode(p1.page, 'B', { x: 500, y: 400 })
    await addConnection(p1.page, a, b)

    await expect.poll(() => connectionCount(p2.page), { timeout: 15_000 }).toBe(1)
    await expect.poll(async () => (await allBindings(p2.page)).length, { timeout: 15_000 }).toBe(2)

    await p1.page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, b)
    await expect.poll(() => connectionCount(p2.page), { timeout: 15_000 }).toBe(0)

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('the connection and BOTH bindings reach durable storage, by content', async ({
    browser,
    request,
  }) => {
    const room = roomId('cxc')
    const p = await newParticipant(browser)
    await openRoom(p.page, room)
    const a = await addNode(p.page, 'A', { x: 100, y: 100 })
    const b = await addNode(p.page, 'B', { x: 500, y: 400 })
    const conn = await addConnection(p.page, a, b)

    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/dev/snapshot/${room}`)).json()).bindings?.length,
        { timeout: 20_000 },
      )
      .toBe(2)

    const stored = await (await request.get(`/api/dev/snapshot/${room}`)).json()
    expect(stored.bindings.every((x: { type: string }) => x.type === 'connectionEndpoint')).toBe(
      true,
    )
    expect(stored.bindings.every((x: { fromId: string }) => x.fromId === conn)).toBe(true)
    expect(stored.bindings.map((x: { terminal: string }) => x.terminal).sort()).toEqual([
      'end',
      'start',
    ])

    await p.ctx.close()
  })
})

test.describe('SPEC-005 FR-004 / SPEC-006 FR-005 — re-aiming an endpoint', () => {
  // SPEC-005 marked this Completed without building it: getHandles shipped, the
  // drag handler did not, so dragging an endpoint silently did nothing and no
  // test noticed. Every criterion below is SPEC-005 FR-004's, asserted at last.

  test('dragging the source endpoint onto a third node re-binds it, keeping the connection', async ({
    page,
  }) => {
    await openRoom(page, roomId('ra1'))
    const a = await addNode(page, 'A', { x: 100, y: 400, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 700, y: 400, w: 160, h: 100 })
    const c = await addNode(page, 'C', { x: 400, y: 80, w: 160, h: 100 })
    const conn = await addConnection(page, a, b)

    await dragEndpoint(page, conn, 'start', { x: 480, y: 130 })

    // Same shape, same two bindings -- an edit, not a delete-and-redraw.
    expect(await connectionCount(page)).toBe(1)
    const bindings = await allBindings(page)
    expect(bindings).toHaveLength(2)
    expect(bindings.every((x) => x.fromId === conn)).toBe(true)
    expect(bindings.find((x) => x.toId === c)).toBeTruthy()
    expect(bindings.find((x) => x.toId === a)).toBeFalsy()
    await expectNoDanglingBindings(page)
  })

  test('the same for the target endpoint', async ({ page }) => {
    await openRoom(page, roomId('ra2'))
    const a = await addNode(page, 'A', { x: 100, y: 400, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 700, y: 400, w: 160, h: 100 })
    const c = await addNode(page, 'C', { x: 400, y: 80, w: 160, h: 100 })
    const conn = await addConnection(page, a, b)

    await dragEndpoint(page, conn, 'end', { x: 480, y: 130 })

    const bindings = await allBindings(page)
    expect(bindings.find((x) => x.toId === c)).toBeTruthy()
    expect(bindings.find((x) => x.toId === b)).toBeFalsy()
    expect(bindings.find((x) => x.toId === a)).toBeTruthy()
  })

  test('dropping on empty canvas leaves the binding as it was', async ({ page }) => {
    await openRoom(page, roomId('ra3'))
    const a = await addNode(page, 'A', { x: 100, y: 400, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 700, y: 400, w: 160, h: 100 })
    const conn = await addConnection(page, a, b)

    await dragEndpoint(page, conn, 'start', { x: 460, y: 900 })

    const bindings = await allBindings(page)
    expect(bindings).toHaveLength(2)
    expect(bindings.map((x) => x.toId).sort()).toEqual([a, b].sort())
    await expectNoDanglingBindings(page)
  })

  test('dropping on the OTHER endpoint is refused — no self-connection by the back door', async ({
    page,
  }) => {
    await openRoom(page, roomId('ra4'))
    const a = await addNode(page, 'A', { x: 100, y: 400, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 700, y: 400, w: 200, h: 140 })
    const conn = await addConnection(page, a, b)

    await dragEndpoint(page, conn, 'start', { x: 800, y: 470 })

    const bindings = await allBindings(page)
    expect(bindings.map((x) => x.toId).sort()).toEqual([a, b].sort())
  })

  test('the node under the dragged endpoint is hinted', async ({ page }) => {
    await openRoom(page, roomId('ra5'))
    const a = await addNode(page, 'A', { x: 100, y: 400, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 700, y: 400, w: 160, h: 100 })
    const c = await addNode(page, 'C', { x: 400, y: 80, w: 160, h: 100 })
    const conn = await addConnection(page, a, b)

    const { hintedMidDrag } = await dragEndpoint(page, conn, 'start', { x: 480, y: 130 })
    expect(hintedMidDrag).toEqual([c])
    // And cleared on drop, so the hint does not outlive the gesture.
    expect(await page.evaluate(() => window.__editor!.getHintingShapeIds())).toEqual([])
  })

  test('dropping on a COLLAPSED container binds to the container, the shape actually on screen', async ({
    page,
  }) => {
    // A node inside a collapsed container is hidden, and getShapeAtPoint skips
    // hidden shapes, so it is not a pointer target at all. The container is what
    // is under the finger and what the binding records.
    await openRoom(page, roomId('ra6'))
    const a = await addNode(page, 'A', { x: 100, y: 400, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 700, y: 400, w: 160, h: 100 })
    const container = await addNode(page, 'P', { x: 380, y: 60, w: 320, h: 200 })
    await addNode(page, 'Inner', { x: 20, y: 20, w: 120, h: 80, parentId: container })
    await setCollapsed(page, container, true)
    const conn = await addConnection(page, a, b)

    await dragEndpoint(page, conn, 'start', { x: 540, y: 160 })

    const bindings = await allBindings(page)
    expect(bindings.find((x) => x.toId === container)).toBeTruthy()
    expect(bindings.find((x) => x.toId === a)).toBeFalsy()
  })
})
