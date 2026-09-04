import { test, expect } from '@playwright/test'
import { openRoom, shapeCount, shapeIds, newParticipant, drawBox, roomId } from './helpers'

test.describe('SPEC-002 FR-001 — the room server', () => {
  test('rejects a malformed room id with an error response, not a connection', async ({
    request,
  }) => {
    expect((await request.get('/api/connect/short')).status()).toBe(400)
    expect((await request.get('/api/connect/has%20space')).status()).toBe(400)
  })

  test('rejects an unknown api path', async ({ request }) => {
    expect((await request.get('/api/nope')).status()).toBe(404)
  })

  test('serves the SPA for a room URL rather than falling through to the worker', async ({
    request,
  }) => {
    // Guards the run_worker_first config: without it every room URL 404s, and a
    // room URL is the primary user-facing route.
    const res = await request.get(`/${roomId('spa')}`)
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('<div id="root">')
  })

  test('different room ids are isolated', async ({ browser }) => {
    const a = await newParticipant(browser)
    const b = await newParticipant(browser)
    const roomA = roomId('isoa')
    const roomB = roomId('isob')

    await openRoom(a.page, roomA)
    await openRoom(b.page, roomB)
    await drawBox(a.page, 100, 100)
    await expect.poll(() => shapeCount(a.page)).toBe(1)

    // Give any (incorrect) cross-room delivery time to arrive before asserting absence.
    await b.page.waitForTimeout(1500)
    expect(await shapeCount(b.page)).toBe(0)

    await a.ctx.close()
    await b.ctx.close()
  })
})

test.describe('SPEC-002 FR-002 — joining a room by URL', () => {
  test('a URL with no room id generates one and redirects', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => /^\/[A-Za-z0-9_-]{8,32}$/.test(window.location.pathname))
    expect(page.url()).toMatch(/\/[A-Za-z0-9_-]{8,32}$/)
  })

  test('a malformed room id shows the id error and never opens a canvas', async ({ page }) => {
    await page.goto('/short')
    await expect(page.getByTestId('room-error-id')).toBeVisible()
    await expect(page.getByTestId('canvas-host')).toHaveCount(0)
  })

  test('the generated room id is not remembered in client storage — the URL is the memory', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editor)
    const keys = await page.evaluate(() => Object.keys(localStorage))
    expect(keys.filter((k) => k.toLowerCase().includes('room'))).toEqual([])
  })
})

test.describe('SPEC-002 FR-003 — two clients converge', () => {
  test('shapes flow both ways, deletes propagate, and each sees the other as a collaborator', async ({
    browser,
  }) => {
    const room = roomId('conv')
    const a = await newParticipant(browser)
    const b = await newParticipant(browser)
    await openRoom(a.page, room)
    await openRoom(b.page, room)

    // A -> B
    await drawBox(a.page, 120, 120)
    await expect.poll(() => shapeCount(b.page), { timeout: 15_000 }).toBe(1)

    // B -> A
    await drawBox(b.page, 340, 260)
    await expect.poll(() => shapeCount(a.page), { timeout: 15_000 }).toBe(2)

    // Separate contexts mean separate storage, so tldraw derives distinct user
    // ids and each client counts the other as a collaborator.
    await expect
      .poll(() => a.page.evaluate(() => window.__editor!.getCollaborators().length), {
        timeout: 15_000,
      })
      .toBe(1)
    await expect
      .poll(() => b.page.evaluate(() => window.__editor!.getCollaborators().length), {
        timeout: 15_000,
      })
      .toBe(1)

    // Delete in A removes it in B
    await a.page.evaluate(() => {
      const ed = window.__editor!
      ed.deleteShapes([ed.getCurrentPageShapes()[0].id])
    })
    await expect.poll(() => shapeCount(b.page), { timeout: 15_000 }).toBe(1)

    await a.ctx.close()
    await b.ctx.close()
  })

  test('concurrent offline edits converge to identical documents', async ({ browser }) => {
    const room = roomId('conc')
    const a = await newParticipant(browser)
    const b = await newParticipant(browser)
    await openRoom(a.page, room)
    await openRoom(b.page, room)

    // Staged through the offline path rather than racing two live sockets --
    // a race makes this test flaky rather than meaningful.
    await a.ctx.setOffline(true)
    await b.ctx.setOffline(true)
    await drawBox(a.page, 50, 50)
    await drawBox(b.page, 400, 400)
    await a.ctx.setOffline(false)
    await b.ctx.setOffline(false)

    await expect.poll(() => shapeCount(a.page), { timeout: 20_000 }).toBe(2)
    await expect.poll(() => shapeCount(b.page), { timeout: 20_000 }).toBe(2)
    // Compare the documents, not a screenshot.
    expect(await shapeIds(a.page)).toEqual(await shapeIds(b.page))

    await a.ctx.close()
    await b.ctx.close()
  })
})

test.describe('SPEC-002 FR-004 — surviving disconnection', () => {
  test('the canvas stays editable while offline, and re-syncs on reconnect', async ({
    browser,
  }) => {
    const room = roomId('offl')
    const a = await newParticipant(browser)
    const b = await newParticipant(browser)
    await openRoom(a.page, room)
    await openRoom(b.page, room)

    await a.ctx.setOffline(true)
    // The criterion that keeps FR-002 and FR-004 consistent: disconnection is
    // NOT an error state. Unmounting here would destroy the edits below.
    await expect(a.page.getByTestId('room-offline')).toBeVisible({ timeout: 20_000 })
    await expect(a.page.getByTestId('canvas-host')).toBeVisible()
    await expect(a.page.getByTestId('room-error-sync')).toHaveCount(0)

    // Edits made locally while disconnected...
    await drawBox(a.page, 60, 60)
    expect(await shapeCount(a.page)).toBe(1)
    // ...and edits made by the other client during the interruption.
    await drawBox(b.page, 500, 300)

    await a.ctx.setOffline(false)
    await expect(a.page.getByTestId('room-offline')).toHaveCount(0, { timeout: 25_000 })

    // Both survive: A's offline edit reaches B, and B's edit reaches A.
    await expect.poll(() => shapeCount(a.page), { timeout: 25_000 }).toBe(2)
    await expect.poll(() => shapeCount(b.page), { timeout: 25_000 }).toBe(2)

    await a.ctx.close()
    await b.ctx.close()
  })

  test('edits are actually WRITTEN to durable storage, not just held in memory', async ({
    browser,
    request,
  }) => {
    // The distinction this test exists for: a Durable Object stays resident
    // between clients, so "reconnect and the shapes are there" passes even when
    // nothing has ever been persisted. tldraw 5.4 deprecated `initialSnapshot`
    // and `onDataChange` in favour of the `storage` option, and the deprecated
    // callback silently never fires -- which is exactly that failure. This
    // asserts against durable storage directly.
    const room = roomId('durb')
    const stored = async () =>
      (await (await request.get(`/api/dev/snapshot/${room}`)).json()) as {
        present: boolean
        documents: number
      }

    const p = await newParticipant(browser)
    await openRoom(p.page, room)

    // Connecting alone persists the room's initial document records, so wait for
    // that baseline rather than asserting emptiness -- whether the probe beats
    // the debounce is a race, and asserting on it makes the test flaky.
    await expect.poll(async () => (await stored()).present, { timeout: 15_000 }).toBe(true)
    const baseline = (await stored()).documents

    await drawBox(p.page, 150, 150)
    await expect.poll(() => shapeCount(p.page)).toBe(1)

    // The real assertion: the new shape reaches DURABLE storage. With the
    // deprecated onDataChange the callback never fires, `present` stays false,
    // and this poll times out.
    await expect
      .poll(async () => (await stored()).documents, { timeout: 15_000 })
      .toBeGreaterThan(baseline)

    await p.ctx.close()
  })

  test('room contents outlive every client disconnecting', async ({ browser }) => {
    const room = roomId('pers')
    const first = await newParticipant(browser)
    await openRoom(first.page, room)
    await drawBox(first.page, 200, 200)
    await expect.poll(() => shapeCount(first.page)).toBe(1)
    await first.page.waitForTimeout(1000) // let the debounced persist land
    await first.ctx.close()

    const later = await newParticipant(browser)
    await openRoom(later.page, room)
    await expect.poll(() => shapeCount(later.page), { timeout: 20_000 }).toBe(1)
    await later.ctx.close()
  })
})
