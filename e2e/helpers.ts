import type { Page, BrowserContext, Browser } from '@playwright/test'

export function roomId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 32)
}

export async function shapeCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__editor?.getCurrentPageShapes().length ?? -1)
}

export async function shapeIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      window.__editor
        ?.getCurrentPageShapes()
        .map((s) => s.id)
        .sort() ?? [],
  )
}

/** Open a room and wait until the canvas is live (not the loading state). */
export async function openRoom(page: Page, id: string) {
  await page.goto(`/${id}`)
  await page.waitForSelector('[data-testid="canvas-host"]', { timeout: 30_000 })
  await page.waitForFunction(() => !!window.__editor, null, { timeout: 30_000 })
}

/**
 * A second participant. A separate BrowserContext gets its own storage, so
 * tldraw derives a DIFFERENT user id for it -- which is what makes collaborator
 * cursors observable. Two tabs in one context are one person.
 */
export async function newParticipant(
  browser: Browser,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  return { ctx, page }
}

/** Create a diagramNode, optionally parented to another shape. */
export async function addNode(
  page: Page,
  label: string,
  opts: { x?: number; y?: number; w?: number; h?: number; parentId?: string } = {},
): Promise<string> {
  return page.evaluate(
    ({ label, x, y, w, h, parentId }) => {
      const ed = window.__editor!
      const before = new Set(ed.getCurrentPageShapes().map((s) => s.id))
      ed.createShape({
        type: 'diagramNode',
        x: x ?? 100,
        y: y ?? 100,
        ...(parentId ? { parentId: parentId as never } : {}),
        props: { w: w ?? 200, h: h ?? 120, label, color: 'black', collapsed: false },
      })
      const created = ed.getCurrentPageShapes().find((s) => !before.has(s.id))
      return created!.id as string
    },
    { label, ...opts },
  )
}

export async function setCollapsed(page: Page, id: string, collapsed: boolean) {
  await page.evaluate(
    ({ id, collapsed }) => {
      window.__editor!.updateShape({ id: id as never, type: 'diagramNode', props: { collapsed } })
    },
    { id, collapsed },
  )
}

export async function drawBox(page: Page, x: number, y: number) {
  await page.evaluate(
    ([px, py]) => {
      window.__editor!.createShape({
        type: 'geo',
        x: px,
        y: py,
        props: { w: 100, h: 80, geo: 'rectangle' },
      })
    },
    [x, y],
  )
}
