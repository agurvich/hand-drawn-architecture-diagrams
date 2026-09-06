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

test.describe('SPEC-008 FR-002 / FR-005 — authoring and the surface', () => {
  test('capture takes the CURRENT EFFECTIVE view, and activates it', async ({ page }) => {
    await openRoom(page, roomId('sa1'))
    const { p, c1, c2 } = await diagram(page)
    await setCollapsed(page, p, true)

    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()

    // Active, and folding what was folded.
    await expect(page.getByTestId('narration-open')).toContainText('1/1')
    await setCollapsed(page, p, false)
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())
  })

  test('capture records containers only, and the scene survives its own prop changing', async ({
    page,
  }) => {
    await openRoom(page, roomId('sa2'))
    const { p } = await diagram(page)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()

    const captured = await page.evaluate(() => {
      const scene = window
        .__editor!.store.allRecords()
        .find((r) => r.typeName === 'diagramScene') as { collapsed: Record<string, boolean> }
      return Object.keys(scene.collapsed)
    })
    // Only P has children. Y, C1 and C2 are leaves and are not recorded.
    expect(captured).toEqual([p])
  })

  test('NO scene edit reaches the undo stack', async ({ page }) => {
    // Scenes are document-scoped and share the diagram's history, so without the
    // history-ignored rule, drawing a node after capturing and undoing twice
    // deletes the scene for everyone.
    await openRoom(page, roomId('sa3'))
    await diagram(page)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()

    // TWO marked edits, so two undos are two real steps. Programmatic setup
    // leaves no marks of its own, so without these the second undo rewinds past
    // the whole diagram -- the trap SPEC-005 recorded.
    const before = await pageRecords(page)
    const mark = () => page.evaluate(() => window.__editor!.markHistoryStoppingPoint())
    await mark()
    const first = await addNode(page, 'First', { x: 900, y: 900 })
    await mark()
    const second = await addNode(page, 'Second', { x: 1200, y: 900 })

    await page.evaluate(() => {
      window.__editor!.undo()
      window.__editor!.undo()
    })

    // Both nodes gone, the diagram back, and the SCENE untouched -- which is the
    // point, since it is document-scoped and shares this history stack.
    const after = await pageRecords(page)
    expect(after.some((r) => r.id === first || r.id === second)).toBe(false)
    expect(after).toEqual(before)
    await expect(page.getByTestId('narration-select')).toHaveCount(1)
  })

  test('rename, reorder, and step forward and back without opening the list', async ({ page }) => {
    await openRoom(page, roomId('sa4'))
    const { p } = await diagram(page)

    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    await page.getByTestId('narration-name').fill('Overview')
    await page.getByTestId('narration-name').blur()
    await setCollapsed(page, p, true)
    await page.getByTestId('narration-capture').click()
    await page.getByTestId('narration-name').fill('Detail')
    await page.getByTestId('narration-name').blur()
    await expect(page.getByTestId('narration-select')).toHaveCount(2)

    // Reorder, then close the list: stepping is the common action.
    await page.getByTestId('narration-up').nth(1).click()
    await expect(page.getByTestId('narration-select').first()).toContainText('Detail')
    await page.getByTestId('narration-close').click()

    // Detail is now first AND active, so back is correctly at the start.
    await expect(page.getByTestId('narration-open')).toContainText('1/2 Detail')
    await expect(page.getByTestId('narration-back')).toBeDisabled()

    await page.getByTestId('narration-forward').click()
    await expect(page.getByTestId('narration-open')).toContainText('2/2 Overview')
    // Stops at the end rather than wrapping.
    await expect(page.getByTestId('narration-forward')).toBeDisabled()
    await page.getByTestId('narration-back').click()
    await expect(page.getByTestId('narration-open')).toContainText('1/2 Detail')
  })

  test('deleting is confirmed, and leaves the diagram untouched', async ({ page }) => {
    await openRoom(page, roomId('sa5'))
    await diagram(page)
    const before = await pageRecords(page)

    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    await page.getByTestId('narration-delete').click()
    await expect(page.getByTestId('narration-confirm')).toBeVisible()

    await page.getByTestId('narration-confirm-no').click()
    await expect(page.getByTestId('narration-select')).toHaveCount(1)

    await page.getByTestId('narration-delete').click()
    await page.getByTestId('narration-confirm-yes').click()
    await expect(page.getByTestId('narration-select')).toHaveCount(0)
    expect(await pageRecords(page)).toEqual(before)
  })

  test('re-capturing keeps the id, name and position', async ({ page }) => {
    await openRoom(page, roomId('sa6'))
    const { p } = await diagram(page)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    await page.getByTestId('narration-name').fill('Kept')
    await page.getByTestId('narration-name').blur()

    const idBefore = await page.evaluate(
      () =>
        window.__editor!.store.allRecords().find((r) => r.typeName === 'diagramScene')!
          .id as string,
    )
    // The control, not the prop: while a scene is active, writing the prop
    // directly changes nothing on screen -- the scene still overrides it. That is
    // the lens working, and it is why re-capture must read the EFFECTIVE view.
    await page.getByTestId('diagram-node-toggle').first().click()
    await page.getByTestId('narration-recapture').click()

    const after = await page.evaluate(() => {
      const s = window.__editor!.store.allRecords().find((r) => r.typeName === 'diagramScene') as {
        id: string
        name: string
        collapsed: Record<string, boolean>
      }
      return { id: s.id, name: s.name, collapsed: s.collapsed }
    })
    expect(after.id).toBe(idBefore)
    expect(after.name).toBe('Kept')
    expect(after.collapsed[p]).toBe(true)
    expect(Object.keys(after.collapsed)).toEqual([p])
  })

  test('the off-scene marker appears, and restores', async ({ page }) => {
    await openRoom(page, roomId('sa7'))
    const { p, c1, c2 } = await diagram(page)
    await setCollapsed(page, p, true)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    await page.getByTestId('narration-close').click()

    // The region is permanently mounted so it can announce; its TEXT is the
    // signal, not its presence.
    await expect(page.getByTestId('narration-off-scene')).toHaveText('')
    await page.getByTestId('diagram-node-toggle').first().click()
    await expect(page.getByTestId('narration-off-scene')).toContainText('opened something')

    await page.getByTestId('narration-restore').click()
    await expect(page.getByTestId('narration-off-scene')).toHaveText('')
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())
  })

  test('stepping STOPS at the ends rather than wrapping', async ({ page }) => {
    // Asserted on stepScene itself, not on the disabled buttons: the panel
    // disables them, so through the UI the guard can never be reached, and
    // making it wrap left every test green.
    await openRoom(page, roomId('sw1'))
    await diagram(page)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    await page.getByTestId('narration-capture').click()
    await expect(page.getByTestId('narration-select')).toHaveCount(2)

    const step = (delta: -1 | 1) =>
      page.evaluate((d) => window.__scenes!.stepScene(window.__editor!, d as -1 | 1), delta)

    // On the second scene (capture activates). Forward again must not wrap.
    await expect(page.getByTestId('narration-open')).toContainText('2/2')
    await step(1)
    await expect(page.getByTestId('narration-open')).toContainText('2/2')

    await step(-1)
    await expect(page.getByTestId('narration-open')).toContainText('1/2')
    await step(-1)
    await expect(page.getByTestId('narration-open')).toContainText('1/2')
  })

  test('a note is written, shown while the scene is active, and kept by re-capture', async ({
    page,
  }) => {
    // The whole note path had no test: making updateScene ignore `note`
    // entirely left every one of these green.
    await openRoom(page, roomId('sn1'))
    const { p } = await diagram(page)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()

    await page.getByTestId('narration-note-input').fill('Start from the client and work inwards.')
    await page.getByTestId('narration-note-input').blur()
    await page.getByTestId('narration-close').click()
    await expect(page.getByTestId('narration-note')).toHaveText(
      'Start from the client and work inwards.',
    )

    // Re-capture keeps it, along with the name and the position.
    await page.getByTestId('diagram-node-toggle').first().click()
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-recapture').click()
    await expect(page.getByTestId('narration-note-input')).toHaveValue(
      'Start from the client and work inwards.',
    )
    const captured = await page.evaluate(() => {
      const s = window.__editor!.store.allRecords().find((r) => r.typeName === 'diagramScene') as {
        note: string
        collapsed: Record<string, boolean>
      }
      return s
    })
    expect(captured.note).toBe('Start from the client and work inwards.')
    expect(captured.collapsed[p]).toBe(true)
  })

  test('a scene with no note shows no note line', async ({ page }) => {
    await openRoom(page, roomId('sn2'))
    await diagram(page)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    await page.getByTestId('narration-close').click()
    await expect(page.getByTestId('narration-note')).toHaveCount(0)
  })

  test('SELECTING a scene from the list applies it, and marks it active', async ({ page }) => {
    // The list's primary action. Nothing clicked a row before this.
    await openRoom(page, roomId('sn3'))
    const { c1, c2 } = await diagram(page)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click() // scene 1: expanded
    // The control, not the prop: while scene 1 is active it overrides the prop,
    // so writing it directly changes nothing on screen and captures nothing new.
    await page.getByTestId('diagram-node-toggle').first().click()
    await page.getByTestId('narration-capture').click() // scene 2: folded

    // Scene 2 is active and folding P.
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([c1, c2].sort())
    await expect(page.getByTestId('narration-select').nth(1)).toHaveAttribute(
      'aria-current',
      'true',
    )

    await page.getByTestId('narration-select').first().click()
    expect(await hiddenShapeIds(page, 'diagramNode')).toEqual([])
    await expect(page.getByTestId('narration-select').first()).toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(page.getByTestId('narration-select').nth(1)).not.toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  test('capture takes the SELECTION as the highlight, and clears it when nothing is selected', async ({
    page,
  }) => {
    await openRoom(page, roomId('sn4'))
    const { y } = await diagram(page)
    await page.evaluate((id) => {
      window.__editor!.select(id as never)
    }, y)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()

    const highlighted = () =>
      page.evaluate(
        () =>
          (
            window.__editor!.store.allRecords().find((r) => r.typeName === 'diagramScene') as {
              highlighted: string[]
            }
          ).highlighted,
      )
    expect(await highlighted()).toEqual([y])

    await page.evaluate(() => {
      window.__editor!.selectNone()
    })
    await page.getByTestId('narration-recapture').click()
    expect(await highlighted()).toEqual([])
  })

  test('capturing clears the off-scene set', async ({ page }) => {
    await openRoom(page, roomId('sn5'))
    const { p } = await diagram(page)
    await setCollapsed(page, p, true)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    await page.getByTestId('diagram-node-toggle').first().click()
    expect(await offSceneNodeIds(page)).toEqual([p])

    await page.getByTestId('narration-capture').click()
    expect(await offSceneNodeIds(page)).toEqual([])
  })

  test('two clients agree on the ORDER, not just the count', async ({ browser }) => {
    const room = roomId('sn6')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)
    await diagram(p1.page)

    await p1.page.getByTestId('narration-open').click()
    for (const name of ['One', 'Two', 'Three']) {
      await p1.page.getByTestId('narration-capture').click()
      await p1.page.getByTestId('narration-name').fill(name)
      await p1.page.getByTestId('narration-name').blur()
    }
    await p1.page.getByTestId('narration-up').last().click()

    const names = (page: typeof p1.page) => page.getByTestId('narration-select').allTextContents()
    await p2.page.getByTestId('narration-open').click()
    await expect.poll(() => names(p2.page), { timeout: 15_000 }).toEqual(await names(p1.page))

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('the empty state says what a scene is for', async ({ page }) => {
    await openRoom(page, roomId('sa8'))
    await page.getByTestId('narration-open').click()
    await expect(page.getByTestId('narration-empty')).toContainText('step someone through')
    await expect(page.getByTestId('narration-list')).toHaveCount(0)
  })

  test('a stale scene is marked rather than presented as working', async ({ page }) => {
    await openRoom(page, roomId('sa9'))
    const { p } = await diagram(page)
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()

    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, p)
    await expect(page.getByTestId('narration-stale')).toBeVisible()
  })

  test('scenes are shared: a second client lists them identically', async ({ browser }) => {
    const room = roomId('sa10')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)
    await diagram(p1.page)

    await p1.page.getByTestId('narration-open').click()
    await p1.page.getByTestId('narration-capture').click()
    await p1.page.getByTestId('narration-name').fill('Shared')
    await p1.page.getByTestId('narration-name').blur()

    await p2.page.getByTestId('narration-open').click()
    await expect(p2.page.getByTestId('narration-select')).toHaveCount(1)
    await expect(p2.page.getByTestId('narration-select')).toContainText('Shared')
    // But B is not dragged to it.
    await expect(p2.page.getByTestId('narration-open')).toContainText('Scenes')

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test("the bar does not cover any of tldraw's own UI", async ({ page }) => {
    await openRoom(page, roomId('sa11'))
    const overlaps = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="narration-open"]')!.getBoundingClientRect()
      return [
        '.tlui-toolbar',
        '.tlui-style-panel',
        '.tlui-menu-zone',
        '.tlui-navigation-panel',
        '.tlui-helper-buttons',
      ].filter((selector) => {
        const el = document.querySelector(selector)
        if (!el) return false
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) return false
        return !(
          bar.right <= box.left ||
          bar.left >= box.right ||
          bar.bottom <= box.top ||
          bar.top >= box.bottom
        )
      })
    })
    expect(overlaps).toEqual([])
  })

  test('every control is at least 44x44', async ({ page }) => {
    await openRoom(page, roomId('sa12'))
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    for (const id of [
      'narration-back',
      'narration-forward',
      'narration-open',
      'narration-close',
      'narration-capture',
      'narration-select',
      'narration-delete',
      'narration-up',
      'narration-down',
      'narration-recapture',
    ]) {
      const box = await page.getByTestId(id).first().boundingBox()
      expect(box!.width, id).toBeGreaterThanOrEqual(44)
      expect(box!.height, id).toBeGreaterThanOrEqual(44)
    }
  })
})
