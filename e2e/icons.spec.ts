import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openRoom, roomId, addNode, setCollapsed, newParticipant, shapeCount } from './helpers'
import { ICON_KEYS } from '../src/shared/icons'

// Read rather than import: Node's ESM loader requires an import attribute for
// JSON, and Playwright's transform does not add one.
const preMigrationRoom = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/room-pre-migration.json', import.meta.url)),
    'utf8',
  ),
)

/** The icon key currently drawn on the one node on the page. */
async function iconKey(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(
    () =>
      document.querySelector('[data-testid="diagram-node-icon"]')?.getAttribute('data-icon') ??
      null,
  )
}

async function rename(page: import('@playwright/test').Page, id: string, label: string) {
  await page.evaluate(
    ({ id, label }) => {
      window.__editor!.updateShape({ id: id as never, type: 'diagramNode', props: { label } })
    },
    { id, label },
  )
  await page.waitForTimeout(150)
}

test.describe('SPEC-014 — an icon on every node', () => {
  test('a node gets an icon guessed from its label', async ({ page }) => {
    await openRoom(page, roomId('ic1'))
    await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    expect(await iconKey(page)).toBe('database')
  })

  test('an AWS service gets the REAL AWS icon, not a generic one', async ({ page }) => {
    await openRoom(page, roomId('ic2'))
    await addNode(page, 'S3 bucket', { x: 200, y: 200, w: 220, h: 120 })
    expect(await iconKey(page)).toBe('aws:s3')
    // And it is the vendored artwork, not a letterform stand-in.
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector('[data-testid="diagram-node-icon"] svg')
            ?.getAttribute('viewBox') ?? null,
      ),
    ).toBeTruthy()
  })

  test('RENAMING a node changes its icon', async ({ page }) => {
    // The behaviour the three states exist for. An implementation that wrote the
    // guess into the record at creation would look identical on day one and lose
    // this forever.
    await openRoom(page, roomId('ic3'))
    const node = await addNode(page, 'DB', { x: 200, y: 200, w: 220, h: 120 })
    expect(await iconKey(page)).toBe('database')

    await rename(page, node, 'Kafka queue')
    expect(await iconKey(page)).toBe('queue')

    await rename(page, node, 'Lambda')
    expect(await iconKey(page)).toBe('aws:lambda')
  })

  test('a PINNED icon does not change when the label does', async ({ page }) => {
    await openRoom(page, roomId('ic4'))
    const node = await addNode(page, 'DB', { x: 200, y: 200, w: 220, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.updateShape({
        id: id as never,
        type: 'diagramNode',
        props: { icon: 'rocket' },
      })
    }, node)
    await page.waitForTimeout(150)
    expect(await iconKey(page)).toBe('rocket')

    await rename(page, node, 'Kafka queue')
    expect(await iconKey(page)).toBe('rocket')
  })

  test('a node pinned to NONE draws no icon, and that is not the same as unset', async ({
    page,
  }) => {
    await openRoom(page, roomId('ic5'))
    const node = await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    expect(await iconKey(page)).toBe('database')

    await page.evaluate((id) => {
      window.__editor!.updateShape({
        id: id as never,
        type: 'diagramNode',
        props: { icon: 'none' },
      })
    }, node)
    await page.waitForTimeout(150)
    expect(await iconKey(page)).toBeNull()
    // The record still distinguishes it from automatic.
    expect(
      await page.evaluate(
        (id) => (window.__editor!.getShape(id as never)!.props as { icon: string }).icon,
        node,
      ),
    ).toBe('none')
  })

  test('a collapsed node still shows its icon', async ({ page }) => {
    // Collapse hides children, not identity.
    await openRoom(page, roomId('ic6'))
    const box = await addNode(page, 'Postgres', { x: 200, y: 200, w: 320, h: 220 })
    await addNode(page, 'child', { x: 20, y: 20, w: 100, h: 60, parentId: box })
    await setCollapsed(page, box, true)
    expect(await iconKey(page)).toBe('database')
  })

  test('the icon is hidden from assistive tech and never takes a tap', async ({ page }) => {
    await openRoom(page, roomId('ic7'))
    await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    expect(
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="diagram-node-icon"]')!
        return {
          hidden: el.getAttribute('aria-hidden'),
          events: getComputedStyle(el).pointerEvents,
        }
      }),
    ).toEqual({ hidden: 'true', events: 'none' })
  })

  test('the picker appears only while ONE node is selected', async ({ page }) => {
    await openRoom(page, roomId('ic9'))
    const a = await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    const b = await addNode(page, 'Kafka', { x: 500, y: 200, w: 220, h: 120 })
    await expect(page.getByTestId('icon-picker')).toHaveCount(0)

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, a)
    await expect(page.getByTestId('icon-picker')).toHaveCount(1)

    await page.evaluate(
      ({ a, b }) => {
        window.__editor!.setSelectedShapes([a as never, b as never])
      },
      { a, b },
    )
    await expect(page.getByTestId('icon-picker')).toHaveCount(0)
  })

  test('ALL THREE STATES are reachable from the picker', async ({ page }) => {
    // Or two of them are states the record can hold and nobody can produce.
    await openRoom(page, roomId('ic10'))
    const node = await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    const iconProp = () =>
      page.evaluate(
        (id) => (window.__editor!.getShape(id as never)!.props as { icon: string }).icon,
        node,
      )
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)

    // Pin one.
    await page.getByTestId('icon-picker-open').click()
    await page.locator('[data-testid="icon-picker-cell"][data-icon="rocket"]').click()
    expect(await iconProp()).toBe('rocket')
    expect(await iconKey(page)).toBe('rocket')

    // Pin to nothing.
    await page.getByTestId('icon-picker-open').click()
    await page.getByTestId('icon-picker-none').click()
    expect(await iconProp()).toBe('none')
    expect(await iconKey(page)).toBeNull()

    // Back to automatic, which re-guesses from the label.
    await page.getByTestId('icon-picker-open').click()
    await page.getByTestId('icon-picker-auto').click()
    expect(await iconProp()).toBe('')
    expect(await iconKey(page)).toBe('database')
  })

  test('pinning is ONE undoable step', async ({ page }) => {
    await openRoom(page, roomId('ic11'))
    const node = await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)
    await page.getByTestId('icon-picker-open').click()
    await page.locator('[data-testid="icon-picker-cell"][data-icon="rocket"]').click()
    expect(await iconKey(page)).toBe('rocket')

    await page.evaluate(() => {
      window.__editor!.undo()
    })
    expect(await iconKey(page)).toBe('database')
  })

  test('the picker lists EVERY icon, each with a name, every target 44x44', async ({ page }) => {
    // A grid of unlabelled pictures is unusable by anyone not looking at it, and
    // unaskable by voice.
    await openRoom(page, roomId('ic12'))
    const node = await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)
    await page.getByTestId('icon-picker-open').click()

    const cells = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="icon-picker-cell"]')].map((el) => {
        const r = el.getBoundingClientRect()
        return {
          key: el.getAttribute('data-icon') ?? '',
          name: el.getAttribute('aria-label') ?? '',
          w: r.width,
          h: r.height,
        }
      }),
    )
    /*
     * IDENTITY, not a floor. This was `>= 90` against 97 actual, so slicing
     * seven icons off the list left the whole suite green and seven icons
     * unpickable. `ICON_KEYS` is derived from the rule table, and the registry's
     * unit test already asserts the drawable set equals it in both directions --
     * so comparing the DOM against it here closes the loop from rule to pixel.
     */
    expect(cells.map((c) => c.key).sort()).toEqual([...ICON_KEYS].sort())
    expect(cells.filter((c) => c.name.trim() === '')).toEqual([])
    expect(cells.filter((c) => c.w < 44 || c.h < 44)).toEqual([])

    // The CONTROLS, not only the grid: the launcher and the two choices were
    // never measured, so a `<div role="button">` at 20px passed.
    const controls = await page.evaluate(() =>
      ['icon-picker-open', 'icon-picker-auto', 'icon-picker-none'].map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)!
        const r = el.getBoundingClientRect()
        return { id, tag: el.tagName, w: r.width, h: r.height }
      }),
    )
    expect(controls.filter((c) => c.w < 44 || c.h < 44)).toEqual([])
    // A real button, so it is in the tab order and Enter/Space activate it
    // without a handler of our own.
    expect(controls.map((c) => c.tag)).toEqual(['BUTTON', 'BUTTON', 'BUTTON'])
  })

  test('the picker works FROM THE KEYBOARD, and gives focus back', async ({ page }) => {
    await openRoom(page, roomId('ic14'))
    const node = await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)

    // Opened with the keyboard, never touched with a pointer.
    const open = page.getByTestId('icon-picker-open')
    await open.focus()
    await open.press('Enter')
    await page.getByTestId('icon-picker-sheet').waitFor()
    // Focus follows the sheet rather than staying behind it.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
      'icon-picker-sheet',
    )

    // ESCAPE dismisses, and focus comes back to the control that opened it.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('icon-picker-sheet')).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
      'icon-picker-open',
    )

    // And picking an icon unmounts the button focus is on -- without a handoff
    // that lands on <body> and a keyboard user is back at the top of the page.
    await open.press('Enter')
    await page.getByTestId('icon-picker-cell').first().waitFor()
    await page.locator('[data-icon="rocket"]').first().click()
    expect(await iconKey(page)).toBe('rocket')
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
      'icon-picker-open',
    )
  })

  test('selecting a DIFFERENT node does not re-present the open sheet', async ({ page }) => {
    await openRoom(page, roomId('ic15'))
    const first = await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    const second = await addNode(page, 'Redis', { x: 500, y: 200, w: 220, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, first)
    await page.getByTestId('icon-picker-open').click()
    await page.getByTestId('icon-picker-sheet').waitFor()

    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, second)
    // The component stays mounted across the change, so `open` survives unless
    // it is reset -- and a sheet nobody opened appears over the new selection.
    await expect(page.getByTestId('icon-picker-sheet')).toHaveCount(0)
  })

  test('a node too SMALL for both keeps its label and drops the icon', async ({ page }) => {
    // 40 is the sketch recogniser's own minimum box, so this size is reachable
    // by drawing one. With the icon in the line, `overflow: hidden` cut the
    // label's descenders off.
    await openRoom(page, roomId('ic16'))
    await addNode(page, 'DB', { x: 200, y: 200, w: 60, h: 40 })
    expect(await iconKey(page)).toBeNull()

    const fits = await page.evaluate(() => {
      const label = document.querySelector('.diagram-node__label')!
      const node = document.querySelector('[data-testid="diagram-node"]')!
      const l = label.getBoundingClientRect()
      const n = node.getBoundingClientRect()
      return l.top >= n.top - 0.5 && l.bottom <= n.bottom + 0.5 && label.textContent === 'DB'
    })
    expect(fits).toBe(true)
  })

  test('a node big enough shows the icon again', async ({ page }) => {
    await openRoom(page, roomId('ic17'))
    const node = await addNode(page, 'DB', { x: 200, y: 200, w: 60, h: 40 })
    expect(await iconKey(page)).toBeNull()
    await page.evaluate((id) => {
      window.__editor!.updateShape({
        id: id as never,
        type: 'diagramNode',
        props: { w: 160, h: 90 },
      })
    }, node)
    await expect.poll(() => iconKey(page)).toBe('database')
  })

  test('the picker does not cover any other control', async ({ page }) => {
    await openRoom(page, roomId('ic13'))
    const node = await addNode(page, 'Postgres', { x: 200, y: 200, w: 220, h: 120 })
    await page.evaluate((id) => {
      window.__editor!.setSelectedShapes([id as never])
    }, node)
    await page.getByTestId('icon-picker').waitFor()

    const covered = await page.evaluate(() => {
      const mine = document.querySelector('[data-testid="icon-picker"]')!.getBoundingClientRect()
      const hits: string[] = []
      for (const selector of [
        '[data-testid="diagram-io-open"]',
        '[data-testid="narration-open"]',
        '[data-testid="sketch-toggle"]',
        // Shares this exact origin, and is mutually exclusive with the picker by
        // selection -- so it is here to catch that stopping being true, not
        // because it can currently collide.
        '[data-testid="actor-control"]',
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
  })

  test('A ROOM PERSISTED BEFORE THIS MIGRATION opens with an icon', async ({
    browser,
    request,
  }) => {
    /*
     * Rooms persist. A prop added without a migration corrupts documents that
     * already exist, and does so QUIETLY -- the record fails validation at the
     * room boundary, or arrives without the field and every read of it is
     * undefined. Nothing in the rest of this suite can see that, because every
     * other test creates its nodes fresh.
     *
     * The fixture is a `diagramNode` at sequence version 0: no color, no
     * collapsed, no icon. It should open with all three defaulted -- and the
     * icon defaulted to AUTOMATIC, so it is guessed from the label the node has
     * always had rather than frozen at whatever migration time saw.
     */
    const room = roomId('imig')
    const seeded = await request.put(`/api/dev/snapshot/${room}`, { data: preMigrationRoom })
    expect(seeded.ok()).toBe(true)

    const p = await newParticipant(browser)
    await openRoom(p.page, room)
    await expect.poll(() => shapeCount(p.page), { timeout: 20_000 }).toBe(1)

    const props = await p.page.evaluate(
      () => window.__editor!.getCurrentPageShapes()[0]!.props as Record<string, unknown>,
    )
    expect(props.icon).toBe('')

    // And it renders: automatic means guessed from the label, live.
    expect(await iconKey(p.page)).not.toBeNull()

    await p.ctx.close()
  })

  test('an unmatched label still gets an icon', async ({ page }) => {
    await openRoom(page, roomId('ic8'))
    await addNode(page, 'Zzzz Qqqq', { x: 200, y: 200, w: 220, h: 120 })
    expect(await iconKey(page)).toBe('box')
  })
})
