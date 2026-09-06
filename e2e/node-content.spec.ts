import { test, expect, type Page } from '@playwright/test'
import {
  openRoom,
  roomId,
  addNode,
  addConnection,
  addTldrawShape,
  setCollapsed,
  setSketchMode,
  penStroke,
  parentOf,
  pageBounds,
  dragCorner,
  newParticipant,
  addScene,
  viewScene,
  hiddenShapeIds,
  exportedJson,
} from './helpers'

/** The one draw shape on the page. */
async function strokeId(page: Page): Promise<string> {
  return page.evaluate(
    () => window.__editor!.getCurrentPageShapes().find((s) => s.type === 'draw')!.id as string,
  )
}

/** A box-ish stroke inside the given page rect. */
const strokeInside = (x: number, y: number): Array<[number, number]> => [
  [x, y],
  [x + 30, y + 4],
  [x + 60, y - 2],
  [x + 62, y + 20],
  [x + 58, y + 40],
  [x + 30, y + 44],
  [x, y + 40],
]

test.describe('SPEC-013 FR-001 — a node adopts what you draw inside it', () => {
  test('a stroke begun inside a node becomes its child', async ({ page }) => {
    await openRoom(page, roomId('nc1'))
    const node = await addNode(page, 'Box', { x: 250, y: 200, w: 400, h: 300 })
    await setSketchMode(page, false)
    await penStroke(page, strokeInside(350, 300))

    expect(await parentOf(page, await strokeId(page))).toBe(node)
  })

  test('the rule is NOT A CONNECTION, not a list of blessed types', async ({ page }) => {
    // A list is what goes stale the first time tldraw ships a new shape.
    await openRoom(page, roomId('nc2'))
    const node = await addNode(page, 'Box', { x: 250, y: 200, w: 400, h: 300 })
    for (const type of ['geo', 'text', 'note']) {
      const id = await addTldrawShape(page, type, { x: 350, y: 300 })
      expect(await parentOf(page, id), `${type} was not adopted`).toBe(node)
    }
  })

  test('a stroke begun OUTSIDE and finished inside is not adopted', async ({ page }) => {
    // Where the pen goes down decides, because that is the only moment the
    // person can predict.
    await openRoom(page, roomId('nc3'))
    const node = await addNode(page, 'Box', { x: 400, y: 200, w: 400, h: 300 })
    await setSketchMode(page, false)
    await penStroke(page, [
      [200, 300],
      [300, 305],
      [420, 300],
      [520, 302],
      [600, 300],
    ])
    expect(await parentOf(page, await strokeId(page))).not.toBe(node)
  })

  test('a COLLAPSED node adopts nothing', async ({ page }) => {
    await openRoom(page, roomId('nc4'))
    const node = await addNode(page, 'Box', { x: 250, y: 200, w: 400, h: 300 })
    await addNode(page, 'child', { x: 20, y: 20, w: 100, h: 60, parentId: node })
    await setCollapsed(page, node, true)
    const id = await addTldrawShape(page, 'geo', { x: 350, y: 300 })
    // A child of a folded container is hidden the instant it exists.
    expect(await parentOf(page, id)).not.toBe(node)
  })

  test('a node folded BY A SCENE adopts nothing either', async ({ page }) => {
    // The lens hides children just as thoroughly as the raw prop, and the
    // natural implementation reads only the prop.
    await openRoom(page, roomId('nc5'))
    const node = await addNode(page, 'Box', { x: 250, y: 200, w: 400, h: 300 })
    await addNode(page, 'child', { x: 20, y: 20, w: 100, h: 60, parentId: node })
    const sceneId = await addScene(page, 'Folded', { [node]: true }, { index: 'a1' })
    await viewScene(page, sceneId)

    const id = await addTldrawShape(page, 'geo', { x: 350, y: 300 })
    expect(await parentOf(page, id)).not.toBe(node)
  })

  test('a CONNECTION is never adopted, however it is drawn', async ({ page }) => {
    await openRoom(page, roomId('nc6'))
    const outer = await addNode(page, 'Outer', { x: 150, y: 150, w: 700, h: 450 })
    const a = await addNode(page, 'A', { x: 40, y: 40, w: 140, h: 90, parentId: outer })
    const b = await addNode(page, 'B', { x: 400, y: 250, w: 140, h: 90, parentId: outer })
    const k = await addConnection(page, a, b)
    // Parented to the PAGE by design: SPEC-006's merge derivation depends on it.
    expect(await parentOf(page, k)).toBe(
      await page.evaluate(() => window.__editor!.getCurrentPageId() as string),
    )
  })
})

test.describe('SPEC-013 FR-002 — content belongs to its node', () => {
  const withContent = async (page: Page) => {
    const node = await addNode(page, 'Box', { x: 250, y: 200, w: 400, h: 300 })
    const content = await addTldrawShape(page, 'geo', { x: 350, y: 300 })
    expect(await parentOf(page, content)).toBe(node)
    return { node, content }
  }

  test('MOVING the node moves its content', async ({ page }) => {
    await openRoom(page, roomId('nc7'))
    const { node, content } = await withContent(page)
    const before = await pageBounds(page, content)

    await page.evaluate((id) => {
      const ed = window.__editor!
      const shape = ed.getShape(id as never)!
      ed.updateShape({ id: shape.id, type: shape.type, x: shape.x + 200, y: shape.y + 120 })
    }, node)

    // On PAGE POSITION, not parentId -- parentId is what stays right when
    // nothing moves at all.
    const after = await pageBounds(page, content)
    expect(after.x - before.x).toBe(200)
    expect(after.y - before.y).toBe(120)
  })

  test('FOLDING the node hides its content', async ({ page }) => {
    await openRoom(page, roomId('nc8'))
    const { node, content } = await withContent(page)
    expect(await hiddenShapeIds(page)).not.toContain(content)
    await setCollapsed(page, node, true)
    expect(await hiddenShapeIds(page)).toContain(content)
  })

  test('DELETING the node deletes its content', async ({ page }) => {
    await openRoom(page, roomId('nc9'))
    const { node, content } = await withContent(page)
    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, node)
    expect(
      await page.evaluate((id) => window.__editor!.getShape(id as never) === undefined, content),
    ).toBe(true)
  })

  test('content reaches a second client AS A CHILD of the node', async ({ browser }) => {
    // On parentId, not presence: a draw shape already syncs, so a presence
    // assertion could not fail against this change. The parenting is the half
    // that could.
    const room = roomId('nc10')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const node = await addNode(p1.page, 'Box', { x: 250, y: 200, w: 400, h: 300 })
    const content = await addTldrawShape(p1.page, 'geo', { x: 350, y: 300 })

    await expect.poll(() => parentOf(p2.page, content), { timeout: 15_000 }).toBe(node)

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('RESIZING the node leaves its content alone — and still owned', async ({ page }) => {
    // BOTH halves. tldraw's resize finishes with a kickout that reparents a
    // child no longer overlapping its parent -- and reparenting PRESERVES page
    // position, so a bounds-only assertion passes while the content silently
    // stops belonging to anything.
    await openRoom(page, roomId('nc11'))
    const { node, content } = await withContent(page)
    const before = await pageBounds(page, content)

    await dragCorner(page, node, 300, 200)
    expect(await pageBounds(page, content)).toEqual(before)
    expect(await parentOf(page, content)).toBe(node)
  })

  test('shrinking a node clear of its content RETURNS THAT CONTENT TO THE PAGE', async ({
    page,
  }) => {
    // The stated cost of being able to drag writing out by hand (settled
    // 2026-09-06): tldraw's kickout cannot tell an explicit drag from an
    // automatic one, so allowing the first allows the second. Asserted rather
    // than left to be discovered -- and note the content does not MOVE, because
    // reparenting preserves page position. Only its ownership changes, which is
    // exactly why a bounds-only assertion here would prove nothing.
    await openRoom(page, roomId('nc11b'))
    const node = await addNode(page, 'Box', { x: 200, y: 150, w: 600, h: 450 })
    const content = await addTldrawShape(page, 'geo', { x: 700, y: 520 })
    expect(await parentOf(page, content)).toBe(node)
    const before = await pageBounds(page, content)
    const pageId = await page.evaluate(() => window.__editor!.getCurrentPageId() as string)

    await dragCorner(page, node, -420, -320)

    const apart = await page.evaluate(
      ({ n, c }) => {
        const ed = window.__editor!
        const nb = ed.getShapePageBounds(n as never)!
        const cb = ed.getShapePageBounds(c as never)!
        return nb.maxX < cb.minX || nb.maxY < cb.minY
      },
      { n: node, c: content },
    )
    expect(apart, 'the shrink must clear the content, or nothing is at risk').toBe(true)

    expect(await pageBounds(page, content)).toEqual(before)
    expect(await parentOf(page, content)).toBe(pageId)
  })

  test('a nested NODE also stays put on resize', async ({ page }) => {
    // The deliberate SPEC-004 behaviour change: one rule for everything inside
    // a box. A criterion rather than a note, so a later reader does not read it
    // as a regression.
    await openRoom(page, roomId('nc12'))
    const outer = await addNode(page, 'Outer', { x: 250, y: 200, w: 500, h: 400 })
    const inner = await addNode(page, 'Inner', { x: 40, y: 40, w: 150, h: 100, parentId: outer })
    const before = await pageBounds(page, inner)

    await dragCorner(page, outer, 300, 200)
    expect(await pageBounds(page, inner)).toEqual(before)
    expect(await parentOf(page, inner)).toBe(outer)
  })

  test('content dragged OUT BY HAND returns to the page', async ({ page }) => {
    // Through real pointer input. An earlier version called `reparentShapes`
    // directly, which nothing gates -- so it passed against a build where a
    // 500px hand drag left the content still owned by the node.
    await openRoom(page, roomId('nc13'))
    const node = await addNode(page, 'Box', { x: 250, y: 200, w: 400, h: 300 })
    // BIG ENOUGH that its centre is clear of its own resize handles: at 40px
    // the handles nearly cover the shape, and a drag from the middle resized it
    // instead of moving it -- 40x40 became 460x310 and the test read that as
    // "it did not leave".
    const content = await addTldrawShape(page, 'geo', { x: 330, y: 280 }, 140)
    expect(await parentOf(page, content)).toBe(node)
    const pageId = await page.evaluate(() => window.__editor!.getCurrentPageId() as string)

    const from = await page.evaluate((id) => {
      const ed = window.__editor!
      ed.setCurrentTool('select')
      ed.setSelectedShapes([id as never])
      const b = ed.getShapePageBounds(id as never)!
      const p = ed.pageToScreen({ x: b.midX, y: b.midY })
      return { x: p.x, y: p.y }
    }, content)
    await page.waitForTimeout(150)

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 500, from.y + 350, { steps: 20 })
    await page.mouse.up()
    await page.waitForTimeout(250)

    expect(await parentOf(page, content)).toBe(pageId)
    void node
  })
})

test.describe('SPEC-013 FR-003 — it does not fight sketch recognition', () => {
  test('with recognition ON, HANDWRITING inside a node stays content', async ({ page }) => {
    // The recogniser refuses a scribble, and the refusal path must leave the
    // parenting alone -- which is why the toggle is a convenience here, not a
    // requirement.
    await openRoom(page, roomId('nc14'))
    const node = await addNode(page, 'Box', { x: 250, y: 200, w: 500, h: 400 })
    await setSketchMode(page, true)
    await penStroke(page, [
      [350, 300],
      [390, 260],
      [350, 340],
      [430, 270],
      [360, 350],
      [450, 280],
      [380, 360],
      [470, 300],
    ])
    const id = await strokeId(page)
    expect(await parentOf(page, id)).toBe(node)
  })

  test('with recognition ON, a BOX-ish stroke inside a node becomes a nested node', async ({
    page,
  }) => {
    // SPEC-010's behaviour, unchanged. Asserted here so a later change to
    // adoption cannot quietly break it.
    await openRoom(page, roomId('nc15'))
    const node = await addNode(page, 'Box', { x: 200, y: 150, w: 700, h: 500 })
    await setSketchMode(page, true)
    await penStroke(page, [
      [400, 300],
      [500, 298],
      [600, 300],
      [602, 360],
      [600, 420],
      [500, 422],
      [400, 420],
      [398, 360],
      [401, 302],
    ])
    const nested = await page.evaluate(
      (parentId) =>
        window
          .__editor!.getCurrentPageShapes()
          .filter((s) => s.type === 'diagramNode' && s.id !== parentId)
          .map((s) => s.parentId as string),
      node,
    )
    expect(nested).toEqual([node])
  })

  test('with recognition OFF, a box-ish stroke inside a node stays content', async ({ page }) => {
    await openRoom(page, roomId('nc16'))
    const node = await addNode(page, 'Box', { x: 200, y: 150, w: 700, h: 500 })
    await setSketchMode(page, false)
    await penStroke(page, [
      [400, 300],
      [500, 298],
      [600, 300],
      [602, 360],
      [600, 420],
      [500, 422],
      [400, 420],
      [398, 360],
      [401, 302],
    ])
    expect(await parentOf(page, await strokeId(page))).toBe(node)
  })
})

test.describe('SPEC-013 FR-004 — the system says what happens to content', () => {
  test('content inside a node counts toward the undocumentable warning', async ({ page }) => {
    // With content that exists ONLY inside nodes -- a count that happens to be
    // right because there is also loose content on the page proves nothing.
    await openRoom(page, roomId('nc17'))
    const node = await addNode(page, 'Box', { x: 250, y: 200, w: 400, h: 300 })
    await addTldrawShape(page, 'geo', { x: 350, y: 300 })
    void node

    await page.getByTestId('diagram-io-open').click()
    await expect(page.getByTestId('diagram-io-undocumentable')).toContainText(/1 shape/)
    await page.getByTestId('diagram-io-close').click()
  })

  test('export is unaffected by content: the same document, with or without it', async ({
    page,
  }) => {
    await openRoom(page, roomId('nc18'))
    const a = await addNode(page, 'A', { x: 250, y: 200, w: 400, h: 300 })
    const b = await addNode(page, 'B', { x: 800, y: 200, w: 200, h: 120 })
    await addConnection(page, a, b)
    const without = await exportedJson(page)

    await addTldrawShape(page, 'geo', { x: 350, y: 300 })
    expect(await exportedJson(page)).toBe(without)
  })
})

test.describe('SPEC-013 FR-005 — nothing else regressed', () => {
  test('a connection dropped on a node with content under the cursor binds to the NODE', async ({
    page,
  }) => {
    await openRoom(page, roomId('nc19'))
    const a = await addNode(page, 'A', { x: 100, y: 500, w: 160, h: 100 })
    const target = await addNode(page, 'Target', { x: 400, y: 150, w: 400, h: 250 })
    await addTldrawShape(page, 'geo', { x: 580, y: 260 })
    const k = await addConnection(page, a, target)

    const bound = await page.evaluate((id) => {
      const ed = window.__editor!
      return ed
        .getBindingsFromShape(ed.getShape(id as never)!, 'connectionEndpoint')
        .map((b) => b.toId as string)
    }, k)
    expect(bound).toContain(target)
  })

  test('MERGING still works with content in the container', async ({ page }) => {
    await openRoom(page, roomId('nc20'))
    const box = await addNode(page, 'Platform', { x: 200, y: 100, w: 400, h: 400 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 80, parentId: box })
    const c2 = await addNode(page, 'C2', { x: 30, y: 200, w: 140, h: 80, parentId: box })
    const y = await addNode(page, 'Y', { x: 750, y: 250, w: 160, h: 100 })
    await addConnection(page, c1, y)
    await addConnection(page, c2, y)
    await addTldrawShape(page, 'geo', { x: 450, y: 300 })

    await setCollapsed(page, box, true)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelectorAll('[data-testid="diagram-connection-count"]').length,
        ),
      )
      .toBe(1)
  })
})
