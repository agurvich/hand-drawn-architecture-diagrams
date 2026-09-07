import { test, expect, type Page } from '@playwright/test'
import {
  openRoom,
  roomId,
  addNode,
  addConnection,
  setCollapsed,
  newParticipant,
  addScene,
  viewScene,
  attributeConnection as attribute,
  actorLabels,
  actorOverflow,
} from './helpers'

/** Every binding on the page, as `type from->to`. */
async function bindings(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window
      .__editor!.store.allRecords()
      .filter((r) => r.typeName === 'binding')
      .map((r) => `${r.type as string} ${r.fromId as string}->${r.toId as string}`)
      .sort(),
  )
}

test.describe('SPEC-011 FR-001 — the binding and its lifecycle', () => {
  test('DELETING THE ACTOR leaves the connection, with both endpoints intact', async ({ page }) => {
    // The criterion that separates the two binding types, and the one that fails
    // if the endpoint util is copied: that one deletes the CONNECTION SHAPE when
    // a bound node goes. Deleting the IAM role must not delete the fact that one
    // bucket copies to another.
    await openRoom(page, roomId('ac1'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const role = await addNode(page, 'Role', { x: 350, y: 60, w: 160, h: 100 })
    const k = await addConnection(page, a, b)
    await attribute(page, k, role)
    expect(await actorLabels(page)).toEqual(['Role'])

    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, role)

    expect(
      await page.evaluate((id) => window.__editor!.getShape(id as never) !== undefined, k),
    ).toBe(true)
    expect(await bindings(page)).toEqual(
      [`connectionEndpoint ${k}->${b}`, `connectionEndpoint ${k}->${a}`].sort(),
    )
    expect(await actorLabels(page)).toEqual([])
  })

  test('deleting the connection leaves the actor node untouched', async ({ page }) => {
    await openRoom(page, roomId('ac2'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const role = await addNode(page, 'Role', { x: 350, y: 60, w: 160, h: 100 })
    const k = await addConnection(page, a, b)
    await attribute(page, k, role)

    await page.evaluate((id) => {
      window.__editor!.deleteShapes([id as never])
    }, k)

    expect(
      await page.evaluate((id) => window.__editor!.getShape(id as never) !== undefined, role),
    ).toBe(true)
    // NO BINDING SURVIVES POINTING AT A SHAPE THAT IS GONE.
    expect(await bindings(page)).toEqual([])
  })

  test('attributing again REPLACES rather than accumulates', async ({ page }) => {
    await openRoom(page, roomId('ac3'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const one = await addNode(page, 'One', { x: 300, y: 60, w: 160, h: 100 })
    const two = await addNode(page, 'Two', { x: 500, y: 60, w: 160, h: 100 })
    const k = await addConnection(page, a, b)

    await attribute(page, k, one)
    await attribute(page, k, two)

    // ENUMERATED, not counted.
    expect((await bindings(page)).filter((s) => s.startsWith('connectionActor'))).toEqual([
      `connectionActor ${k}->${two}`,
    ])
    expect(await actorLabels(page)).toEqual(['Two'])
  })

  test('the attribution reaches a second client', async ({ browser }) => {
    const room = roomId('ac4')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const a = await addNode(p1.page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(p1.page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const role = await addNode(p1.page, 'Role', { x: 350, y: 60, w: 160, h: 100 })
    const k = await addConnection(p1.page, a, b)
    await attribute(p1.page, k, role)

    await expect.poll(() => actorLabels(p2.page), { timeout: 15_000 }).toEqual(['Role'])

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('TWO actor bindings resolve deterministically, not to a blank line', async ({ page }) => {
    // Reachable: two clients attributing at the same moment each delete the
    // binding they can see and create a fresh one, and sync is last-write-wins
    // PER RECORD, so both survive. Counting them and calling two an error would
    // leave the line blank for both people.
    await openRoom(page, roomId('ac5'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const one = await addNode(page, 'One', { x: 300, y: 60, w: 160, h: 100 })
    const two = await addNode(page, 'Two', { x: 500, y: 60, w: 160, h: 100 })
    const k = await addConnection(page, a, b)

    const chosen = await page.evaluate(
      ({ k, one, two }) => {
        const ed = window.__editor!
        ed.run(() => {
          // THE LARGEST ID IS PLANTED FIRST, deliberately. With the smallest
          // created first, "smallest id" and "first in the array" agree, and an
          // implementation that just took the first would pass -- which is store
          // order, precisely the thing that need not match between two clients.
          ed.createBinding({
            id: 'binding:zzzzzzzz' as never,
            type: 'connectionActor',
            fromId: k as never,
            toId: two as never,
            props: {},
          })
          ed.createBinding({
            id: 'binding:aaaaaaaa' as never,
            type: 'connectionActor',
            fromId: k as never,
            toId: one as never,
            props: {},
          })
        })
        return null
      },
      { k, one, two },
    )
    void chosen

    // The SMALLEST binding id wins, matching merge.ts's representative rule --
    // two clients must draw the same label without coordinating.
    expect(await actorLabels(page)).toEqual(['One'])
  })
})

test.describe('SPEC-011 FR-002 — attributing, re-attributing, clearing', () => {
  const scene = async (page: Page) => {
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const role = await addNode(page, 'Role', { x: 350, y: 60, w: 160, h: 100 })
    const k = await addConnection(page, a, b)
    return { a, b, role, k }
  }

  test('the control appears only while one connection is selected', async ({ page }) => {
    await openRoom(page, roomId('ac6'))
    const { a, k } = await scene(page)
    await expect(page.getByTestId('actor-control')).toHaveCount(0)

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, a)
    await expect(page.getByTestId('actor-control')).toHaveCount(0)

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, k)
    await expect(page.getByTestId('actor-control')).toHaveCount(1)
  })

  test('clearing leaves the connection and both endpoints', async ({ page }) => {
    await openRoom(page, roomId('ac7'))
    const { a, b, role, k } = await scene(page)
    await attribute(page, k, role)
    await attribute(page, k, null)

    expect(await actorLabels(page)).toEqual([])
    expect(await bindings(page)).toEqual(
      [`connectionEndpoint ${k}->${b}`, `connectionEndpoint ${k}->${a}`].sort(),
    )
  })

  test('the connection id and its endpoints are unchanged throughout', async ({ page }) => {
    await openRoom(page, roomId('ac8'))
    const { a, b, role, k } = await scene(page)
    const other = await addNode(page, 'Other', { x: 350, y: 500, w: 160, h: 100 })
    const endpointsBefore = (await bindings(page)).filter((s) => s.startsWith('connectionEndpoint'))

    await attribute(page, k, role)
    await attribute(page, k, other)
    await attribute(page, k, null)

    expect(
      await page.evaluate((id) => window.__editor!.getShape(id as never) !== undefined, k),
    ).toBe(true)
    expect((await bindings(page)).filter((s) => s.startsWith('connectionEndpoint'))).toEqual(
      endpointsBefore,
    )
    void a
    void b
  })

  test('a connection may be attributed to ONE OF ITS OWN ENDPOINTS', async ({ page }) => {
    // "A writes to B, performed by A" is ordinary. Refusing it would be the tool
    // arguing with a true statement.
    await openRoom(page, roomId('ac9'))
    const { a, k } = await scene(page)
    await attribute(page, k, a)
    expect(await actorLabels(page)).toEqual(['A'])
  })

  test('ONE undo restores the PREVIOUS attribution, not no attribution', async ({ page }) => {
    // Two separate steps would clear it. The removal and the creation go inside
    // one run after one mark.
    await openRoom(page, roomId('ac10'))
    const { role, k } = await scene(page)
    const other = await addNode(page, 'Other', { x: 350, y: 500, w: 160, h: 100 })

    await attribute(page, k, role)
    await attribute(page, k, other)
    expect(await actorLabels(page)).toEqual(['Other'])

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    expect(await actorLabels(page)).toEqual(['Role'])
  })

  test('attributing to a tldraw shape writes nothing', async ({ page }) => {
    await openRoom(page, roomId('ac11'))
    const { k } = await scene(page)
    const geo = await page.evaluate(() => {
      const ed = window.__editor!
      const id = `shape:${Math.random().toString(36).slice(2, 12)}`
      ed.createShape({ id: id as never, type: 'geo', x: 350, y: 500, props: { w: 100, h: 80 } })
      return id
    })
    const before = await bindings(page)
    await page.evaluate(
      ({ k, geo }) => window.__actors!.attributeTo(window.__editor!, k as never, geo as never),
      { k, geo },
    )
    expect(await bindings(page)).toEqual(before)
  })
})

test.describe('SPEC-011 FR-003 — how an attributed connection reads', () => {
  test('the label is the actor CURRENT label, and follows a rename', async ({ page }) => {
    // Derived, never copied: renaming the actor updates every line attributed to
    // it with no write to any connection.
    await openRoom(page, roomId('ac12'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const role = await addNode(page, 'Role', { x: 350, y: 60, w: 160, h: 100 })
    const k = await addConnection(page, a, b)
    await attribute(page, k, role)

    await page.evaluate((id) => {
      window.__editor!.updateShape({
        id: id as never,
        type: 'diagramNode',
        props: { label: 'Renamed' },
      })
    }, role)

    await expect.poll(() => actorLabels(page)).toEqual(['Renamed'])
  })

  test('an unattributed connection shows nothing', async ({ page }) => {
    await openRoom(page, roomId('ac13'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    await addConnection(page, a, b)
    expect(await actorLabels(page)).toEqual([])
  })

  test('the actor icon HALO IS ACTUALLY PAINTED', async ({ page }) => {
    // On the running page's computed style. The merge badge shipped with an
    // inert halo because `--color-background` is defined nowhere, and both
    // obvious tests miss it: jsdom cannot resolve var() from a stylesheet, and a
    // screenshot test was weighed and rejected for this glyph.
    //
    // SPEC-015 moved the actor from SVG text to an icon in a `foreignObject`, so
    // the halo moved from stroke/paint-order to a box-shadow ring -- a different
    // mechanism with the same failure mode, hence the same test rather than none.
    await openRoom(page, roomId('ac14'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const role = await addNode(page, 'Role', { x: 350, y: 60, w: 160, h: 100 })
    const k = await addConnection(page, a, b)
    await attribute(page, k, role)

    const painted = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="diagram-connection-actor"]')!
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      return {
        shadow: style.boxShadow,
        background: style.backgroundColor,
        events: getComputedStyle(el.closest('.diagram-connection__actors')!).pointerEvents,
        width: box.width,
        height: box.height,
      }
    })
    // A `var()` that resolves to nothing leaves `box-shadow: 0 0 0 2px` with no
    // colour, which computes to `none` -- exactly the silent failure this catches.
    expect(painted.shadow).not.toBe('none')
    expect(painted.shadow).toMatch(/rgb/)
    expect(painted.background).toMatch(/rgb/)
    expect(painted.background).not.toBe('rgba(0, 0, 0, 0)')
    // And the glyph is actually laid out, not a zero-box `foreignObject` child.
    expect(painted.width).toBeGreaterThan(8)
    expect(painted.height).toBeGreaterThan(8)
    // A tap near the icons must still reach the line behind them.
    expect(painted.events).toBe('none')
  })

  test('an actor hidden by COLLAPSE shows the stand-in container', async ({ page }) => {
    await openRoom(page, roomId('ac15'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const box = await addNode(page, 'Platform', { x: 300, y: 40, w: 300, h: 200 })
    const role = await addNode(page, 'Role', { x: 20, y: 40, w: 160, h: 100, parentId: box })
    const k = await addConnection(page, a, b)
    await attribute(page, k, role)
    expect(await actorLabels(page)).toEqual(['Role'])

    await setCollapsed(page, box, true)
    // Naming something not on screen is naming nothing.
    await expect.poll(() => actorLabels(page)).toEqual(['Platform'])
  })

  test('an actor hidden by a SCENE shows the stand-in container too', async ({ page }) => {
    // A separate criterion from collapse because the natural implementation
    // passes that half and silently fails this one: collapse is read in more
    // than one place, and this label is a third consumer.
    await openRoom(page, roomId('ac16'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const box = await addNode(page, 'Platform', { x: 300, y: 40, w: 300, h: 200 })
    const role = await addNode(page, 'Role', { x: 20, y: 40, w: 160, h: 100, parentId: box })
    const k = await addConnection(page, a, b)
    await attribute(page, k, role)

    const sceneId = await addScene(page, 'Folded', { [box]: true }, { index: 'a1' })
    await viewScene(page, sceneId)

    await expect.poll(() => actorLabels(page)).toEqual(['Platform'])
  })
})

test.describe('SPEC-011 FR-003 — the control, and what it must not cover', () => {
  test('the control does not cover the JSON launcher or any tldraw UI', async ({ page }) => {
    // On OVERLAP, not coordinates. The first version sat top-centre with an
    // offset and a comment claiming the two "never coexist" -- but only the
    // EXPANDED json panel is conditional; the launcher button is always there,
    // and the control's box contained it entirely. Export was unreachable while
    // a connection was selected. Third time this corner has been fought over.
    await openRoom(page, roomId('ac21'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const k = await addConnection(page, a, b)
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, k)
    await page.getByTestId('actor-control').waitFor()

    const covered = await page.evaluate(() => {
      const mine = document.querySelector('[data-testid="actor-control"]')!.getBoundingClientRect()
      const hits: string[] = []
      for (const selector of [
        '[data-testid="diagram-io-open"]',
        '[data-testid="narration-open"]',
        '[data-testid="sketch-toggle"]',
        '.tlui-toolbar',
        '.tlui-menu-zone',
        '.tlui-navigation-panel',
      ]) {
        const el = document.querySelector(selector)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (
          mine.left < r.right &&
          mine.right > r.left &&
          mine.top < r.bottom &&
          mine.bottom > r.top
        )
          hits.push(selector)
      }
      return hits
    })
    expect(covered).toEqual([])

    // And the launcher is still the thing you actually hit.
    const onTop = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="diagram-io-open"]')!.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return el?.closest('[data-testid="diagram-io-open"]') !== null
    })
    expect(onTop).toBe(true)
  })

  test('the control fits a 375px viewport', async ({ page }) => {
    // A translate moves the box AFTER max-width resolves, so the first version
    // pushed 41px of itself off-screen where nothing could scroll to it.
    await page.setViewportSize({ width: 375, height: 812 })
    await openRoom(page, roomId('ac22'))
    const a = await addNode(page, 'A', { x: 40, y: 300, w: 120, h: 80 })
    const b = await addNode(page, 'B', { x: 220, y: 300, w: 120, h: 80 })
    const k = await addConnection(page, a, b)
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, k)
    const box = (await page.getByTestId('actor-control').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  })

  test('THE ACTOR NODE IS MARKED while its connection is selected', async ({ page }) => {
    // "Who does this" answered from the canvas as well as from the line.
    await openRoom(page, roomId('ac23'))
    const a = await addNode(page, 'A', { x: 100, y: 300, w: 160, h: 100 })
    const b = await addNode(page, 'B', { x: 600, y: 300, w: 160, h: 100 })
    const role = await addNode(page, 'Role', { x: 350, y: 60, w: 160, h: 100 })
    const k = await addConnection(page, a, b)
    await attribute(page, k, role)

    const marked = () =>
      page.evaluate(() => document.querySelectorAll('.diagram-node--performs').length)
    expect(await marked()).toBe(1)

    // On COMPUTED STYLE, not the class: a class that resolves to nothing is how
    // the merge count shipped with an invisible halo.
    const painted = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.diagram-node--performs')!)
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
    })
    expect(painted.style).not.toBe('none')
    expect(painted.width).toBeGreaterThan(0)

    await page.evaluate(() => {
      window.__editor!.selectNone()
    })
    expect(await marked()).toBe(0)
  })
})

test.describe('SPEC-011 FR-004 — merging', () => {
  const merged = async (page: Page) => {
    const box = await addNode(page, 'Platform', { x: 200, y: 100, w: 400, h: 400 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 80, parentId: box })
    const c2 = await addNode(page, 'C2', { x: 30, y: 200, w: 140, h: 80, parentId: box })
    const y = await addNode(page, 'Y', { x: 750, y: 250, w: 160, h: 100 })
    const one = await addNode(page, 'One', { x: 200, y: 560, w: 140, h: 80 })
    const two = await addNode(page, 'Two', { x: 400, y: 560, w: 140, h: 80 })
    const k1 = await addConnection(page, c1, y)
    const k2 = await addConnection(page, c2, y)
    return { box, k1, k2, one, two }
  }

  test('members that AGREE show that actor on the merged line', async ({ page }) => {
    await openRoom(page, roomId('ac17'))
    const { box, k1, k2, one } = await merged(page)
    await attribute(page, k1, one)
    await attribute(page, k2, one)
    await setCollapsed(page, box, true)

    await expect.poll(() => actorLabels(page)).toEqual(['One'])
    expect(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="diagram-connection-count"]').length,
      ),
    ).toBe(1)
  })

  test('members that DISAGREE show EVERY actor rather than none', async ({ page }) => {
    /*
     * REVERSED BY SPEC-015, and kept rather than replaced: showing nothing was a
     * defensible way to avoid claiming one of them, and the wrong outcome. The
     * whole point of folding a container is to see what crosses its boundary,
     * and who does the crossing is most of that.
     */
    await openRoom(page, roomId('ac18'))
    const { box, k1, k2, one, two } = await merged(page)
    await attribute(page, k1, one)
    await attribute(page, k2, two)
    await setCollapsed(page, box, true)

    await expect.poll(async () => (await actorLabels(page)).sort()).toEqual(['One', 'Two'])
    // Both on the ONE drawn line, not one each on two lines.
    expect(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="diagram-connection-actors"]').length,
      ),
    ).toBe(1)
  })

  test('the order is the same on two clients', async ({ browser }) => {
    // Two clients must draw the same line without coordinating, and the actors
    // are ordered by id under plain `<` for exactly that reason. Insertion order
    // is store order, which is the thing that differs between them.
    const room = roomId('ac26')
    const p1 = await newParticipant(browser)
    const p2 = await newParticipant(browser)
    await openRoom(p1.page, room)
    await openRoom(p2.page, room)

    const { box, k1, k2, one, two } = await merged(p1.page)
    await attribute(p1.page, k1, one)
    await attribute(p1.page, k2, two)
    await setCollapsed(p1.page, box, true)
    await expect.poll(() => actorLabels(p1.page), { timeout: 15_000 }).toHaveLength(2)
    await expect.poll(() => actorLabels(p2.page), { timeout: 15_000 }).toHaveLength(2)

    // Not `.sort()`: the ORDER is the claim.
    expect(await actorLabels(p2.page)).toEqual(await actorLabels(p1.page))

    await p1.ctx.close()
    await p2.ctx.close()
  })

  test('MORE THAN TWO actors collapse to `+N more`', async ({ page }) => {
    await openRoom(page, roomId('ac27'))
    const box = await addNode(page, 'Platform', { x: 200, y: 100, w: 400, h: 400 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 30, w: 140, h: 70, parentId: box })
    const c2 = await addNode(page, 'C2', { x: 30, y: 150, w: 140, h: 70, parentId: box })
    const c3 = await addNode(page, 'C3', { x: 30, y: 270, w: 140, h: 70, parentId: box })
    const y = await addNode(page, 'Y', { x: 750, y: 250, w: 160, h: 100 })
    const one = await addNode(page, 'One', { x: 150, y: 560, w: 120, h: 70 })
    const two = await addNode(page, 'Two', { x: 300, y: 560, w: 120, h: 70 })
    const three = await addNode(page, 'Three', { x: 450, y: 560, w: 120, h: 70 })
    await attribute(page, await addConnection(page, c1, y), one)
    await attribute(page, await addConnection(page, c2, y), two)
    await attribute(page, await addConnection(page, c3, y), three)
    await setCollapsed(page, box, true)

    // Two icons drawn, the third counted. Which two is the id order, not chance.
    await expect.poll(async () => (await actorLabels(page)).length).toBe(2)
    expect(await actorOverflow(page)).toBe('+1 more')
  })

  test('two actors in the SAME folded container count once', async ({ page }) => {
    // Both resolve to the container standing in for them, and showing it twice
    // would say two things cross the boundary when one does.
    await openRoom(page, roomId('ac28'))
    const box = await addNode(page, 'Platform', { x: 200, y: 100, w: 400, h: 400 })
    const c1 = await addNode(page, 'C1', { x: 30, y: 40, w: 140, h: 80, parentId: box })
    const c2 = await addNode(page, 'C2', { x: 30, y: 200, w: 140, h: 80, parentId: box })
    const y = await addNode(page, 'Y', { x: 750, y: 250, w: 160, h: 100 })
    const vault = await addNode(page, 'Vault', { x: 200, y: 560, w: 300, h: 200 })
    const one = await addNode(page, 'One', { x: 20, y: 40, w: 120, h: 60, parentId: vault })
    const two = await addNode(page, 'Two', { x: 20, y: 120, w: 120, h: 60, parentId: vault })
    await attribute(page, await addConnection(page, c1, y), one)
    await attribute(page, await addConnection(page, c2, y), two)
    await setCollapsed(page, box, true)
    await expect.poll(async () => (await actorLabels(page)).sort()).toEqual(['One', 'Two'])

    await setCollapsed(page, vault, true)
    await expect.poll(() => actorLabels(page)).toEqual(['Vault'])
    expect(await actorOverflow(page)).toBe(null)
  })

  test('EXPANDING restores each line its own attribution', async ({ page }) => {
    await openRoom(page, roomId('ac19'))
    const { box, k1, k2, one, two } = await merged(page)
    await attribute(page, k1, one)
    await attribute(page, k2, two)
    await setCollapsed(page, box, true)
    // One line, both actors on it.
    await expect.poll(async () => (await actorLabels(page)).sort()).toEqual(['One', 'Two'])
    expect(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="diagram-connection-actors"]').length,
      ),
    ).toBe(1)

    await setCollapsed(page, box, false)
    await expect.poll(async () => (await actorLabels(page)).sort()).toEqual(['One', 'Two'])
    // Now two lines with one each, which is what "its own" means.
    expect(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="diagram-connection-actors"]').length,
      ),
    ).toBe(2)
  })

  test('the CONTROL agrees with the line: a merged line names ALL of them', async ({ page }) => {
    /*
     * Found by using it. A merged line is drawn by one of its members -- the
     * representative -- and that is the only member you can hit-test, so
     * selecting a `x2` line selects it. The control read that member's own
     * binding and answered "One" while the canvas, one click away, showed
     * something else. Worse, choosing "Nobody in particular" from that reading
     * cleared the representative's REAL attribution and left every other
     * member's alone -- data lost by a person correcting something that was
     * wrong to begin with.
     *
     * SPEC-015 changed what the canvas says, so it changes what agreeing means:
     * the line now shows BOTH actors, and a `<select>` has no value for that, so
     * the several-actor case gets an option of its own. Leaving it empty would
     * be the same defect again, only with the reading too empty rather than too
     * confident.
     */
    await openRoom(page, roomId('ac24'))
    const { box, k1, k2, one, two } = await merged(page)
    await attribute(page, k1, one)
    await attribute(page, k2, two)
    await setCollapsed(page, box, true)
    await expect.poll(async () => (await actorLabels(page)).sort()).toEqual(['One', 'Two'])

    // Select the drawn line -- whichever member is representing it.
    await page.evaluate(() => {
      const ed = window.__editor!
      const visible = ed
        .getCurrentPageShapes()
        .filter((s) => s.type === 'diagramConnection' && !ed.isShapeHidden(s.id))
      ed.setSelectedShapes([visible[0]!.id])
    })
    await page.getByTestId('actor-control').waitFor()

    // It names what the LINE names, and it refuses to edit only one member.
    await expect(page.getByTestId('actor-select-several')).toHaveText('One, Two')
    expect(await page.getByTestId('actor-select').inputValue()).toBe('__several__')
    await expect(page.getByTestId('actor-select')).toBeDisabled()
    await expect(page.getByTestId('actor-control-merged')).toContainText('2 connections')

    // And both attributions are still there.
    await setCollapsed(page, box, false)
    await expect.poll(async () => (await actorLabels(page)).sort()).toEqual(['One', 'Two'])
  })

  test('a merged line whose members AGREE reads as that actor, still read-only', async ({
    page,
  }) => {
    await openRoom(page, roomId('ac25'))
    const { box, k1, k2, one } = await merged(page)
    await attribute(page, k1, one)
    await attribute(page, k2, one)
    await setCollapsed(page, box, true)
    await expect.poll(() => actorLabels(page)).toEqual(['One'])

    await page.evaluate(() => {
      const ed = window.__editor!
      const visible = ed
        .getCurrentPageShapes()
        .filter((s) => s.type === 'diagramConnection' && !ed.isShapeHidden(s.id))
      ed.setSelectedShapes([visible[0]!.id])
    })
    await page.getByTestId('actor-control').waitFor()
    expect(await page.getByTestId('actor-select').inputValue()).toBe(one)
    await expect(page.getByTestId('actor-select')).toBeDisabled()
  })

  test('the actor icons and the xN count DO NOT COLLIDE', async ({ page }) => {
    await openRoom(page, roomId('ac20'))
    const { box, k1, k2, one, two } = await merged(page)
    await attribute(page, k1, one)
    await attribute(page, k2, two)
    await setCollapsed(page, box, true)
    await expect.poll(async () => (await actorLabels(page)).length).toBe(2)

    const overlap = await page.evaluate(() => {
      const count = document
        .querySelector('[data-testid="diagram-connection-count"]')!
        .getBoundingClientRect()
      return [...document.querySelectorAll('[data-testid="diagram-connection-actor"]')].some(
        (el) => {
          const actor = el.getBoundingClientRect()
          return (
            count.left < actor.right &&
            count.right > actor.left &&
            count.top < actor.bottom &&
            count.bottom > actor.top
          )
        },
      )
    })
    expect(overlap).toBe(false)
  })
})
