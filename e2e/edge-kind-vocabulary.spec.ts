import { test, expect } from '@playwright/test'
import {
  openRoom,
  newParticipant,
  addNode,
  addConnection,
  connectionKinds,
  openKindField,
  createKind,
  kindRecords,
  kindFieldLabels,
  strandPaint,
  pasteDocument,
  openPanel,
  exportedJson,
  roomId,
} from './helpers'

/**
 * SPEC-019 — the criteria that need a live browser, or two of them.
 *
 * jsdom resolves neither a computed `stroke` nor a real sync connection, and
 * nothing in this repo mounts a `ShapeUtil`'s `component()` under Testing
 * Library. The pure halves -- the overlay, the collision rules, the strand
 * geometry, the palette's contrast -- are unit-tested beside the code they
 * belong to.
 */

/** The palette hexes, as a browser reports them. */
const RGB = {
  orange: 'rgb(179, 92, 0)',
  green: 'rgb(47, 138, 47)',
  slate: 'rgb(91, 98, 112)',
  violet: 'rgb(114, 57, 179)',
  teal: 'rgb(13, 107, 125)',
  unresolved: 'rgb(38, 38, 38)',
}

async function twoNodesAndALine(page: import('@playwright/test').Page) {
  const a = await addNode(page, 'A', { x: 100, y: 100 })
  const b = await addNode(page, 'B', { x: 400, y: 100 })
  return addConnection(page, a, b)
}

test.describe('FR-001 — the vocabulary exists without being written', () => {
  test('a fresh room offers three kinds and holds NO kind record', async ({ page }) => {
    /*
     * THE CRITERION THAT FAILS IF SEEDING COMES BACK.
     *
     * SPEC-019's first review rejected seed-on-empty: undo, import and
     * hydration each reach an empty vocabulary, and each would re-seed `data`
     * behind a user who had renamed it. Seeds live in code and records only
     * override them, so a room nobody has touched has three kinds and zero
     * records.
     */
    await openRoom(page, roomId('kinds-fresh'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    expect(await kindFieldLabels(page)).toEqual(['data', 'permission', 'sequence'])
    expect(await kindRecords(page)).toEqual([])
  })

  test('a client JOINING a room reads a renamed seed, not the seed', async ({ page, browser }) => {
    /*
     * The hydration criterion, and its venue is the criterion: in a synced room
     * the store is empty before the first snapshot arrives, so "a room with no
     * kinds" is a claim about a moment. A test that pre-populates a store and
     * reads it back cannot see that, and would pass either way.
     */
    const room = roomId('kinds-hydrate')
    await openRoom(page, room)
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await page.getByTestId('kind-edit-data').click()
    await page.getByTestId('kind-form-label').fill('flows')
    await page.getByTestId('kind-form-save').click()
    await expect(page.getByTestId('kind-flows')).toBeVisible()

    const { ctx, page: second } = await newParticipant(browser)
    try {
      await openRoom(second, room)
      await openKindField(second, connection)
      await expect(second.getByTestId('kind-flows')).toBeVisible()
      // Not three plus one: the record replaced the seed rather than joining it.
      expect(await kindFieldLabels(second)).toEqual(['flows', 'permission', 'sequence'])
    } finally {
      await ctx.close()
    }
  })
})

test.describe('FR-002 / FR-003 — writing the vocabulary', () => {
  test('a created kind is available on every connection, and checks no box', async ({ page }) => {
    await openRoom(page, roomId('kinds-create'))
    const first = await twoNodesAndALine(page)
    const c = await addNode(page, 'C', { x: 100, y: 400 })
    const d = await addNode(page, 'D', { x: 400, y: 400 })
    const second = await addConnection(page, c, d)

    await openKindField(page, first)
    await createKind(page, 'enriches', 'violet', 'long')
    await expect(page.getByTestId('kind-enriches')).toBeVisible()
    // A new kind is a word in the vocabulary, not a claim about the line that
    // happened to be selected when it was invented.
    expect(await connectionKinds(page, first)).toEqual([])

    await openKindField(page, second)
    await expect(page.getByTestId('kind-enriches')).toBeVisible()
  })

  test('a rename rewrites every connection, as ONE undo step', async ({ page }) => {
    await openRoom(page, roomId('kinds-rename'))
    const first = await twoNodesAndALine(page)
    const c = await addNode(page, 'C', { x: 100, y: 400 })
    const d = await addNode(page, 'D', { x: 400, y: 400 })
    const second = await addConnection(page, c, d)

    await openKindField(page, first)
    await page.getByTestId('kind-data').check()
    await page.getByTestId('kind-sequence').check()
    await openKindField(page, second)
    await page.getByTestId('kind-data').check()
    expect(await connectionKinds(page, first)).toEqual(['data', 'sequence'])

    await page.getByTestId('kind-edit-data').click()
    await page.getByTestId('kind-form-label').fill('flows')
    await page.getByTestId('kind-form-save').click()
    await expect(page.getByTestId('kind-flows')).toBeVisible()

    // Both connections rewritten; `sequence` carried through untouched and the
    // result still in normal form.
    expect(await connectionKinds(page, first)).toEqual(['flows', 'sequence'])
    expect(await connectionKinds(page, second)).toEqual(['flows'])

    // ONE undo, not one per connection.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('kind-data')).toBeVisible()
    expect(await connectionKinds(page, first)).toEqual(['data', 'sequence'])
    expect(await connectionKinds(page, second)).toEqual(['data'])
  })

  test('undoing a CREATE leaves the label on the line, unresolved', async ({ page, browser }) => {
    /*
     * The one route by which a kind leaves the vocabulary while deletion is out
     * of scope. The answer to "what happens to the connections carrying it" is
     * NOTHING: the word stays, and the panel shows it rather than filtering it
     * out -- which is the failure FR-005 exists to prevent.
     *
     * TWO CLIENTS, and that is forced rather than chosen. Undo is per client and
     * a stack, so one client cannot undo its own create without first undoing
     * the check it made afterwards -- which would remove the label and make the
     * test pass for the wrong reason. The author creates the word; the reader
     * puts it on a line; the author undoes.
     */
    const room = roomId('kinds-undo-create')
    await openRoom(page, room)
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await createKind(page, 'enriches', 'violet', 'long')

    const { ctx, page: second } = await newParticipant(browser)
    try {
      await openRoom(second, room)
      await openKindField(second, connection)
      await second.getByTestId('kind-enriches').check()
      await expect.poll(() => connectionKinds(page, connection)).toEqual(['enriches'])

      await page.keyboard.press('ControlOrMeta+z')
      await expect.poll(() => kindRecords(page)).toEqual([])

      // Still carried, still visible on BOTH clients, still removable.
      expect(await connectionKinds(page, connection)).toEqual(['enriches'])
      for (const client of [page, second]) {
        const box = client.getByTestId('kind-enriches')
        await expect(box).toBeVisible()
        await expect(box).toHaveAttribute('data-unresolved', 'true')
      }
    } finally {
      await ctx.close()
    }
  })

  test('refuses a duplicate name and a duplicate colour-and-dash pair', async ({ page }) => {
    await openRoom(page, roomId('kinds-refuse'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)

    await page.getByTestId('kind-add').click()
    await page.getByTestId('kind-form-label').fill('DATA')
    await page.getByTestId('kind-form-save').click()
    await expect(page.getByTestId('kind-form-error')).toContainText('already a kind')
    expect(await kindRecords(page)).toEqual([])

    // Distinct name, but orange + solid is exactly `data`. Two kinds identical
    // in both channels are one kind to a reader.
    await page.getByTestId('kind-form-label').fill('enriches')
    await page.getByTestId('kind-form-colour-orange').click()
    await page.getByTestId('kind-form-dash').selectOption('solid')
    await page.getByTestId('kind-form-save').click()
    await expect(page.getByTestId('kind-form-error')).toContainText('colour and dash')
    expect(await kindRecords(page)).toEqual([])
  })

  test('allows a case-only rename', async ({ page }) => {
    // Without an id exclusion, capitalising a label collides with itself and is
    // refused with a message naming itself.
    await openRoom(page, roomId('kinds-case'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await page.getByTestId('kind-data').check()
    await page.getByTestId('kind-edit-data').click()
    await page.getByTestId('kind-form-label').fill('Data')
    await page.getByTestId('kind-form-save').click()
    await expect(page.getByTestId('kind-Data')).toBeVisible()
    expect(await connectionKinds(page, connection)).toEqual(['Data'])
  })

  test('offers no control that deletes a kind', async ({ page }) => {
    await openRoom(page, roomId('kinds-nodelete'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    const text = (await page.getByTestId('kind-field').innerText()).toLowerCase()
    expect(text).not.toMatch(/delete|remove/)
  })

  test('every control clears the 44px touch target on its own rect', async ({ page }) => {
    /*
     * SPEC-016's bar, measured the way its sweep measures it. The last time a
     * control was added here it was a 20px checkbox inside a 44px label, which
     * is a control the gate cannot verify.
     */
    await openRoom(page, roomId('kinds-touch'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await page.getByTestId('kind-add').click()
    const controls = page
      .getByTestId('kind-field')
      .locator('input:not([type=text]), button, select')
    for (let i = 0; i < (await controls.count()); i++) {
      const box = await controls.nth(i).boundingBox()
      expect(box, `control ${i} has no box`).not.toBeNull()
      expect(Math.round(box!.width), `control ${i} width`).toBeGreaterThanOrEqual(44)
      expect(Math.round(box!.height), `control ${i} height`).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('FR-004 — what the canvas paints', () => {
  test('paints a USER-CREATED kind in its palette colour and dash', async ({ page }) => {
    await openRoom(page, roomId('kinds-paint'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await createKind(page, 'enriches', 'violet', 'long')
    await page.getByTestId('kind-enriches').check()

    const strands = await strandPaint(page, connection)
    expect(strands).toHaveLength(1)
    expect(strands[0]!.stroke).toBe(RGB.violet)
    // Comma-separated: that is how a browser serialises `stroke-dasharray`,
    // whatever the attribute said.
    expect(strands[0]!.dash).toBe('12px, 5px')
    expect(strands[0]!.unresolved).toBe(false)
  })

  test('keeps the arrowhead on a kind whose name has a SPACE', async ({ page }) => {
    /*
     * Found by using the app, not by reading the diff, and no test in the
     * change could have caught it: the marker id went into `url(#arrow-…)`
     * with the raw label in it, and an unquoted `url()` token containing a
     * space is invalid CSS -- so the browser dropped `marker-end` and the
     * strand lost its arrowhead. On a directed diagram that is the direction
     * of the edge, silently gone.
     *
     * Asserted on the COMPUTED value. SPEC-018's marker test resolved the id
     * with `getElementById`, which succeeds even when the FuncIRI parse has
     * already failed -- a check that passes against the bug it claims to catch.
     *
     * Multi-word verbs are not an edge case: "reads from", "writes to" and
     * "flows to" are what the vocabulary that motivated this spec is made of.
     */
    await openRoom(page, roomId('kinds-spaces'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await createKind(page, 'flows to', 'violet', 'long')
    await page.getByTestId('kind-flows to').check()
    await page.getByTestId('kind-data').check()

    const strands = await strandPaint(page, connection)
    expect(strands).toHaveLength(2)
    for (const strand of strands) {
      expect(strand.markerEnd, `${strand.kind} lost its arrowhead`).not.toBe('none')
      expect(strand.markerEnd).toMatch(/^url\(/)
    }
  })

  test('highlights EVERY strand of a multi-kind line, not the middle one', async ({ page }) => {
    /*
     * The halo is one wide line behind the strands, and it was a fixed width
     * while the strands fan out by `KIND_STRAND_GAP` -- so on a long kind list
     * the outer strands sat entirely outside it and the line read as "that one
     * strand is highlighted".
     */
    await openRoom(page, roomId('kinds-halo'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await page.getByTestId('kind-data').check()
    await page.getByTestId('kind-permission').check()
    await page.getByTestId('kind-sequence').check()

    // Highlight it through a scene, which is the only thing that draws the halo.
    await page.evaluate((cid) => {
      window.__editor!.setSelectedShapes([])
      const store = window.__editor!.store
      const scene = {
        typeName: 'diagramScene',
        id: 'diagramScene:halo',
        name: 'halo',
        note: '',
        collapsed: {},
        highlighted: [cid],
        index: 'a1',
      }
      store.put([scene as never])
      store.put([
        {
          typeName: 'diagramSceneView',
          id: 'diagramSceneView:current',
          activeSceneId: 'diagramScene:halo',
        } as never,
      ])
    }, connection)

    const measured = await page.evaluate((cid) => {
      const svg = document.querySelector(
        `[data-shape-id="${cid}"] [data-testid="diagram-connection"]`,
      )!
      const halo = svg.querySelector('[data-testid="diagram-connection-halo"]')
      const ys = [...svg.querySelectorAll('[data-testid="diagram-connection-strand"]')].map((l) =>
        Number((l as SVGLineElement).getAttribute('y1')),
      )
      return {
        haloWidth: halo ? Number(getComputedStyle(halo).strokeWidth.replace('px', '')) : null,
        spread: Math.max(...ys) - Math.min(...ys),
      }
    }, connection)

    // Three strands really do fan out, or the rest of this asserts nothing.
    expect(measured.spread).toBeGreaterThan(0)
    expect(measured.haloWidth).not.toBeNull()
    // And the halo reaches past the OUTERMOST strand on both sides, rather than
    // covering the middle one and fringing the others.
    expect(measured.haloWidth!).toBeGreaterThan(measured.spread)
  })

  test('repaints on a RECOLOUR with no write to the connection', async ({ page }) => {
    await openRoom(page, roomId('kinds-recolour'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await page.getByTestId('kind-data').check()
    expect((await strandPaint(page, connection))[0]!.stroke).toBe(RGB.orange)

    await page.getByTestId('kind-edit-data').click()
    await page.getByTestId('kind-form-colour-teal').click()
    await page.getByTestId('kind-form-save').click()

    expect((await strandPaint(page, connection))[0]!.stroke).toBe(RGB.teal)
    // The line still says the same word; only what the word looks like changed.
    expect(await connectionKinds(page, connection)).toEqual(['data'])
  })

  test('draws an unresolved label rather than dropping it', async ({ page, browser }) => {
    /*
     * STRAND COUNT EQUALS LABEL COUNT is the assertion that fails if filtering
     * comes back. Reached the way a user reaches it: one client renames a kind
     * while another has the old word on a line.
     */
    const room = roomId('kinds-unresolved')
    await openRoom(page, room)
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await page.getByTestId('kind-data').check()
    await page.getByTestId('kind-permission').check()

    const { ctx, page: second } = await newParticipant(browser)
    try {
      await openRoom(second, room)
      await openKindField(second, connection)
      await second.getByTestId('kind-edit-data').click()
      await second.getByTestId('kind-form-label').fill('flows')
      await second.getByTestId('kind-form-save').click()
      await expect(page.getByTestId('kind-flows')).toBeVisible()
    } finally {
      await ctx.close()
    }

    // The rename rewrote the line, so re-create the drift deliberately: set the
    // old word back on the connection with the vocabulary no longer holding it.
    await page.evaluate((cid) => {
      window.__editor!.updateShape({
        id: cid as never,
        type: 'diagramConnection',
        props: { kinds: ['data', 'permission'] },
      } as never)
    }, connection)

    const strands = await strandPaint(page, connection)
    expect(strands).toHaveLength(2)
    const unresolved = strands.find((s) => s.kind === 'data')!
    expect(unresolved.unresolved).toBe(true)
    expect(unresolved.stroke).toBe(RGB.unresolved)
    // Never the accent, which is what `currentColor` would have resolved to on
    // a highlighted line -- the strand would vanish into its own halo.
    expect(unresolved.stroke).not.toBe('rgb(26, 95, 180)')
    expect(strands.find((s) => s.kind === 'permission')!.stroke).toBe(RGB.green)
  })

  test('names an unresolved label as unresolved in the accessible name', async ({ page }) => {
    await openRoom(page, roomId('kinds-aria'))
    const connection = await twoNodesAndALine(page)
    await page.evaluate((cid) => {
      window.__editor!.updateShape({
        id: cid as never,
        type: 'diagramConnection',
        props: { kinds: ['enriches'] },
      } as never)
    }, connection)
    const svg = page.locator(`[data-shape-id="${connection}"] [data-testid="diagram-connection"]`)
    await expect(svg).toHaveAttribute('aria-label', 'Kinds: enriches (not in the vocabulary)')
  })
})

test.describe('FR-005 — two clients', () => {
  test('a kind created on one client reaches the other, panel and canvas', async ({
    page,
    browser,
  }) => {
    /*
     * The premise of the whole architecture, and nothing else in this spec
     * asserts it. Domain state lives in the tldraw store, so a vocabulary one
     * person invents is one the other can use without a reload.
     */
    const room = roomId('kinds-sync')
    await openRoom(page, room)
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await createKind(page, 'enriches', 'violet', 'long')

    const { ctx, page: second } = await newParticipant(browser)
    try {
      await openRoom(second, room)
      await openKindField(second, connection)
      await expect(second.getByTestId('kind-enriches')).toBeVisible()
      await second.getByTestId('kind-enriches').check()

      // And the FIRST client's canvas paints it.
      await expect
        .poll(async () => (await strandPaint(page, connection))[0]?.stroke)
        .toBe(RGB.violet)
    } finally {
      await ctx.close()
    }
  })
})

test.describe('the document, which does not carry the vocabulary yet', () => {
  test('an import leaves the room’s kinds alone', async ({ page }) => {
    /*
     * A DECISION, not an omission. `documentIO` clears and re-puts scene
     * records right beside this, because scenes are IN the document; the
     * document carries no vocabulary at all, so an imported one is
     * authoritative about nothing here, and clearing the room's kinds because
     * the code beside it does would throw away something the import has no
     * replacement for.
     */
    await openRoom(page, roomId('kinds-import'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await createKind(page, 'enriches', 'violet', 'long')
    expect(await kindRecords(page)).toHaveLength(1)

    await openPanel(page)
    const json = await exportedJson(page)
    await pasteDocument(page, json)

    const records = await kindRecords(page)
    expect(records).toHaveLength(1)
    expect(records[0]!.label).toBe('enriches')
  })

  test('the export warning says the vocabulary is not carried either', async ({ page }) => {
    await openRoom(page, roomId('kinds-warning'))
    const connection = await twoNodesAndALine(page)
    await openKindField(page, connection)
    await page.getByTestId('kind-data').check()
    await openPanel(page)
    await expect(page.getByTestId('diagram-io-undocumented-kinds')).toContainText('vocabulary')
  })
})
