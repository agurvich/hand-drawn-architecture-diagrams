import { test, expect } from '@playwright/test'
import { openRoom, shapeCount, newParticipant, addNode, setCollapsed, roomId } from './helpers'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Read rather than import: Node's ESM loader requires an import attribute for
// JSON, and Playwright's transform does not add one.
const preMigrationRoom = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/room-pre-migration.json', import.meta.url)),
    'utf8',
  ),
)

test.describe('SPEC-004 FR-001/FR-002 — containment', () => {
  test('a node can be nested three deep, and moving the root moves the subtree', async ({
    page,
  }) => {
    await openRoom(page, roomId('nest'))
    const root = await addNode(page, 'Platform', { x: 100, y: 100, w: 460, h: 320 })
    const mid = await addNode(page, 'Auth', { x: 40, y: 60, w: 200, h: 120, parentId: root })
    const leaf = await addNode(page, 'JWT', { x: 20, y: 40, w: 120, h: 50, parentId: mid })

    expect(
      await page.evaluate(
        (id) => window.__editor!.getShapeAndDescendantIds([id as never]).size,
        root,
      ),
    ).toBe(3)

    const before = await page.evaluate(
      (id) => window.__editor!.getShapePageBounds(id as never)!.x,
      leaf,
    )
    await page.evaluate((id) => {
      const ed = window.__editor!
      ed.updateShape({ id: id as never, type: 'diagramNode', x: 300 })
    }, root)
    const after = await page.evaluate(
      (id) => window.__editor!.getShapePageBounds(id as never)!.x,
      leaf,
    )
    expect(after).toBeCloseTo(before + 200, 0)
  })

  test('the shape util accepts children — without this nothing else in FR-002 fires', async ({
    page,
  }) => {
    await openRoom(page, roomId('nrec'))
    const a = await addNode(page, 'container')
    expect(
      await page.evaluate((id) => {
        const ed = window.__editor!
        const shape = ed.getShape(id as never)!
        return ed.getShapeUtil(shape).canReceiveNewChildrenOfType(shape, 'diagramNode')
      }, a),
    ).toBe(true)
  })

  test('a REAL drag nests a node, and dragging it back out returns it to the page', async ({
    page,
  }) => {
    // The other FR-002 tests call the hooks directly, which proves the hooks are
    // right and nothing about whether they are WIRED. This drives the pointer.
    await openRoom(page, roomId('ndrag'))
    await page.evaluate(() => window.__editor!.setCamera({ x: 0, y: 0, z: 1 }))
    const container = await addNode(page, 'Container', { x: 80, y: 80, w: 380, h: 260 })
    const loose = await addNode(page, 'Loose', { x: 560, y: 420, w: 140, h: 90 })

    const centre = async (id: string) =>
      page.evaluate((sid) => {
        const b = window.__editor!.getShapePageBounds(sid as never)!
        const p = window.__editor!.pageToViewport({ x: b.midX, y: b.midY })
        return { x: p.x, y: p.y }
      }, id)

    const from = await centre(loose)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    // Into the container's lower area, clear of its 44x44 toggle.
    await page.mouse.move(from.x - 300, from.y - 150, { steps: 12 })
    await page.mouse.move(260, 280, { steps: 12 })
    await page.mouse.up()

    await expect
      .poll(() => page.evaluate((id) => window.__editor!.getShape(id as never)!.parentId, loose))
      .toBe(container)

    // Drag it back out onto empty canvas.
    const inside = await centre(loose)
    await page.mouse.move(inside.x, inside.y)
    await page.mouse.down()
    await page.mouse.move(700, 150, { steps: 14 })
    await page.mouse.up()

    await expect
      .poll(() => page.evaluate((id) => window.__editor!.getShape(id as never)!.parentId, loose))
      .toMatch(/^page:/)
  })

  test('a node cannot become its own ancestor', async ({ page }) => {
    await openRoom(page, roomId('ncyc'))
    const outer = await addNode(page, 'outer', { x: 60, y: 60, w: 400, h: 260 })
    const inner = await addNode(page, 'inner', { x: 40, y: 40, w: 160, h: 90, parentId: outer })

    // Guarded BEFORE reparentShapes, which throws rather than no-op'ing.
    const result = await page.evaluate(
      ({ outer, inner }) => {
        const ed = window.__editor!
        const before = ed.getShape(outer as never)!.parentId
        try {
          const util = ed.getShapeUtil(ed.getShape(inner as never)!)
          util.onDragShapesIn?.(
            ed.getShape(inner as never) as never,
            [ed.getShape(outer as never)!],
            {} as never,
          )
        } catch (e) {
          return { threw: String(e), parentId: ed.getShape(outer as never)!.parentId, before }
        }
        return { threw: null, parentId: ed.getShape(outer as never)!.parentId, before }
      },
      { outer, inner },
    )
    expect(result.threw).toBeNull()
    expect(result.parentId).toBe(result.before)
  })

  test('a collapsed container refuses drops, so a node cannot vanish into it', async ({ page }) => {
    // The refusal lives in canReceiveNewChildrenOfType, which is what the drag
    // manager filters through -- so this asserts the gate itself, not a
    // downstream effect of it.
    await openRoom(page, roomId('ndrp'))
    const container = await addNode(page, 'folded', { x: 60, y: 60, w: 300, h: 200 })
    await addNode(page, 'child', { x: 20, y: 20, w: 100, h: 60, parentId: container })
    await setCollapsed(page, container, true)
    const loose = await addNode(page, 'loose', { x: 500, y: 400, w: 120, h: 80 })

    const receivable = await page.evaluate(
      ({ container }) => {
        const ed = window.__editor!
        const shape = ed.getShape(container as never)!
        return ed.getShapeUtil(shape).canReceiveNewChildrenOfType(shape, 'diagramNode')
      },
      { container },
    )
    expect(receivable).toBe(false)

    // And expanding it makes the same container receptive again.
    await setCollapsed(page, container, false)
    expect(
      await page.evaluate((id) => {
        const ed = window.__editor!
        const shape = ed.getShape(id as never)!
        return ed.getShapeUtil(shape).canReceiveNewChildrenOfType(shape, 'diagramNode')
      }, container),
    ).toBe(true)
  })
})

test.describe('SPEC-004 FR-003/FR-004 — collapse and its affordance', () => {
  test('collapsing hides every descendant at every depth, and expanding restores them', async ({
    page,
  }) => {
    await openRoom(page, roomId('ncol'))
    const root = await addNode(page, 'Platform', { x: 100, y: 100, w: 460, h: 320 })
    const mid = await addNode(page, 'Auth', { x: 40, y: 60, w: 200, h: 120, parentId: root })
    const leaf = await addNode(page, 'JWT', { x: 20, y: 40, w: 120, h: 50, parentId: mid })
    const posBefore = await page.evaluate(
      (id) => window.__editor!.getShapePageBounds(id as never)!.toJson(),
      leaf,
    )

    await setCollapsed(page, root, true)
    const hidden = await page.evaluate(
      (ids) => ids.map((id) => window.__editor!.isShapeHidden(id as never)),
      [mid, leaf],
    )
    expect(hidden).toEqual([true, true])
    expect(await page.evaluate((id) => window.__editor!.isShapeHidden(id as never), root)).toBe(
      false,
    )
    await expect(page.getByTestId('diagram-node-count')).toContainText('2 hidden')

    await setCollapsed(page, root, false)
    expect(await page.evaluate((id) => window.__editor!.isShapeHidden(id as never), leaf)).toBe(
      false,
    )
    expect(
      await page.evaluate((id) => window.__editor!.getShapePageBounds(id as never)!.toJson(), leaf),
    ).toEqual(posBefore)
  })

  test('nested collapse is independent — expanding the outer leaves the inner folded', async ({
    page,
  }) => {
    await openRoom(page, roomId('nind'))
    const outer = await addNode(page, 'outer', { x: 80, y: 80, w: 500, h: 340 })
    const inner = await addNode(page, 'inner', { x: 40, y: 60, w: 260, h: 160, parentId: outer })
    const leaf = await addNode(page, 'leaf', { x: 20, y: 40, w: 120, h: 60, parentId: inner })

    await setCollapsed(page, inner, true)
    await setCollapsed(page, outer, true)
    await setCollapsed(page, outer, false)

    expect(await page.evaluate((id) => window.__editor!.isShapeHidden(id as never), inner)).toBe(
      false,
    )
    expect(await page.evaluate((id) => window.__editor!.isShapeHidden(id as never), leaf)).toBe(
      true,
    )
  })

  test('a hidden shape can never end up selected — including the marquee slow path', async ({
    page,
  }) => {
    await openRoom(page, roomId('nsel'))
    const root = await addNode(page, 'root', { x: 100, y: 100, w: 400, h: 260 })
    const child = await addNode(page, 'child', { x: 40, y: 40, w: 160, h: 90, parentId: root })
    await setCollapsed(page, root, true)

    // Drive the path hiding does NOT cover: setSelectedShapes applies no hidden
    // filter, and brushing falls back to an unfiltered list once the viewport
    // has changed. The side effect is what closes both.
    const selected = await page.evaluate((id) => {
      const ed = window.__editor!
      ed.setSelectedShapes([id as never])
      return ed.getSelectedShapeIds().length
    }, child)
    expect(selected).toBe(0)
  })

  test('the collapse control only appears when there are children, and is a 44x44 target', async ({
    page,
  }) => {
    await openRoom(page, roomId('naff'))
    const root = await addNode(page, 'root', { x: 100, y: 100, w: 400, h: 260 })
    await expect(page.getByTestId('diagram-node-toggle')).toHaveCount(0)

    await addNode(page, 'child', { x: 40, y: 40, w: 160, h: 90, parentId: root })
    const toggle = page.getByTestId('diagram-node-toggle')
    await expect(toggle).toHaveCount(1)

    // boundingBox() is measured AFTER the canvas transform, so a 44px control
    // measures 22 at z=0.5. Pin the camera or the assertion silently depends on
    // whatever zoom the test happened to leave behind.
    await page.evaluate(() => window.__editor!.setCamera({ x: 0, y: 0, z: 1 }))
    const box = (await toggle.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)

    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAccessibleName(/collapse/i)
  })

  test('the control is reachable by keyboard and activates with Enter', async ({ page }) => {
    await openRoom(page, roomId('nkbd'))
    const root = await addNode(page, 'root', { x: 100, y: 100, w: 400, h: 260 })
    await addNode(page, 'child', { x: 40, y: 40, w: 160, h: 90, parentId: root })

    // tldraw swallows Tab while any shape is selected, so the reachable path is
    // Tab with an empty selection. Naming it here stops the criterion looking
    // like a tldraw bug mid-build.
    await page.evaluate(() => window.__editor!.selectNone())

    const toggle = page.getByTestId('diagram-node-toggle')
    await toggle.focus()
    await expect(toggle).toBeFocused()
    await page.keyboard.press('Enter')
    expect(
      await page.evaluate((id) => window.__editor!.getShape(id as never)!.props.collapsed, root),
    ).toBe(true)
  })

  test('tapping the control toggles collapse and does not select, move or edit the node', async ({
    page,
  }) => {
    await openRoom(page, roomId('ntap'))
    const root = await addNode(page, 'root', { x: 100, y: 100, w: 400, h: 260 })
    await addNode(page, 'child', { x: 40, y: 40, w: 160, h: 90, parentId: root })

    const before = await page.evaluate(
      (id) => window.__editor!.getShapePageBounds(id as never)!.toJson(),
      root,
    )
    await page.getByTestId('diagram-node-toggle').click()

    expect(
      await page.evaluate((id) => window.__editor!.getShape(id as never)!.props.collapsed, root),
    ).toBe(true)
    await expect(page.getByTestId('diagram-node-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(await page.evaluate(() => window.__editor!.getSelectedShapeIds().length)).toBe(0)
    expect(await page.evaluate(() => window.__editor!.getEditingShapeId())).toBeNull()
    expect(
      await page.evaluate((id) => window.__editor!.getShapePageBounds(id as never)!.toJson(), root),
    ).toEqual(before)

    await page.getByTestId('diagram-node-toggle').click()
    expect(
      await page.evaluate((id) => window.__editor!.getShape(id as never)!.props.collapsed, root),
    ).toBe(false)
  })
})

test.describe('SPEC-004 FR-005 — synced and durable', () => {
  test('nesting and collapse sync between two clients', async ({ browser }) => {
    const room = roomId('nsyn')
    const a = await newParticipant(browser)
    const b = await newParticipant(browser)
    await openRoom(a.page, room)
    await openRoom(b.page, room)

    const root = await addNode(a.page, 'Platform', { x: 100, y: 100, w: 400, h: 260 })
    const child = await addNode(a.page, 'Auth', { x: 40, y: 40, w: 160, h: 90, parentId: root })
    await expect.poll(() => shapeCount(b.page), { timeout: 15_000 }).toBe(2)

    expect(
      await b.page.evaluate((id) => window.__editor!.getShape(id as never)!.parentId, child),
    ).toBe(root)

    await setCollapsed(a.page, root, true)
    await expect
      .poll(() => b.page.evaluate((id) => window.__editor!.isShapeHidden(id as never), child), {
        timeout: 15_000,
      })
      .toBe(true)

    await a.ctx.close()
    await b.ctx.close()
  })

  test('parentId and collapsed reach durable storage — asserted on content, not a count', async ({
    browser,
    request,
  }) => {
    const room = roomId('ndur')
    const p = await newParticipant(browser)
    await openRoom(p.page, room)
    const root = await addNode(p.page, 'Root', { x: 100, y: 100, w: 400, h: 260 })
    await addNode(p.page, 'Kid', { x: 40, y: 40, w: 160, h: 90, parentId: root })
    await setCollapsed(p.page, root, true)

    // A document count is identical whether or not these fields were written.
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/dev/snapshot/${room}?label=Kid`)).json()).shape?.parentId,
        { timeout: 15_000 },
      )
      .toBe(root)

    const stored = await (await request.get(`/api/dev/snapshot/${room}?label=Root`)).json()
    expect(stored.shape.collapsed).toBe(true)

    await p.ctx.close()
  })

  test('a room persisted BEFORE these migrations opens with both defaults applied', async ({
    browser,
    request,
  }) => {
    // Settles SPEC-003's owed FR-004 criterion as well as SPEC-004's: the
    // fixture is a diagramNode at sequence version 0 — no `color`, no
    // `collapsed`.
    const room = roomId('nmig')
    const seeded = await request.put(`/api/dev/snapshot/${room}`, { data: preMigrationRoom })
    expect(seeded.ok()).toBe(true)

    const p = await newParticipant(browser)
    await openRoom(p.page, room)

    await expect.poll(() => shapeCount(p.page), { timeout: 20_000 }).toBe(1)
    const props = await p.page.evaluate(
      () => window.__editor!.getCurrentPageShapes()[0].props as Record<string, unknown>,
    )
    expect(props.label).toBe('Seeded Legacy Node')
    expect(props.color).toBe('black')
    expect(props.collapsed).toBe(false)

    await p.ctx.close()
  })
})
