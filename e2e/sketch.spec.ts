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

    // WAIT FOR THE ROUND TRIP, or this asserts before the failure could arrive.
    // The path that must not happen is B draws -> A receives -> A (enabled)
    // converts -> the node syncs back to B, and that is three hops. Asserting
    // 120ms after the stroke made this test incapable of failing: a reviewer
    // removed the guard it exists to protect and it stayed green.
    // A's own view is the barrier -- once A has the stroke, A has had its
    // chance to convert it.
    await expect.poll(() => shapesByType(pageA), { timeout: 15_000 }).toEqual({ draw: 1 })
    await pageA.waitForTimeout(500)

    expect(await shapesByType(pageB)).toEqual({ draw: 1 })
    expect(await shapesByType(pageA)).toEqual({ draw: 1 })

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

  test('a box that CLIPS A SIBLING still lands in the container, not in the sibling', async ({
    page,
  }) => {
    // The ordinary case of a container that already holds something. A
    // four-corner hit test answers with the TOPMOST shape, so one corner over
    // the sibling used to make the whole thing fall through to "no container"
    // -- and tldraw's own new-shape heuristic then adopted the box into the
    // sibling. A 200x120 node created as a child of a 120x80 one.
    await openRoom(page, roomId('sk23'))
    const parent = await addNode(page, 'Parent', { x: 200, y: 150, w: 700, h: 500 })
    const sibling = await addNode(page, 'Sibling', {
      x: 220,
      y: 180,
      w: 120,
      h: 80,
      parentId: parent,
    })
    await setSketchMode(page, true)
    // Overlaps the sibling's bottom-right corner, well inside the parent.
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

    const parented = await page.evaluate(
      ({ parentId, siblingId }) => {
        const ed = window.__editor!
        const node = ed
          .getCurrentPageShapes()
          .find((s) => s.type === 'diagramNode' && s.id !== parentId && s.id !== siblingId)
        return node ? (node.parentId as string) : null
      },
      { parentId: parent, siblingId: sibling },
    )
    expect(parented).toBe(parent)
  })

  test('the INNERMOST containing node adopts a box, not the outermost', async ({ page }) => {
    await openRoom(page, roomId('sk24'))
    const outer = await addNode(page, 'Outer', { x: 100, y: 100, w: 800, h: 600 })
    const inner = await addNode(page, 'Inner', { x: 150, y: 150, w: 500, h: 400, parentId: outer })
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

    const parented = await page.evaluate(
      ({ outerId, innerId }) => {
        const ed = window.__editor!
        const node = ed
          .getCurrentPageShapes()
          .find((s) => s.type === 'diagramNode' && s.id !== outerId && s.id !== innerId)
        return node ? (node.parentId as string) : null
      },
      { outerId: outer, innerId: inner },
    )
    expect(parented).toBe(inner)
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

  test('a box with ROUNDED CORNERS is still a box', async ({ page }) => {
    // How most people draw a box quickly. A rounded corner is three or four
    // small turns over an arc, and judged individually none of them is square.
    await openRoom(page, roomId('sk28'))
    await setSketchMode(page, true)
    await penStroke(page, [
      [300, 272],
      [303, 261],
      [311, 253],
      [322, 250],
      [498, 250],
      [509, 253],
      [517, 261],
      [520, 272],
      [520, 368],
      [517, 379],
      [509, 387],
      [498, 390],
      [322, 390],
      [311, 387],
      [303, 379],
      [300, 368],
      [300, 272],
    ])
    expect(await shapesByType(page)).toEqual({ diagramNode: 1 })
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

  test('A BRACKET ROUND TWO NODES is not a connection', async ({ page }) => {
    // The failure this whole feature exists to prevent, found by a reviewer
    // drawing it: a `[` drawn to group two boxes has both ends inside nodes and
    // is barely longer than the straight run between them, so it passed every
    // test the override had -- and the bracket was destroyed.
    await openRoom(page, roomId('sk27'))
    await addNode(page, 'A', { x: 200, y: 150, w: 160, h: 100 })
    await addNode(page, 'B', { x: 200, y: 320, w: 160, h: 100 })
    await setSketchMode(page, true)
    await penStroke(page, [
      [210, 160],
      [170, 160],
      [170, 285],
      [170, 410],
      [210, 410],
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

  test('its accessible name is not polluted by the state text', async ({ page }) => {
    // WCAG 2.5.3. The visible "On"/"Off" duplicates what aria-pressed already
    // says, and leaving it in the accessible name puts words there that are not
    // in the label a voice-control user reads out -- which breaks the exact user
    // the naming criterion is for.
    await openRoom(page, roomId('sk26'))
    const name = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="sketch-toggle"]')!
      const hidden = [...button.querySelectorAll('[aria-hidden="true"]')].map(
        (el) => el.textContent,
      )
      return { label: button.getAttribute('aria-label'), hidden }
    })
    expect(name.label).not.toMatch(/\b(on|off)\b/i)
    expect(name.hidden.join('')).toContain('Off')
  })

  test('a pentagon is not a node', async ({ page }) => {
    // Five corners of about 72 degrees passes every corner test; only the
    // bounding-box fill refuses it. A house, an arrow head, a cloud outline.
    await openRoom(page, roomId('sk25'))
    await setSketchMode(page, true)
    await penStroke(page, [
      [400, 240],
      [495, 309],
      [459, 421],
      [341, 421],
      [305, 309],
      [400, 240],
    ])
    expect(await shapesByType(page)).toEqual({ draw: 1 })
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
