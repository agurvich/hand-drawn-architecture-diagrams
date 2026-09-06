import { test, expect } from '@playwright/test'
import {
  openRoom,
  roomId,
  addNode,
  penStroke,
  shapesByType,
  setSketchMode,
  setCollapsed,
  pageRecords,
} from './helpers'

/**
 * Driven by REAL PEN INPUT throughout. The gesture is the feature: a test that
 * called `recognise` directly would pass against a build where no stroke ever
 * reaches the recogniser, which is how a previous spec shipped a handle nothing
 * dragged. The classifier's own accuracy is covered by the corpus unit tests.
 */

const BOX: Array<[number, number]> = [
  [300, 250],
  [400, 248],
  [500, 250],
  [502, 320],
  [500, 400],
  [400, 402],
  [300, 400],
  [298, 320],
  [301, 252],
]

test.describe('SPEC-010 FR-004 — it never eats an annotation', () => {
  test('a fresh room converts NOTHING, and the control says so', async ({ page }) => {
    await openRoom(page, roomId('sk1'))
    await expect(page.getByTestId('sketch-toggle')).toHaveAttribute('aria-pressed', 'false')

    await penStroke(page, BOX)

    // The stroke the recogniser WOULD call a box, left alone.
    expect(await shapesByType(page)).toEqual({ draw: 1 })
  })

  test('turning it off mid-session converts nothing further, and keeps what converted', async ({
    page,
  }) => {
    await openRoom(page, roomId('sk2'))
    await setSketchMode(page, true)
    await penStroke(page, BOX)
    expect(await shapesByType(page)).toEqual({ diagramNode: 1 })

    await setSketchMode(page, false)
    await penStroke(page, BOX.map(([x, y]) => [x, y + 300]) as Array<[number, number]>)

    // One node kept, one stroke left as a stroke.
    expect(await shapesByType(page)).toEqual({ diagramNode: 1, draw: 1 })
  })

  test('the mode does not sync — one person tidying does not convert under another pencil', async ({
    browser,
  }) => {
    const room = roomId('sk3')
    const a = await browser.newContext()
    const b = await browser.newContext()
    const pageA = await a.newPage()
    const pageB = await b.newPage()
    await openRoom(pageA, room)
    await openRoom(pageB, room)

    await setSketchMode(pageA, true)
    // B never learns about it.
    await expect(pageB.getByTestId('sketch-toggle')).toHaveAttribute('aria-pressed', 'false')

    await penStroke(pageB, BOX)
    expect(await shapesByType(pageB)).toEqual({ draw: 1 })

    await a.close()
    await b.close()
  })

  test('ONE undo returns the exact original stroke, not just some stroke', async ({ page }) => {
    await openRoom(page, roomId('sk4'))
    await setSketchMode(page, false)
    await penStroke(page, BOX)
    const before = await pageRecords(page)
    const strokeId = before[0]!.id

    // Convert the stroke that already exists, so "the same stroke" is checkable.
    await setSketchMode(page, true)
    await page.evaluate((id) => {
      const ed = window.__editor!
      const shape = ed.getShape(id as never)!
      // Nudge isComplete false->true through the real completion edge.
      ed.updateShape({ ...shape, props: { ...shape.props, isComplete: false } } as never)
      ed.updateShape({ ...shape, props: { ...shape.props, isComplete: true } } as never)
    }, strokeId)
    await page.waitForTimeout(120)
    expect(await shapesByType(page)).toEqual({ diagramNode: 1 })

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    // ON THE RESTORED RECORD, not a shape count: a count of 1 is also what a
    // different stroke would give.
    expect(await pageRecords(page)).toEqual(before)
  })

  test('a stroke already on the canvas is never converted later', async ({ page }) => {
    // The conversion fires on the COMPLETION EDGE, not on the completed state.
    // Without the edge it fires on every later update too, so a stroke you drew
    // with the mode off -- and accepted -- becomes a shape the moment you nudge
    // it with the mode on. That is "recognising what is already on the canvas",
    // which is explicitly not this feature: it would rewrite work you kept.
    await openRoom(page, roomId('sk22'))
    await setSketchMode(page, false)
    await penStroke(page, BOX)
    expect(await shapesByType(page)).toEqual({ draw: 1 })

    await setSketchMode(page, true)
    await page.evaluate(() => {
      const ed = window.__editor!
      const stroke = ed.getCurrentPageShapes()[0]!
      // Move it, the way dragging does.
      ed.updateShape({ id: stroke.id, type: stroke.type, x: stroke.x + 40, y: stroke.y + 25 })
    })
    await page.waitForTimeout(150)

    expect(await shapesByType(page)).toEqual({ draw: 1 })
  })

  test('a conversion is announced to assistive technology', async ({ page }) => {
    await openRoom(page, roomId('sk5'))
    const status = page.getByTestId('sketch-toggle').locator('..').locator('[role="status"]')
    await expect(status).toHaveText('')

    await setSketchMode(page, true)
    await penStroke(page, BOX)
    await expect(status).toContainText(/node/i)
  })
})

test.describe('SPEC-010 FR-002 — a sketched box becomes a node', () => {
  test('the stroke is replaced by a node at its bounds, and the node is selected', async ({
    page,
  }) => {
    await openRoom(page, roomId('sk6'))
    await setSketchMode(page, true)
    await penStroke(page, BOX)

    expect(await shapesByType(page)).toEqual({ diagramNode: 1 })
    const node = await page.evaluate(() => {
      const shape = window.__editor!.getCurrentPageShapes()[0]!
      const bounds = window.__editor!.getShapePageBounds(shape.id)!
      return {
        selected: window.__editor!.getSelectedShapeIds()[0] === shape.id,
        w: Math.round(bounds.w),
        h: Math.round(bounds.h),
      }
    })
    expect(node.selected).toBe(true)
    // The stroke's bounding box, within the tool's own smoothing.
    expect(node.w).toBeGreaterThan(150)
    expect(node.w).toBeLessThan(260)
    expect(node.h).toBeGreaterThan(100)
    expect(node.h).toBeLessThan(210)
  })

  test('a box drawn inside an EXPANDED container becomes its child, correctly placed', async ({
    page,
  }) => {
    await openRoom(page, roomId('sk7'))
    const parent = await addNode(page, 'Parent', { x: 200, y: 150, w: 700, h: 500 })
    await setSketchMode(page, true)
    await penStroke(page, [
      [400, 320],
      [500, 318],
      [600, 320],
      [602, 380],
      [600, 440],
      [500, 442],
      [400, 440],
      [398, 380],
      [401, 322],
    ])

    const child = await page.evaluate((parentId) => {
      const ed = window.__editor!
      const node = ed
        .getCurrentPageShapes()
        .find((s) => s.type === 'diagramNode' && s.id !== parentId)
      if (!node) return null
      const bounds = ed.getShapePageBounds(node.id)!
      return { parentId: node.parentId as string, pageX: Math.round(bounds.x) }
    }, parent)

    expect(child).not.toBeNull()
    expect(child!.parentId).toBe(parent)
    // PAGE position, which is what catches the reparent-vs-create-with-parent
    // mistake: reparenting converts the position, creating with a parentId takes
    // x/y as already parent-local, so getting it wrong misplaces the box by the
    // parent's offset -- 200,150 here.
    expect(Math.abs(child!.pageX - 400)).toBeLessThan(60)
  })

  test('a box drawn over a COLLAPSED container does not become its child', async ({ page }) => {
    await openRoom(page, roomId('sk8'))
    const parent = await addNode(page, 'Parent', { x: 200, y: 150, w: 700, h: 500 })
    await addNode(page, 'Existing', { x: 20, y: 20, w: 100, h: 60, parentId: parent })
    await setCollapsed(page, parent, true)
    await setSketchMode(page, true)
    await penStroke(page, [
      [400, 320],
      [500, 318],
      [600, 320],
      [602, 380],
      [600, 440],
      [500, 442],
      [400, 440],
      [398, 380],
      [401, 322],
    ])

    const parented = await page.evaluate((parentId) => {
      const ed = window.__editor!
      const node = ed
        .getCurrentPageShapes()
        .find((s) => s.type === 'diagramNode' && s.id !== parentId && s.parentId !== parentId)
      return node !== undefined
    }, parent)
    // It became a node, but a TOP-LEVEL one -- a node parented into a folded
    // container vanishes on creation.
    expect(parented).toBe(true)
  })

  test('a box too small to be a usable node is left as a stroke', async ({ page }) => {
    await openRoom(page, roomId('sk9'))
    await setSketchMode(page, true)
    await penStroke(page, [
      [400, 300],
      [428, 299],
      [430, 322],
      [429, 325],
      [402, 326],
      [399, 312],
      [401, 302],
    ])
    expect(await shapesByType(page)).toEqual({ draw: 1 })
  })

  test('a scribble is left alone', async ({ page }) => {
    await openRoom(page, roomId('sk10'))
    await setSketchMode(page, true)
    await penStroke(page, [
      [300, 300],
      [340, 260],
      [300, 340],
      [380, 270],
      [310, 350],
      [400, 280],
      [330, 360],
      [420, 300],
    ])
    expect(await shapesByType(page)).toEqual({ draw: 1 })
  })
})

test.describe('SPEC-010 FR-003 — a sketched line becomes a connection', () => {
  const twoNodes = async (page: import('@playwright/test').Page) => {
    const a = await addNode(page, 'A', { x: 150, y: 250, w: 180, h: 120 })
    const b = await addNode(page, 'B', { x: 650, y: 250, w: 180, h: 120 })
    return { a, b }
  }

  test('node to node makes a connection, and the source is where you started', async ({ page }) => {
    await openRoom(page, roomId('sk11'))
    const { a, b } = await twoNodes(page)
    await setSketchMode(page, true)
    await penStroke(page, [
      [240, 310],
      [360, 308],
      [480, 311],
      [600, 309],
      [730, 310],
    ])

    expect(await shapesByType(page)).toEqual({ diagramNode: 2, diagramConnection: 1 })
    const terminals = await page.evaluate(() => {
      const ed = window.__editor!
      const connection = ed.getCurrentPageShapes().find((s) => s.type === 'diagramConnection')!
      return ed
        .getBindingsFromShape(connection, 'connectionEndpoint')
        .map((binding) => [binding.props.terminal as string, binding.toId as string])
        .sort()
    })
    expect(terminals).toEqual([
      ['end', b],
      ['start', a],
    ])
  })

  test('drawn the other way, the source is the other node', async ({ page }) => {
    await openRoom(page, roomId('sk12'))
    const { a, b } = await twoNodes(page)
    await setSketchMode(page, true)
    await penStroke(page, [
      [730, 310],
      [600, 309],
      [480, 311],
      [360, 308],
      [240, 310],
    ])
    const terminals = await page.evaluate(() => {
      const ed = window.__editor!
      const connection = ed.getCurrentPageShapes().find((s) => s.type === 'diagramConnection')!
      return ed
        .getBindingsFromShape(connection, 'connectionEndpoint')
        .map((binding) => [binding.props.terminal as string, binding.toId as string])
        .sort()
    })
    expect(terminals).toEqual([
      ['end', a],
      ['start', b],
    ])
  })

  test('a line ending on empty canvas is left as a stroke', async ({ page }) => {
    await openRoom(page, roomId('sk13'))
    await twoNodes(page)
    await setSketchMode(page, true)
    await penStroke(page, [
      [240, 310],
      [340, 309],
      [440, 311],
      [520, 310],
    ])
    expect(await shapesByType(page)).toEqual({ diagramNode: 2, draw: 1 })
  })

  test('a line starting and ending on the SAME node creates nothing', async ({ page }) => {
    await openRoom(page, roomId('sk14'))
    await addNode(page, 'A', { x: 200, y: 200, w: 400, h: 300 })
    await setSketchMode(page, true)
    await penStroke(page, [
      [260, 280],
      [340, 300],
      [420, 320],
      [500, 340],
    ])
    expect(await shapesByType(page)).toEqual({ diagramNode: 1, draw: 1 })
  })

  test('A CONNECTION ROUTED AROUND AN OBSTACLE is a connection, not a node', async ({ page }) => {
    // The case that makes the rule OUTCOME-shaped rather than order-shaped.
    // Right, down, right is a closed rectangle-ish path, and the node-blind
    // classifier calls it a box -- correctly, since it cannot see the nodes.
    // Both ends land in two DIFFERENT nodes, which is unambiguous connection
    // evidence, and spending the weaker evidence first would turn an intended
    // connection into a node.
    await openRoom(page, roomId('sk15'))
    const a = await addNode(page, 'A', { x: 150, y: 250, w: 180, h: 120 })
    const b = await addNode(page, 'B', { x: 650, y: 250, w: 180, h: 120 })
    await setSketchMode(page, true)
    await penStroke(page, [
      [240, 310],
      [330, 311],
      [420, 309],
      [422, 400],
      [420, 480],
      [520, 482],
      [620, 479],
      [700, 400],
      [720, 320],
      [730, 310],
    ])

    expect(await shapesByType(page)).toEqual({ diagramNode: 2, diagramConnection: 1 })
    const bound = await page.evaluate(() => {
      const ed = window.__editor!
      const connection = ed.getCurrentPageShapes().find((s) => s.type === 'diagramConnection')!
      return ed
        .getBindingsFromShape(connection, 'connectionEndpoint')
        .map((binding) => binding.toId as string)
        .sort()
    })
    expect(bound).toEqual([a, b].sort())
  })

  test('a SCRIBBLE across two nodes is not a connection', async ({ page }) => {
    // The override in its other costume. Two ends in two different nodes is
    // strong evidence, and it has to be able to outweigh a refusal -- but not
    // for a stroke that wandered rather than went somewhere, or crossing out a
    // region that happens to span two boxes becomes a connection.
    await openRoom(page, roomId('sk21'))
    await twoNodes(page)
    await setSketchMode(page, true)
    await penStroke(page, [
      [240, 310],
      [360, 250],
      [280, 360],
      [430, 260],
      [300, 370],
      [520, 270],
      [380, 370],
      [640, 280],
      [500, 360],
      [730, 310],
    ])
    expect(await shapesByType(page)).toEqual({ diagramNode: 2, draw: 1 })
  })

  test('ONE undo restores the stroke after a connection', async ({ page }) => {
    await openRoom(page, roomId('sk16'))
    await twoNodes(page)
    await setSketchMode(page, true)
    await penStroke(page, [
      [240, 310],
      [360, 308],
      [480, 311],
      [600, 309],
      [730, 310],
    ])
    expect(await shapesByType(page)).toEqual({ diagramNode: 2, diagramConnection: 1 })

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    expect(await shapesByType(page)).toEqual({ diagramNode: 2, draw: 1 })
  })
})

test.describe('SPEC-010 FR-005 — the control', () => {
  test('is at least 44x44 and does not cover any of tldraw own UI', async ({ page }) => {
    await openRoom(page, roomId('sk17'))
    const box = (await page.getByTestId('sketch-toggle').boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)

    // On OVERLAP, not on coordinates: a control that clears the corner it was
    // measured against can still sit on a panel that moved.
    const covered = await page.evaluate(() => {
      const mine = document.querySelector('[data-testid="sketch-toggle"]')!.getBoundingClientRect()
      const hits: string[] = []
      for (const selector of ['.tlui-navigation-panel', '.tlui-toolbar', '.tlui-menu-zone']) {
        const el = document.querySelector(selector)
        if (!el) continue
        const r = el.getBoundingClientRect()
        const overlaps =
          mine.left < r.right && mine.right > r.left && mine.top < r.bottom && mine.bottom > r.top
        if (overlaps) hits.push(selector)
      }
      return hits
    })
    expect(covered).toEqual([])
  })

  test('its accessible name says what it DOES, and changes with its state', async ({ page }) => {
    await openRoom(page, roomId('sk18'))
    const button = page.getByTestId('sketch-toggle')
    await expect(button).toHaveAttribute('aria-label', /turn sketches into shapes/i)
    await button.click()
    await expect(button).toHaveAttribute('aria-label', /stop turning sketches into shapes/i)
  })

  test('is reachable and operable from the keyboard', async ({ page }) => {
    await openRoom(page, roomId('sk19'))
    await page.getByTestId('sketch-toggle').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('sketch-toggle')).toHaveAttribute('aria-pressed', 'true')
  })

  test('shows which state it is in by more than a 1px border', async ({ page }) => {
    await openRoom(page, roomId('sk20'))
    const fill = () =>
      page.evaluate(
        () =>
          getComputedStyle(document.querySelector('[data-testid="sketch-toggle"]')!)
            .backgroundColor,
      )
    const off = await fill()
    await page.getByTestId('sketch-toggle').click()
    expect(await fill()).not.toBe(off)
  })
})
