import { test, expect, type Page } from '@playwright/test'
import {
  openRoom,
  newParticipant,
  addNode,
  addConnection,
  addFrame,
  viewFrame,
  hiddenShapeIds,
  pageRecords,
  visibleConnections,
  setCollapsed,
  roomId,
} from './helpers'

/**
 * SPEC-008 PR 1: the records and the lens.
 *
 * Frames are driven directly through the store here — the authoring UI is PR 2.
 * That is what makes this a PR on its own: every criterion below is about the
 * model, not the surface.
 */

/** A container P with two children, an outside node Y, and a connection each. */
async function diagram(page: Page) {
  const y = await addNode(page, 'Y', { x: 80, y: 700, w: 160, h: 100 })
  const p = await addNode(page, 'P', { x: 600, y: 120, w: 420, h: 300 })
  const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 70, parentId: p })
  const c2 = await addNode(page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: p })
  const k1 = await addConnection(page, c1, y)
  const k2 = await addConnection(page, c2, y)
  return { y, p, c1, c2, k1, k2 }
}

test.describe('SPEC-008 FR-001 — the frame records', () => {
  test('a frame syncs to a second client and reaches durable storage', async ({
    browser,
    request,
  }) => {
    const room = roomId('fr1')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const frameId = await addFrame(p1.page, 'Overview', {}, { index: 'a2' })

    await expect
      .poll(() => p2.page.evaluate((id) => !!window.__editor!.store.get(id as never), frameId), {
        timeout: 15_000,
      })
      .toBe(true)

    // On CONTENT, not a document count: a frame is neither a shape nor a
    // binding, so every existing probe field is blind to it.
    await expect
      .poll(
        async () =>
          (
            (await (await request.get(`/api/dev/snapshot/${room}`)).json()) as {
              frames?: Array<{ name: string }>
            }
          ).frames?.map((f) => f.name),
        { timeout: 20_000 },
      )
      .toEqual(['Overview'])

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('room contents outlive every client, frames included', async ({ browser, request }) => {
    const room = roomId('fr2')
    const p1 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await addFrame(p1.page, 'Survives')
    await expect
      .poll(
        async () =>
          (
            (await (await request.get(`/api/dev/snapshot/${room}`)).json()) as {
              frames?: unknown[]
            }
          ).frames?.length,
        { timeout: 20_000 },
      )
      .toBe(1)
    await p1.ctx.close()

    const p2 = await newParticipant(browser)
    await openRoom(p2.page, room)
    await expect
      .poll(() =>
        p2.page.evaluate(
          () =>
            window.__editor!.store.allRecords().filter((r) => r.typeName === 'diagramFrame').length,
        ),
      )
      .toBe(1)
    await p2.ctx.close()
  })

  test('the VIEW record never reaches another client', async ({ browser }) => {
    // Session scope is the whole reason stepping is per-viewer. If this leaked,
    // the lens would be an edit wearing a different name.
    const room = roomId('fr3')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const frameId = await addFrame(p1.page, 'Mine')
    await viewFrame(p1.page, frameId)
    await expect
      .poll(
        () =>
          p2.page.evaluate(
            () =>
              window.__editor!.store.allRecords().filter((r) => r.typeName === 'diagramFrame')
                .length,
          ),
        { timeout: 15_000 },
      )
      .toBe(1)

    const viewRecords = await p2.page.evaluate(
      () =>
        window.__editor!.store.allRecords().filter((r) => r.typeName === 'diagramFrameView').length,
    )
    expect(viewRecords).toBe(0)

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('a room persisted before frames existed opens cleanly and shows none', async ({ page }) => {
    // Seeded through the same route SPEC-004 uses for its migration proof.
    await openRoom(page, roomId('fr4'))
    await addNode(page, 'Old', { x: 100, y: 100 })
    expect(
      await page.evaluate(
        () =>
          window.__editor!.store.allRecords().filter((r) => r.typeName === 'diagramFrame').length,
      ),
    ).toBe(0)
    await expect(page.getByTestId('diagram-node')).toHaveCount(1)
  })
})

test.describe('SPEC-008 FR-003 — a frame is a lens, and never writes', () => {
  test('viewing a frame folds a container for this viewer', async ({ page }) => {
    await openRoom(page, roomId('fl1'))
    const { p, c1, c2 } = await diagram(page)

    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([])
    const frameId = await addFrame(page, 'Folded', { [p]: true })
    await viewFrame(page, frameId)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())
  })

  test('MERGING follows the frame — the claim the whole design rests on', async ({ page }) => {
    // Collapse is read twice: the visibility walk and the merge derivation. If
    // only one saw the frame, P would fold while the lines crossing its boundary
    // stayed unmerged, drawn to shapes no longer on screen.
    await openRoom(page, roomId('fl2'))
    const { y, p } = await diagram(page)

    expect(await visibleConnections(page)).toHaveLength(2)
    const frameId = await addFrame(page, 'Folded', { [p]: true })
    await viewFrame(page, frameId)

    const merged = await visibleConnections(page)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ start: p, end: y, count: 2 })
  })

  test('the container itself reads as folded — control, label and badge', async ({ page }) => {
    await openRoom(page, roomId('fl3'))
    const { p } = await diagram(page)
    const frameId = await addFrame(page, 'Folded', { [p]: true })
    await viewFrame(page, frameId)

    const toggle = page.getByTestId('diagram-node-toggle').first()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAttribute('aria-label', 'Expand container')
    await expect(toggle).toHaveText('+')
    await expect(page.getByTestId('diagram-node-count')).toHaveText('2 hidden')
  })

  test('NO shape record changes, before, during or after', async ({ page }) => {
    await openRoom(page, roomId('fl4'))
    const { p } = await diagram(page)

    const shapeRecords = async () =>
      (await pageRecords(page)).filter((r) => r.type !== 'diagramFrame')
    const before = await shapeRecords()

    const frameId = await addFrame(page, 'Folded', { [p]: true })
    await viewFrame(page, frameId)
    expect(await shapeRecords()).toEqual(before)

    await viewFrame(page, null)
    expect(await shapeRecords()).toEqual(before)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([])
  })

  test('a second client sees NOTHING — not the fold, not the merge', async ({ browser }) => {
    const room = roomId('fl5')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const { p } = await diagram(p1.page)
    await expect.poll(() => visibleConnections(p2.page).then((c) => c.length)).toBe(2)

    const frameId = await addFrame(p1.page, 'Folded', { [p]: true })
    await viewFrame(p1.page, frameId)
    expect(await hiddenShapeIds(p1.page, 'diagramNode')).toHaveLength(2)

    // B is untouched: same visible lines, nothing hidden at all.
    await expect.poll(() => hiddenShapeIds(p2.page)).toEqual([])
    expect(await visibleConnections(p2.page)).toHaveLength(2)

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('a frame can force-EXPAND a container whose own prop is collapsed', async ({ page }) => {
    await openRoom(page, roomId('fl6'))
    const { p, c1, c2 } = await diagram(page)
    await setCollapsed(page, p, true)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())

    const frameId = await addFrame(page, 'Open it', { [p]: false })
    await viewFrame(page, frameId)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([])
  })

  test('a container the frame does not name keeps its own prop', async ({ page }) => {
    await openRoom(page, roomId('fl7'))
    const { p, c1, c2 } = await diagram(page)
    await setCollapsed(page, p, true)

    const frameId = await addFrame(page, 'Silent', { 'shape:someone-else': true })
    await viewFrame(page, frameId)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())
  })

  test('a frame-folded container refuses drops, so a dropped node cannot vanish', async ({
    page,
  }) => {
    await openRoom(page, roomId('fl8'))
    const { p } = await diagram(page)
    const loose = await addNode(page, 'Loose', { x: 100, y: 100, w: 120, h: 80 })
    const frameId = await addFrame(page, 'Folded', { [p]: true })
    await viewFrame(page, frameId)

    const accepts = await page.evaluate(
      ({ p, loose }) => {
        const ed = window.__editor!
        const container = ed.getShape(p as never)!
        const util = ed.getShapeUtil(container)
        return util.canReceiveNewChildrenOfType(container, ed.getShape(loose as never)!.type)
      },
      { p, loose },
    )
    expect(accepts).toBe(false)
  })
})
