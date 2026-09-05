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
  connectionCount,
  roomId,
} from './helpers'

const MINIMAL = JSON.stringify({
  version: 1,
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
    await addNode(page, 'Framed', { x: 10, y: 10, w: 60, h: 40, parentId: geo })

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

    await pasteDocument(page, JSON.stringify({ version: 1, nodes }))
    const first = await exportedJson(page)

    await pasteDocument(page, JSON.stringify({ version: 1, nodes: [...nodes].reverse() }))
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
        version: 1,
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

    await pasteDocument(page, '{ "version": 1, "nodes": [ { "id": "a" } ] }')
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

  test('every control is at least 44x44', async ({ page }) => {
    await openRoom(page, roomId('io8'))
    await page.getByTestId('diagram-io-open').click()
    for (const testId of ['diagram-io-close', 'diagram-io-copy', 'diagram-io-import']) {
      const box = await page.getByTestId(testId).boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })
})
