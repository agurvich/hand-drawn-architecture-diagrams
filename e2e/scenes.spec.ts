import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  openRoom,
  shapeCount,
  offSceneNodeIds,
  activeSceneId,
  newParticipant,
  addNode,
  addConnection,
  addScene,
  viewScene,
  hiddenShapeIds,
  pageRecords,
  visibleConnections,
  setCollapsed,
  roomId,
} from './helpers'

// Read rather than import: Node's ESM loader requires an import attribute for
// JSON, and Playwright's transform does not add one.
const preMigrationRoom = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/room-pre-migration.json', import.meta.url)),
    'utf8',
  ),
)

/**
 * SPEC-008 PR 1: the records and the lens.
 *
 * Scenes are driven directly through the store here — the authoring UI is PR 2.
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

test.describe('SPEC-008 FR-001 — the scene records', () => {
  test('a scene syncs to a second client and reaches durable storage', async ({
    browser,
    request,
  }) => {
    const room = roomId('fr1')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const sceneId = await addScene(p1.page, 'Overview', {}, { index: 'a2' })

    await expect
      .poll(() => p2.page.evaluate((id) => !!window.__editor!.store.get(id as never), sceneId), {
        timeout: 15_000,
      })
      .toBe(true)

    // On CONTENT, not a document count: a scene is neither a shape nor a
    // binding, so every existing probe field is blind to it.
    await expect
      .poll(
        async () =>
          (
            (await (await request.get(`/api/dev/snapshot/${room}`)).json()) as {
              scenes?: Array<{ name: string }>
            }
          ).scenes?.map((f) => f.name),
        { timeout: 20_000 },
      )
      .toEqual(['Overview'])

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('room contents outlive every client, scenes included', async ({ browser, request }) => {
    const room = roomId('fr2')
    const p1 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await addScene(p1.page, 'Survives')
    await expect
      .poll(
        async () =>
          (
            (await (await request.get(`/api/dev/snapshot/${room}`)).json()) as {
              scenes?: unknown[]
            }
          ).scenes?.length,
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
            window.__editor!.store.allRecords().filter((r) => r.typeName === 'diagramScene').length,
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

    const sceneId = await addScene(p1.page, 'Mine')
    await viewScene(p1.page, sceneId)
    await expect
      .poll(
        () =>
          p2.page.evaluate(
            () =>
              window.__editor!.store.allRecords().filter((r) => r.typeName === 'diagramScene')
                .length,
          ),
        { timeout: 15_000 },
      )
      .toBe(1)

    const viewRecords = await p2.page.evaluate(
      () =>
        window.__editor!.store.allRecords().filter((r) => r.typeName === 'diagramSceneView').length,
    )
    expect(viewRecords).toBe(0)

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('a room persisted before scenes existed opens cleanly and shows none', async ({
    browser,
    request,
  }) => {
    // ACTUALLY SEEDED, through the route SPEC-004 uses for its migration proof.
    // The first version of this test opened a fresh room and asserted zero
    // scenes -- trivially true, and unable to fail for the reason the criterion
    // exists: a snapshot persisted before the schema gained two record types.
    const room = roomId('fr4')
    const seeded = await request.put(`/api/dev/snapshot/${room}`, { data: preMigrationRoom })
    expect(seeded.ok()).toBe(true)

    const p = await newParticipant(browser)
    await openRoom(p.page, room)

    await expect.poll(() => shapeCount(p.page), { timeout: 20_000 }).toBe(1)
    expect(
      await p.page.evaluate(
        () =>
          window.__editor!.store.allRecords().filter((r) => r.typeName === 'diagramScene').length,
      ),
    ).toBe(0)
    await expect(p.page.getByTestId('diagram-node')).toHaveCount(1)
    await p.ctx.close()
  })
})

test.describe('SPEC-008 FR-003 — a scene is a lens, and never writes', () => {
  test('viewing a scene folds a container for this viewer', async ({ page }) => {
    await openRoom(page, roomId('fl1'))
    const { p, c1, c2 } = await diagram(page)

    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([])
    const sceneId = await addScene(page, 'Folded', { [p]: true })
    await viewScene(page, sceneId)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())
  })

  test('MERGING follows the scene — the claim the whole design rests on', async ({ page }) => {
    // Collapse is read twice: the visibility walk and the merge derivation. If
    // only one saw the scene, P would fold while the lines crossing its boundary
    // stayed unmerged, drawn to shapes no longer on screen.
    await openRoom(page, roomId('fl2'))
    const { y, p } = await diagram(page)

    expect(await visibleConnections(page)).toHaveLength(2)
    const sceneId = await addScene(page, 'Folded', { [p]: true })
    await viewScene(page, sceneId)

    const merged = await visibleConnections(page)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ start: p, end: y, count: 2 })
  })

  test('the container itself reads as folded — control, label and badge', async ({ page }) => {
    await openRoom(page, roomId('fl3'))
    const { p } = await diagram(page)
    const sceneId = await addScene(page, 'Folded', { [p]: true })
    await viewScene(page, sceneId)

    const toggle = page.getByTestId('diagram-node-toggle').first()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAttribute('aria-label', 'Expand container')
    await expect(toggle).toHaveText('+')
    await expect(page.getByTestId('diagram-node-count')).toHaveText('2 hidden')
  })

  test('NO shape record changes, before, during or after', async ({ page }) => {
    await openRoom(page, roomId('fl4'))
    const { p } = await diagram(page)

    // pageRecords returns only shape and binding records, so no filter is
    // needed -- and one would read as a guard that does not exist.
    const shapeRecords = () => pageRecords(page)
    const before = await shapeRecords()

    const sceneId = await addScene(page, 'Folded', { [p]: true })
    await viewScene(page, sceneId)
    expect(await shapeRecords()).toEqual(before)

    await viewScene(page, null)
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

    const sceneId = await addScene(p1.page, 'Folded', { [p]: true })
    await viewScene(p1.page, sceneId)
    expect(await hiddenShapeIds(p1.page, 'diagramNode')).toHaveLength(2)

    // B is untouched: same visible lines, nothing hidden at all.
    await expect.poll(() => hiddenShapeIds(p2.page)).toEqual([])
    expect(await visibleConnections(p2.page)).toHaveLength(2)

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('a scene can force-EXPAND a container whose own prop is collapsed', async ({ page }) => {
    await openRoom(page, roomId('fl6'))
    const { p, c1, c2 } = await diagram(page)
    await setCollapsed(page, p, true)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())

    const sceneId = await addScene(page, 'Open it', { [p]: false })
    await viewScene(page, sceneId)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([])
  })

  test('a container the scene does not name keeps its own prop', async ({ page }) => {
    await openRoom(page, roomId('fl7'))
    const { p, c1, c2 } = await diagram(page)
    await setCollapsed(page, p, true)

    const sceneId = await addScene(page, 'Silent', { 'shape:someone-else': true })
    await viewScene(page, sceneId)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())
  })

  test('a scene-folded container refuses drops, so a dropped node cannot vanish', async ({
    page,
  }) => {
    await openRoom(page, roomId('fl8'))
    const { p } = await diagram(page)
    const loose = await addNode(page, 'Loose', { x: 100, y: 100, w: 120, h: 80 })
    const sceneId = await addScene(page, 'Folded', { [p]: true })
    await viewScene(page, sceneId)

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

test.describe('SPEC-008 FR-004 — the history rules', () => {
  // The one thing PR 1 implements of FR-004, and the thing nothing was watching:
  // deleting the off-scene write entirely left all 186 unit and 117 e2e tests
  // green.

  test('the toggle takes the node off-scene, and ONE undo reverses both', async ({ page }) => {
    await openRoom(page, roomId('fh1'))
    const { p, c1, c2 } = await diagram(page)
    const sceneId = await addScene(page, 'Folded', { [p]: true })
    await viewScene(page, sceneId)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())

    // The control shows the EFFECTIVE state, so this reads "expand".
    await page.getByTestId('diagram-node-toggle').first().click()

    expect(await offSceneNodeIds(page)).toEqual([p])
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([])
    const own = () =>
      page.evaluate(
        (id) => (window.__editor!.getShape(id as never)!.props as { collapsed: boolean }).collapsed,
        p,
      )
    expect(await own()).toBe(false)

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    // BOTH reversed. Undoing only the prop would leave the node off-scene,
    // showing a state the user never asked for.
    expect(await offSceneNodeIds(page)).toEqual([])
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())
  })

  test('merely VIEWING a scene is not undoable', async ({ page }) => {
    // Measured, not theorised: tldraw's history filters on source, not on record
    // scope, so an unmarked session write fuses onto the reader's previous edit
    // and one undo throws them off the scene they were reading.
    await openRoom(page, roomId('fh2'))
    const { p } = await diagram(page)
    const sceneId = await addScene(page, 'Folded', { [p]: true })

    await page.evaluate((id) => {
      const ed = window.__editor!
      ed.markHistoryStoppingPoint()
      ed.updateShape({ id: id as never, type: 'diagramNode', props: { label: 'Payments' } })
    }, p)
    await viewScene(page, sceneId)

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    // The rename reverts; the reader stays exactly where they were.
    expect(
      await page.evaluate(
        (id) => (window.__editor!.getShape(id as never)!.props as { label: string }).label,
        p,
      ),
    ).toBe('P')
    expect(await activeSceneId(page)).toBe(sceneId)
  })

  test('undo after a toggle does not walk the reader backwards through the story', async ({
    page,
  }) => {
    await openRoom(page, roomId('fh3'))
    const { p } = await diagram(page)
    const f1 = await addScene(page, 'One', { [p]: true }, { index: 'a1' })
    const f2 = await addScene(page, 'Two', {}, { index: 'a2' })

    await viewScene(page, f1)
    await page.getByTestId('diagram-node-toggle').first().click()
    await viewScene(page, f2)

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    // Still on F2. The toggle's recorded diff must not carry activeSceneId --
    // which is why the two live in separate records.
    expect(await activeSceneId(page)).toBe(f2)
  })

  test('changing scenes clears the off-scene set', async ({ page }) => {
    // Otherwise the previous scene's overrides silently suppress the new scene's
    // values, and the reader sees a scene that is not the scene.
    await openRoom(page, roomId('fh4'))
    const { p } = await diagram(page)
    const f1 = await addScene(page, 'One', { [p]: true }, { index: 'a1' })
    const f2 = await addScene(page, 'Two', { [p]: true }, { index: 'a2' })

    await viewScene(page, f1)
    await page.getByTestId('diagram-node-toggle').first().click()
    expect(await offSceneNodeIds(page)).toEqual([p])

    await viewScene(page, f2)
    expect(await offSceneNodeIds(page)).toEqual([])
    expect(await hiddenShapeIds(page, 'diagramNode')).toHaveLength(2)
  })

  test('with NO scene active, a toggle records nothing off-scene', async ({ page }) => {
    // Otherwise every ordinary collapse appends forever and permanently defeats
    // the identity fast path in withEffectiveCollapsed.
    await openRoom(page, roomId('fh5'))
    await diagram(page)
    await page.getByTestId('diagram-node-toggle').first().click()
    expect(await offSceneNodeIds(page)).toEqual([])
  })
})
