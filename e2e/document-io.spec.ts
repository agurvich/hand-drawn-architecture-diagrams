import { test, expect, type Page } from '@playwright/test'
import {
  openRoom,
  newParticipant,
  addNode,
  addConnection,
  addHalfConnection,
  setCollapsed,
  drawBox,
  pageRecords,
  exportedJson,
  pasteDocument,
  pasteDocumentAndConfirm,
  sceneRecords,
  viewScene,
  addScene,
  connectionCount,
  roomId,
} from './helpers'

const MINIMAL = JSON.stringify({
  version: 2,
  nodes: [
    { id: 'a', label: 'A', x: 100, y: 100, w: 200, h: 120 },
    { id: 'b', label: 'B', x: 500, y: 100, w: 200, h: 120 },
  ],
  connections: [{ id: 'a-b', sourceId: 'a', targetId: 'b' }],
})

async function exported(page: Page) {
  return JSON.parse(await exportedJson(page)) as {
    version: number
    nodes: Array<Record<string, unknown>>
    connections: Array<Record<string, unknown>>
  }
}

test.describe('SPEC-007 FR-002 — export produces a stable, valid document', () => {
  test('a child position is parent-relative and a top-level one is absolute', async ({ page }) => {
    await openRoom(page, roomId('io1'))
    const container = await addNode(page, 'P', { x: 400, y: 300, w: 400, h: 260 })
    await addNode(page, 'X', { x: 40, y: 60, w: 160, h: 90, parentId: container })

    const doc = await exported(page)
    expect(doc.nodes.find((n) => n.label === 'P')).toMatchObject({ x: 400, y: 300 })
    expect(doc.nodes.find((n) => n.label === 'X')).toMatchObject({ x: 40, y: 60 })
  })

  test('hidden shapes are exported: a collapsed container keeps its descendants', async ({
    page,
  }) => {
    // Reading the RENDERING shape list instead would drop them, making collapse
    // and even scrolling destructive.
    await openRoom(page, roomId('io2'))
    const container = await addNode(page, 'P', { x: 400, y: 300, w: 400, h: 260 })
    await addNode(page, 'X', { x: 40, y: 60, w: 160, h: 90, parentId: container })
    const outside = await addNode(page, 'Y', { x: 80, y: 700 })
    await addConnection(page, outside, container)
    await setCollapsed(page, container, true)

    const doc = await exported(page)
    expect(doc.nodes.map((n) => n.label).sort()).toEqual(['P', 'X', 'Y'])
    expect(doc.nodes.find((n) => n.label === 'P')).toMatchObject({ collapsed: true })
  })

  test('a merged-away connection is still exported', async ({ page }) => {
    await openRoom(page, roomId('io3'))
    const y = await addNode(page, 'Y', { x: 80, y: 700 })
    const p = await addNode(page, 'P', { x: 500, y: 120, w: 400, h: 300 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 70, parentId: p })
    const c2 = await addNode(page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: p })
    await addConnection(page, c1, y)
    await addConnection(page, c2, y)
    await setCollapsed(page, p, true)

    // One line is drawn; both connections are in the document.
    const doc = await exported(page)
    expect(doc.connections).toHaveLength(2)
  })

  test('the three undocumentable cases are omitted, and the result still validates', async ({
    page,
  }) => {
    await openRoom(page, roomId('io4'))
    const a = await addNode(page, 'A', { x: 100, y: 100 })
    const b = await addNode(page, 'B', { x: 500, y: 100 })
    await addConnection(page, a, b)
    // 1. a half-bound connection
    await addHalfConnection(page, a)
    // 2. a shape the document cannot describe
    await drawBox(page, 200, 600)
    // 3. a node parented into that shape
    const geo = await page.evaluate(
      () => window.__editor!.getCurrentPageShapes().find((s) => s.type === 'geo')!.id as string,
    )
    await addNode(page, 'Scened', { x: 10, y: 10, w: 60, h: 40, parentId: geo })

    const doc = await exported(page)
    expect(doc.nodes.map((n) => n.label).sort()).toEqual(['A', 'B'])
    expect(doc.connections).toHaveLength(1)

    // And the export round-trips: importing it back leaves exactly the two
    // documentable nodes, with their ids intact, and drops the rest.
    await pasteDocument(page, JSON.stringify(doc))
    await page.getByTestId('diagram-io-confirm-yes').click()
    const nodes = (await pageRecords(page)).filter((r) => r.type === 'diagramNode')
    expect(nodes.map((r) => r.id).sort()).toEqual([a, b].sort())
    expect((await pageRecords(page)).filter((r) => r.type === 'geo')).toHaveLength(0)
  })

  test('the same diagram in two different array orders exports byte-identically', async ({
    page,
  }) => {
    // Ids have to be CONTROLLED for this to mean anything: hand-drawn shapes get
    // random ids, so an order comparison between two hand-built rooms compares
    // two random sort keys. Importing pins the ids, which is what lets the
    // property be stated at all.
    const nodes = [
      { id: 'c', label: 'C', x: 700, y: 100, w: 200, h: 120 },
      { id: 'a', label: 'A', x: 100, y: 100, w: 200, h: 120 },
      { id: 'b', label: 'B', x: 400, y: 100, w: 200, h: 120 },
    ]
    await openRoom(page, roomId('io5'))

    await pasteDocument(page, JSON.stringify({ version: 2, nodes }))
    const first = await exportedJson(page)

    await pasteDocument(page, JSON.stringify({ version: 2, nodes: [...nodes].reverse() }))
    const second = await exportedJson(page)

    expect(second).toBe(first)
    expect((JSON.parse(first) as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})

test.describe('SPEC-007 FR-003 — import replaces the page', () => {
  test('into an empty room, producing exactly the document', async ({ page }) => {
    await openRoom(page, roomId('im1'))
    await pasteDocument(page, MINIMAL)

    const records = await pageRecords(page)
    expect(
      records
        .filter((r) => r.type === 'diagramNode')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['shape:a', 'shape:b'])
    expect(records.filter((r) => r.type === 'diagramConnection').map((r) => r.id)).toEqual([
      'shape:a-b',
    ])
    expect(records.filter((r) => r.type === 'connectionEndpoint')).toHaveLength(2)
  })

  test('an author-chosen id survives, so loading does not rewrite the document', async ({
    page,
  }) => {
    await openRoom(page, roomId('im2'))
    await pasteDocument(
      page,
      JSON.stringify({
        version: 2,
        nodes: [{ id: 'web-server', label: 'Web', x: 0, y: 0, w: 200, h: 120 }],
      }),
    )
    const doc = await exported(page)
    expect(doc.nodes[0]!.id).toBe('web-server')
  })

  test('with only documentable shapes present it imports with NO confirmation', async ({
    page,
  }) => {
    await openRoom(page, roomId('im3'))
    const a = await addNode(page, 'Old', { x: 50, y: 50 })
    const b = await addNode(page, 'Older', { x: 400, y: 50 })
    await addConnection(page, a, b)

    await pasteDocument(page, MINIMAL)
    await expect(page.getByTestId('diagram-io-confirm')).toHaveCount(0)

    const nodes = (await pageRecords(page)).filter((r) => r.type === 'diagramNode')
    expect(nodes.map((r) => r.id).sort()).toEqual(['shape:a', 'shape:b'])
  })

  test('with undrawable shapes present it CONFIRMS first, naming how many', async ({ page }) => {
    await openRoom(page, roomId('im4'))
    await addNode(page, 'Keep', { x: 50, y: 50 })
    await drawBox(page, 300, 300)
    await drawBox(page, 500, 300)

    const before = await pageRecords(page)
    await pasteDocument(page, MINIMAL)
    await expect(page.getByTestId('diagram-io-confirm')).toContainText('2 shapes')
    // Nothing has happened yet.
    expect(await pageRecords(page)).toEqual(before)

    await page.getByTestId('diagram-io-confirm-yes').click()
    const nodes = (await pageRecords(page)).filter((r) => r.type === 'diagramNode')
    expect(nodes.map((r) => r.id).sort()).toEqual(['shape:a', 'shape:b'])
  })

  test('a HALF-BOUND connection counts as a loss, though it is a diagramConnection', async ({
    page,
  }) => {
    // The case a shape-type test would miss and the user would lose silently.
    await openRoom(page, roomId('im5'))
    const a = await addNode(page, 'A', { x: 50, y: 50 })
    await addHalfConnection(page, a)

    await pasteDocument(page, MINIMAL)
    await expect(page.getByTestId('diagram-io-confirm')).toContainText('1 shape')
  })

  test('dismissing the confirmation changes nothing at all', async ({ page }) => {
    await openRoom(page, roomId('im6'))
    await addNode(page, 'Keep', { x: 50, y: 50 })
    await drawBox(page, 300, 300)

    const before = await pageRecords(page)
    await pasteDocument(page, MINIMAL)
    await page.getByTestId('diagram-io-confirm-no').click()

    expect(await pageRecords(page)).toEqual(before)
    expect(await page.getByTestId('diagram-io-paste').inputValue()).toBe(MINIMAL)
  })

  test('ONE undo restores the page exactly, including the shapes the import deleted', async ({
    page,
  }) => {
    await openRoom(page, roomId('im7'))
    await addNode(page, 'Keep', { x: 50, y: 50 })
    await drawBox(page, 300, 300)

    const before = await pageRecords(page)
    await pasteDocument(page, MINIMAL)
    await page.getByTestId('diagram-io-confirm-yes').click()
    expect(await pageRecords(page)).not.toEqual(before)

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    expect(await pageRecords(page)).toEqual(before)
  })

  test('an INVALID document never reaches the store, and says why', async ({ page }) => {
    await openRoom(page, roomId('im8'))
    await addNode(page, 'Keep', { x: 50, y: 50 })
    const before = await pageRecords(page)

    await pasteDocument(page, '{ "version": 2, "nodes": [ { "id": "a" } ] }')
    await expect(page.getByTestId('diagram-io-error')).toContainText('nodes[0].label')
    expect(await pageRecords(page)).toEqual(before)
  })

  test('a document whose ids collide with the room imports cleanly', async ({ page }) => {
    await openRoom(page, roomId('im9'))
    await pasteDocument(page, MINIMAL)
    // Import the same document again: every id already exists. The page is
    // cleared first, so this is not a duplicate-id error -- asserted by the
    // panel having closed (it only closes on success) and the records being right.
    await pasteDocument(page, MINIMAL)
    await expect(page.getByTestId('diagram-io')).toHaveCount(0)
    expect((await pageRecords(page)).filter((r) => r.type === 'diagramNode')).toHaveLength(2)
  })

  test('the imported diagram reaches a second client, and both agree', async ({ browser }) => {
    const room = roomId('im10')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    await pasteDocument(p1.page, MINIMAL)
    await expect.poll(() => connectionCount(p2.page), { timeout: 15_000 }).toBe(1)
    expect(await pageRecords(p2.page)).toEqual(await pageRecords(p1.page))

    await p1.ctx.close()
    await p2.ctx.close()
  })
})

test.describe('SPEC-007 FR-004 — the manual path, which is the only one on an iPad', () => {
  test('reading the box in one room and pasting into another reproduces the diagram', async ({
    browser,
  }) => {
    // No navigator.clipboard anywhere in this test: over plain http on a LAN
    // address the API does not exist, so this is the path that has to work.
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, roomId('io6a'))
    await openRoom(p2.page, roomId('io6b'))

    const container = await addNode(p1.page, 'Platform', { x: 400, y: 200, w: 400, h: 300 })
    const child = await addNode(p1.page, 'Web', {
      x: 40,
      y: 60,
      w: 160,
      h: 90,
      parentId: container,
    })
    const db = await addNode(p1.page, 'DB', { x: 900, y: 300 })
    await addConnection(p1.page, child, db)
    await setCollapsed(p1.page, container, true)

    const json = await exportedJson(p1.page)
    await pasteDocument(p2.page, json)

    const shapeOf = (records: Awaited<ReturnType<typeof pageRecords>>) =>
      records.map((r) => `${r.type}:${r.parentId?.startsWith('shape:') ? 'child' : 'top'}`).sort()
    expect(shapeOf(await pageRecords(p2.page))).toEqual(shapeOf(await pageRecords(p1.page)))

    const a = await exported(p1.page)
    const b = await exported(p2.page)
    expect(b).toEqual(a)

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('the panel opens from a button, closes with Escape, and labels its boxes', async ({
    page,
  }) => {
    await openRoom(page, roomId('io7'))
    await page.getByTestId('diagram-io-open').click()
    await expect(page.getByLabel('This diagram')).toBeVisible()
    await expect(page.getByLabel('Paste a diagram to import')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('diagram-io')).toHaveCount(0)
  })

  test("the launcher does not cover any of tldraw's own UI", async ({ page }) => {
    // It used to sit at top-right, on top of two of the twelve colour swatches:
    // tapping violet opened this panel instead. Asserted on overlap rather than
    // on a position, so the next collision fails here too.
    await openRoom(page, roomId('io9'))
    const overlaps = await page.evaluate(() => {
      const launch = document
        .querySelector('[data-testid="diagram-io-open"]')!
        .getBoundingClientRect()
      const zones = [
        '.tlui-toolbar',
        '.tlui-style-panel',
        '.tlui-menu-zone',
        '.tlui-navigation-panel',
        '.tlui-helper-buttons',
      ]
      return zones.filter((selector) => {
        const el = document.querySelector(selector)
        if (!el) return false
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) return false
        return !(
          launch.right <= box.left ||
          launch.left >= box.right ||
          launch.bottom <= box.top ||
          launch.top >= box.bottom
        )
      })
    })
    expect(overlaps).toEqual([])
  })

  test('the panel fits a 375px viewport without clipping its own headings', async ({ page }) => {
    await openRoom(page, roomId('io10'))
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByTestId('diagram-io-open').click()
    const box = (await page.getByTestId('diagram-io').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
  })

  test('every control is at least 44x44, the dialog included', async ({ page }) => {
    await openRoom(page, roomId('io8'))
    await drawBox(page, 200, 200)
    await page.getByTestId('diagram-io-open').click()
    await page.getByTestId('diagram-io-paste').fill(MINIMAL)
    await page.getByTestId('diagram-io-import').click()
    // Including the confirmation's buttons, which the criterion exists for.
    for (const testId of [
      'diagram-io-close',
      'diagram-io-copy',
      'diagram-io-import',
      'diagram-io-confirm-yes',
      'diagram-io-confirm-no',
    ]) {
      const box = await page.getByTestId(testId).boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('SPEC-009 — scenes in the document', () => {
  const WITH_SCENES = JSON.stringify({
    version: 2,
    nodes: [
      { id: 'a', label: 'A', x: 100, y: 100, w: 200, h: 120 },
      { id: 'b', label: 'B', x: 500, y: 100, w: 200, h: 120 },
    ],
    connections: [{ id: 'a-b', sourceId: 'a', targetId: 'b' }],
    scenes: [
      { id: 'one', name: 'Outline', note: 'Start here.', collapsed: { a: true } },
      { id: 'two', name: 'Detail', highlighted: ['a-b'] },
    ],
  })

  test('a v1 document still imports, and means what it always meant', async ({ page }) => {
    // The version bump's whole risk. Documents exist in chats and in repos; a
    // format that breaks them is worse than one that never grew.
    await openRoom(page, roomId('sc1'))
    await pasteDocument(
      page,
      JSON.stringify({
        version: 1,
        nodes: [{ id: 'a', label: 'A', x: 0, y: 0, w: 200, h: 120 }],
        connections: [],
      }),
    )
    expect((await exported(page)).nodes).toHaveLength(1)
    expect((await exported(page)).version).toBe(2)
  })

  test('a v1 document carrying scenes is refused by VERSION, not by key', async ({ page }) => {
    await openRoom(page, roomId('sc2'))
    await pasteDocument(page, JSON.stringify({ version: 1, nodes: [], scenes: [] }))
    await expect(page.getByTestId('diagram-io-error')).toContainText(
      'document.version: scenes requires version 2',
    )
  })

  test('scenes survive a round trip and reach a second client', async ({ browser }) => {
    const room = roomId('sc3')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    await pasteDocument(p1.page, WITH_SCENES)

    await expect
      .poll(() => sceneRecords(p2.page).then((s) => s.map((x) => x.name)), { timeout: 15_000 })
      .toEqual(['Outline', 'Detail'])
    expect(await sceneRecords(p2.page)).toEqual(await sceneRecords(p1.page))

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('import REPLACES the room scenes, enumerated not counted', async ({ page }) => {
    await openRoom(page, roomId('sc4'))
    const a = await addNode(page, 'A', { x: 0, y: 0, w: 200, h: 120 })
    await addScene(page, 'Mine', { [a]: true }, { index: 'a1' })
    await addScene(page, 'Also mine', {}, { index: 'a2' })
    expect((await sceneRecords(page)).map((s) => s.name)).toEqual(['Mine', 'Also mine'])

    // Two scenes exist, so the gate opens -- and the helper that does not
    // confirm would leave the import undone and every assertion below vacuous.
    await pasteDocumentAndConfirm(page, WITH_SCENES)

    const after = await sceneRecords(page)
    expect(after.map((s) => s.name)).toEqual(['Outline', 'Detail'])
    expect(after.map((s) => s.id)).not.toContain('Mine')
    expect(after[0]!.note).toBe('Start here.')
    expect(after[0]!.collapsed).toEqual({ 'shape:a': true })
    expect(after[1]!.highlighted).toEqual(['shape:a-b'])
  })

  test('ONE undo brings the old scenes back with the old diagram', async ({ page }) => {
    await openRoom(page, roomId('sc5'))
    const a = await addNode(page, 'A', { x: 0, y: 0, w: 200, h: 120 })
    await addScene(page, 'Mine', { [a]: true }, { index: 'a1' })
    const before = await sceneRecords(page)
    const shapesBefore = await pageRecords(page)

    await pasteDocumentAndConfirm(page, WITH_SCENES)
    expect((await sceneRecords(page)).map((s) => s.name)).toEqual(['Outline', 'Detail'])

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    expect(await sceneRecords(page)).toEqual(before)
    expect(await pageRecords(page)).toEqual(shapesBefore)
  })

  test('array order in is array order out, on twelve scenes', async ({ page }) => {
    // Twelve, not three: the count at which a plausible index scheme first
    // scrambles, since 'a10' < 'a2'.
    await openRoom(page, roomId('sc6'))
    const names = Array.from({ length: 12 }, (_, i) => `Scene ${i + 1}`)
    await pasteDocument(
      page,
      JSON.stringify({
        version: 2,
        scenes: names.map((name, i) => ({ id: `s${i + 1}`, name })),
      }),
    )
    expect((await sceneRecords(page)).map((s) => s.name)).toEqual(names)
    expect((await exported(page)).scenes.map((s) => s.name)).toEqual(names)
  })

  test('a scene captured AFTER an import sorts last, not into the middle', async ({ page }) => {
    // The reason indices are minted with tldraw's own helpers rather than a
    // hand-rolled scheme: a different alphabet interleaves wrongly.
    await openRoom(page, roomId('sc7'))
    await pasteDocument(
      page,
      JSON.stringify({
        version: 2,
        scenes: Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, name: `Scene ${i + 1}` })),
      }),
    )
    await page.getByTestId('narration-open').click()
    await page.getByTestId('narration-capture').click()
    const names = (await sceneRecords(page)).map((s) => s.name)
    expect(names).toHaveLength(13)
    expect(names.at(-1)).toBe('Scene 13')
  })

  test('export, import, export again is identical', async ({ page }) => {
    await openRoom(page, roomId('sc8'))
    await pasteDocument(page, WITH_SCENES)
    const first = await exportedJson(page)
    await pasteDocumentAndConfirm(page, first)
    expect(await exportedJson(page)).toBe(first)
  })

  test('two exports of an unchanged room are byte-identical', async ({ page }) => {
    await openRoom(page, roomId('sc9'))
    await pasteDocument(page, WITH_SCENES)
    expect(await exportedJson(page)).toBe(await exportedJson(page))
  })

  test('a scene naming an undocumentable shape exports something that re-imports', async ({
    page,
  }) => {
    // A scene outlives what it names, and the export must never emit a document
    // its own validator would reject.
    await openRoom(page, roomId('sc10'))
    const a = await addNode(page, 'A', { x: 0, y: 0, w: 200, h: 120 })
    const half = await addHalfConnection(page, a)
    await addScene(page, 'Points at both', { [a]: true }, { highlighted: [half, 'shape:ghost'] })

    const json = await exportedJson(page)
    const doc = JSON.parse(json) as { scenes: Array<Record<string, unknown>> }
    expect(doc.scenes[0]!.highlighted).toBeUndefined()
    expect(doc.scenes[0]!.collapsed).toEqual({ [a.slice('shape:'.length)]: true })

    await pasteDocumentAndConfirm(page, json)
    await expect(page.getByTestId('diagram-io-error')).toHaveCount(0)
  })

  test('the off-scene set does not survive an import', async ({ page }) => {
    // An import preserves author-chosen ids, so a node the viewer had folded
    // off-scene would keep overriding the imported scene -- for them alone.
    await openRoom(page, roomId('sc11'))
    const a = await addNode(page, 'A', { x: 0, y: 0, w: 400, h: 300 })
    await addNode(page, 'child', { x: 20, y: 40, w: 120, h: 80, parentId: a })
    const scene = await addScene(page, 'Folded', { [a]: true }, { index: 'a1' })
    await viewScene(page, scene)
    await page.evaluate(
      (id) => window.__scenes!.takeOffSceneAndToggle(window.__editor!, { id: id as never }, true),
      a,
    )

    await pasteDocumentAndConfirm(
      page,
      JSON.stringify({
        version: 2,
        nodes: [
          { id: 'a', label: 'A', x: 0, y: 0, w: 400, h: 300 },
          { id: 'child', label: 'child', x: 20, y: 40, w: 120, h: 80, parentId: 'a' },
        ],
        scenes: [{ id: 'folded', name: 'Folded', collapsed: { a: true } }],
      }),
    )

    // Activating the imported scene puts the room in the state a viewer would
    // actually be in when the stale set would bite. The assertion itself is on
    // the RECORD's existence, which is what the import removes -- `viewScene`
    // only empties `nodeIds`, so the two are distinguishable.
    const imported = (await sceneRecords(page))[0]!.id
    await viewScene(page, imported)
    expect(
      await page.evaluate(() =>
        window.__editor!.store.allRecords().some((r) => r.typeName === 'diagramOffScene'),
      ),
    ).toBe(false)
  })
})
