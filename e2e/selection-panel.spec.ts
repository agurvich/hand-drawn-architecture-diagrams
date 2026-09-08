import { test, expect } from '@playwright/test'
import {
  addConnection,
  addNode,
  addScene,
  attributeConnection,
  offSceneNodeIds,
  openRoom,
  roomId,
  setCollapsed,
  setSketchMode,
  penStroke,
  viewScene,
} from './helpers'
import { CHROME_SELECTORS, PORTRAIT_ONLY } from './chromeRects'

/** Every chrome rect, as the dock's clearance test sees them. */
const rects = (page: import('@playwright/test').Page, selectors: readonly string[]) =>
  page.evaluate((sels) => {
    const out: { sel: string; r: number[] }[] = []
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el) => {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) return
        out.push({ sel, r: [b.left, b.top, b.right, b.bottom] })
      })
    }
    return out
  }, selectors as string[])

async function panelRect(page: import('@playwright/test').Page) {
  const box = await page.getByTestId('selection-panel').boundingBox()
  expect(box, 'the panel must EXIST before its clearance means anything').not.toBeNull()
  return box!
}

test.describe('SPEC-016 FR-001 — the panel appears with the selection', () => {
  test('nothing selected shows no panel; one node and one connection each show one', async ({
    page,
  }) => {
    await openRoom(page, roomId('sp1'))
    const a = await addNode(page, 'Alpha', { x: 100, y: 200, w: 160, h: 100 })
    const b = await addNode(page, 'Beta', { x: 100, y: 420, w: 160, h: 100 })
    const conn = await addConnection(page, a, b)

    await expect(page.getByTestId('selection-panel')).toHaveCount(0)

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, a)
    await expect(page.getByTestId('selection-heading')).toHaveText('Alpha')

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, conn)
    await expect(page.getByTestId('selection-heading')).toHaveText('Alpha → Beta')

    // Several selected is not a subject.
    await page.evaluate(
      ({ x, y }) => {
        window.__editor!.setSelectedShapes([x as never, y as never])
      },
      { x: a, y: b },
    )
    await expect(page.getByTestId('selection-panel')).toHaveCount(0)
  })

  test('a tldraw shape this app has no properties for shows no panel', async ({ page }) => {
    await openRoom(page, roomId('sp2'))
    const geo = await page.evaluate(() => {
      const ed = window.__editor!
      const id = `shape:${Math.random().toString(36).slice(2, 12)}`
      ed.createShape({ id: id as never, type: 'geo', x: 120, y: 200, props: { w: 80, h: 80 } })
      ed.setSelectedShapes([id as never])
      return id
    })
    expect(geo).toBeTruthy()
    await expect(page.getByTestId('selection-panel')).toHaveCount(0)
  })

  test('a HALF-BOUND connection names the end it has and says the other is loose', async ({
    page,
  }) => {
    await openRoom(page, roomId('sp3'))
    const a = await addNode(page, 'Alpha', { x: 100, y: 200, w: 160, h: 100 })
    const conn = await page.evaluate((from) => {
      const ed = window.__editor!
      const id = `shape:${Math.random().toString(36).slice(2, 12)}`
      ed.createShape({ id: id as never, type: 'diagramConnection', x: 0, y: 0 })
      ed.createBinding({
        type: 'connectionEndpoint',
        fromId: id as never,
        toId: from as never,
        props: { terminal: 'start' },
      })
      ed.setSelectedShapes([id as never])
      return id
    }, a)
    expect(conn).toBeTruthy()
    await expect(page.getByTestId('selection-heading')).toHaveText('Alpha →')
    await expect(page.getByTestId('selection-heading-note')).toContainText('not attached')
  })

  test('editing the label in the canvas hides the panel, and closing brings it back', async ({
    page,
  }) => {
    await openRoom(page, roomId('sp4'))
    const node = await addNode(page, 'Alpha', { x: 100, y: 200, w: 200, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)
    await expect(page.getByTestId('selection-panel')).toHaveCount(1)

    // The two rename surfaces must never be live together.
    await page.evaluate((id) => {
      window.__editor!.setEditingShape(id as never)
    }, node)
    await expect(page.getByTestId('selection-panel')).toHaveCount(0)
    await expect(page.getByTestId('diagram-node-input')).toHaveCount(1)

    await page.evaluate(() => {
      window.__editor!.setEditingShape(null)
    })
    await expect(page.getByTestId('selection-panel')).toHaveCount(1)
  })

  test('collapsing an ancestor removes the panel, because the selection is stripped', async ({
    page,
  }) => {
    await openRoom(page, roomId('sp5'))
    const outer = await addNode(page, 'Outer', { x: 60, y: 150, w: 320, h: 240 })
    const inner = await addNode(page, 'Inner', { x: 40, y: 40, w: 120, h: 80, parentId: outer })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, inner)
    await expect(page.getByTestId('selection-panel')).toHaveCount(1)

    await setCollapsed(page, outer, true)
    await expect(page.getByTestId('selection-panel')).toHaveCount(0)
  })

  test('the camera does not move the dock, and the canvas outside it still takes strokes', async ({
    page,
  }) => {
    await openRoom(page, roomId('sp6'))
    const node = await addNode(page, 'Alpha', { x: 100, y: 200, w: 160, h: 100 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)
    const before = await panelRect(page)

    await page.evaluate(() => {
      window.__editor!.setCamera({ x: -200, y: -120, z: 1 })
    })
    await page.waitForTimeout(150)
    const after = await panelRect(page)
    expect(Math.round(after.x)).toBe(Math.round(before.x))
    expect(Math.round(after.y)).toBe(Math.round(before.y))

    // A stroke begun outside the dock reaches the canvas.
    const drawn = await page.evaluate(() => window.__editor!.getCurrentPageShapes().length)
    await penStroke(page, [
      [120, 620],
      [200, 640],
      [260, 610],
    ])
    await expect
      .poll(() => page.evaluate(() => window.__editor!.getCurrentPageShapes().length))
      .toBeGreaterThan(drawn)
  })
})

test.describe('SPEC-016 FR-001 / FR-007 — the dock clears the chrome', () => {
  test('in every state that can collide', async ({ page }, testInfo) => {
    await openRoom(page, roomId('sp7'))
    const node = await addNode(page, 'Postgres', { x: 100, y: 200, w: 220, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)

    const check = async (label: string) => {
      const p = await panelRect(page)
      const hits = (await rects(page, CHROME_SELECTORS)).filter(
        (c) =>
          !(
            p.x + p.width <= c.r[0]! ||
            p.x >= c.r[2]! ||
            p.y + p.height <= c.r[1]! ||
            p.y >= c.r[3]!
          ),
      )
      expect(
        hits.map((h) => h.sel),
        `${label} @ ${testInfo.project.name}`,
      ).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
        testInfo.project.name === 'ipad-portrait' ? 820 : 1024,
      )
    }

    await check('sheet closed')

    await page.getByTestId('icon-picker-open').click()
    await expect(page.getByTestId('icon-picker-sheet')).toBeVisible()
    await check('sheet open')
    // The sheet must not widen the dock: `overflow-y: auto` forces `overflow-x`
    // to `auto`, so a 320px sheet in a 312px column gives it a scrollbar.
    const scroll = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="selection-panel"]') as HTMLElement
      return { w: el.scrollWidth, c: el.clientWidth, h: el.scrollHeight, ch: el.clientHeight }
    })
    expect(scroll.w).toBe(scroll.c)
    expect(scroll.h).toBeGreaterThan(scroll.ch)
    await page.getByTestId('icon-picker-open').click()

    // AFTER A RECOGNITION HAS ANNOUNCED. `recogniseOnDraw` writes the sketch
    // toggle's status region and never clears it, so `:not(:empty)` padding
    // makes that cluster permanently taller for the rest of the session -- a
    // clearance test in a fresh room measures the one state that cannot fail.
    // It also leaves the DRAW tool current, which is when tldraw's style panel
    // is tall, so this is what proves `--dock-top` follows it.
    await setSketchMode(page, true)
    await penStroke(page, [
      [120, 600],
      [300, 600],
      [300, 700],
      [120, 700],
      [120, 602],
    ])
    await expect(page.locator('#sketch-recognition-status')).not.toBeEmpty()
    await page.evaluate(() => {
      const ed = window.__editor!
      const n = ed.getCurrentPageShapes().find((s) => s.type === 'diagramNode')!
      ed.setSelectedShapes([n.id])
    })
    await check('after a recognition, draw tool still current')
  })

  test('each chrome selector resolves, so the clearance is not measured against nothing', async ({
    page,
  }, testInfo) => {
    await openRoom(page, roomId('sp8'))
    const found = await rects(page, CHROME_SELECTORS)
    const portrait = testInfo.project.name === 'ipad-portrait'
    for (const sel of CHROME_SELECTORS) {
      const n = found.filter((f) => f.sel === sel).length
      if (!portrait && PORTRAIT_ONLY.includes(sel)) {
        // tldraw keeps the quick actions in the TOP bar in landscape and only
        // moves them to the bottom below its TABLET_SM breakpoint. Asserted as
        // an expected zero so nobody "fixes" it, and so the selector going
        // stale in portrait is still caught below.
        expect(n, `${sel} is portrait-only`).toBe(0)
        continue
      }
      expect(n, `${sel} resolved to nothing — the clearance test would be vacuous`).toBeGreaterThan(
        0,
      )
    }
    // The whole reason the list uses querySelectorAll.
    expect(found.filter((f) => f.sel === '.tlui-toolbar').length).toBeGreaterThan(1)
  })

  test('the dock stands down while the JSON panel is expanded, and returns', async ({ page }) => {
    await openRoom(page, roomId('sp9'))
    const node = await addNode(page, 'Alpha', { x: 100, y: 200, w: 160, h: 100 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)
    await expect(page.getByTestId('selection-panel')).toHaveCount(1)

    await page.getByTestId('diagram-io-open').click()
    await expect(page.getByTestId('diagram-io')).toBeVisible()
    // `.diagram-io` is centred and 420px wide; no right-edge dock clears it.
    await expect(page.getByTestId('selection-panel')).toHaveCount(0)

    await page.getByTestId('diagram-io-close').click()
    await expect(page.getByTestId('selection-panel')).toHaveCount(1)
    expect(await page.evaluate(() => window.__editor!.getSelectedShapeIds().length)).toBe(1)
  })

  test('every control in the dock is at least 44x44', async ({ page }) => {
    await openRoom(page, roomId('sp10'))
    const a = await addNode(page, 'Alpha', { x: 100, y: 200, w: 220, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, a)
    const small = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="selection-panel"]')!
      const bad: string[] = []
      panel.querySelectorAll('button, input, select, a').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        if (r.width < 44 || r.height < 44)
          bad.push(`${el.tagName}.${(el as HTMLElement).dataset.testid ?? ''}`)
      })
      return bad
    })
    expect(small).toEqual([])
  })
})

test.describe('SPEC-016 FR-005 — what the node already is', () => {
  test('the actor line counts connections, and is absent when there are none', async ({ page }) => {
    await openRoom(page, roomId('sp11'))
    const role = await addNode(page, 'Role', { x: 100, y: 120, w: 160, h: 90 })
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 140, h: 90 })
    const b = await addNode(page, 'B', { x: 100, y: 460, w: 140, h: 90 })
    const conn = await addConnection(page, a, b)

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, role)
    await expect(page.getByTestId('selection-actor-of')).toHaveCount(0)

    await attributeConnection(page, conn, role)
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, role)
    await expect(page.getByTestId('selection-actor-of')).toContainText('Performs 1 connection')

    // Deleting the connection removes the line with no reselect.
    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, conn)
    await expect(page.getByTestId('selection-actor-of')).toHaveCount(0)
  })

  test('the scene line is SILENT for a node the scene has no opinion about', async ({ page }) => {
    await openRoom(page, roomId('sp12'))
    // A leaf node: `captureCollapsedMap` records only nodes that HAVE CHILDREN,
    // so the scene says nothing about this one and neither may the panel.
    const leaf = await addNode(page, 'Leaf', { x: 100, y: 200, w: 160, h: 100 })
    const parent = await addNode(page, 'Parent', { x: 100, y: 400, w: 260, h: 180 })
    await addNode(page, 'Child', { x: 30, y: 30, w: 100, h: 70, parentId: parent })
    // The scene names the PARENT and not the leaf, which is what
    // `captureCollapsedMap` would produce: it records only nodes that have
    // children. The leaf is the case the panel must stay silent about.
    const scene = await addScene(page, 'One', { [parent]: false })
    await viewScene(page, scene)

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, leaf)
    await expect(page.getByTestId('selection-scene-state')).toHaveCount(0)

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, parent)
    await expect(page.getByTestId('selection-scene-state')).toContainText('Matches the scene')
  })

  test('TOGGLING TWICE reads as matching again, though the node stays off-scene', async ({
    page,
  }) => {
    await openRoom(page, roomId('sp13'))
    const parent = await addNode(page, 'Parent', { x: 100, y: 200, w: 260, h: 180 })
    await addNode(page, 'Child', { x: 30, y: 30, w: 100, h: 70, parentId: parent })
    const scene = await addScene(page, 'One', { [parent]: false })
    await viewScene(page, scene)

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, parent)
    await expect(page.getByTestId('selection-scene-state')).toContainText('Matches the scene')

    // Through the node's own chevron, which is the gesture a person uses and
    // which passes the EFFECTIVE state rather than the raw prop. It stops
    // propagation, so it does not disturb the selection.
    const toggle = async () => {
      await page.getByTestId('diagram-node-toggle').first().click()
      await page.waitForTimeout(150)
    }
    await toggle()
    await expect(page.getByTestId('selection-scene-state')).toContainText('Changed away')

    // The off-scene set is ADD-ONLY, so after a second toggle the node is still
    // in it while its effective state matches the scene again. A line keyed on
    // membership would still say "changed away" here; this is the assertion
    // that fails such an implementation.
    await toggle()
    await expect(page.getByTestId('selection-scene-state')).toContainText('Matches the scene')
    expect(
      (await offSceneNodeIds(page)).length,
      'the node must still be off-scene, or this proves nothing',
    ).toBeGreaterThan(0)
  })
})
