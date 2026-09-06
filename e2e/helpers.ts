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

/**
 * Create a connection between two nodes, the way ConnectionTool does.
 *
 * `id` is for tests that care WHICH connection represents a merge group: the
 * representative is the smallest shape id, and the default random ids make that
 * a coin toss.
 */
export async function addConnection(
  page: Page,
  fromId: string,
  toId: string,
  id?: string,
): Promise<string> {
  return page.evaluate(
    ({ fromId, toId, id }) => {
      const ed = window.__editor!
      const rid = () => Math.random().toString(36).slice(2, 12)
      const cid = id ?? `shape:${rid()}`
      ed.run(() => {
        ed.createShape({ id: cid as never, type: 'diagramConnection', x: 0, y: 0 })
        ed.createBinding({
          id: `binding:${rid()}` as never,
          type: 'connectionEndpoint',
          fromId: cid as never,
          toId: fromId as never,
          props: { terminal: 'start' },
        })
        ed.createBinding({
          id: `binding:${rid()}` as never,
          type: 'connectionEndpoint',
          fromId: cid as never,
          toId: toId as never,
          props: { terminal: 'end' },
        })
      })
      return cid
    },
    { fromId, toId, id },
  )
}

/** Every binding in the store, for the FR-005 sweeps. */
export async function allBindings(
  page: Page,
): Promise<Array<{ id: string; type: string; fromId: string; toId: string }>> {
  return page.evaluate(() =>
    window
      .__editor!.store.allRecords()
      .filter((r) => r.typeName === 'binding')
      .map((b) => ({ id: b.id, type: b.type, fromId: b.fromId, toId: b.toId })),
  )
}

export async function connectionCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      window.__editor!.getCurrentPageShapes().filter((s) => s.type === 'diagramConnection').length,
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

/** The rendered geometry of a shape, as a comparable string. */
export async function shapeGeometry(page: Page, id: string): Promise<string> {
  return page.evaluate(
    (sid) => JSON.stringify(window.__editor!.getShapeGeometry(sid as never).bounds.toJson()),
    id,
  )
}

/**
 * Drag a connection endpoint onto a page point, the way a finger does.
 *
 * Driven through real pointer events rather than by calling the util directly:
 * the criterion is that dragging the handle re-binds, and a test that calls
 * onHandleDragEnd itself would pass against a shape whose handles the select
 * tool never reaches -- which is exactly how SPEC-005 shipped this unbuilt.
 *
 * Returns what was hinted mid-drag, so the hint criterion is asserted on
 * getHintingShapeIds rather than on pixels.
 */
export async function dragEndpoint(
  page: Page,
  connectionId: string,
  terminal: 'start' | 'end',
  to: { x: number; y: number },
): Promise<{ hintedMidDrag: string[] }> {
  const from = await page.evaluate(
    ({ connectionId, terminal }) => {
      const ed = window.__editor!
      ed.setCurrentTool('select')
      ed.select(connectionId as never)
      const shape = ed.getShape(connectionId as never)!
      const handle = ed.getShapeHandles(shape)!.find((h) => h.id === terminal)!
      const page = ed.getShapePageTransform(shape.id).applyToPoint(handle)
      const screen = ed.pageToScreen(page)
      return { x: screen.x, y: screen.y }
    },
    { connectionId, terminal },
  )
  const target = await page.evaluate((p) => {
    const screen = window.__editor!.pageToScreen(p)
    return { x: screen.x, y: screen.y }
  }, to)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + target.x) / 2, (from.y + target.y) / 2, { steps: 6 })
  await page.mouse.move(target.x, target.y, { steps: 6 })
  const hintedMidDrag = await page.evaluate(
    () => window.__editor!.getHintingShapeIds() as unknown as string[],
  )
  await page.mouse.up()
  return { hintedMidDrag }
}

/** Which connections are visible, and what each is drawn against. */
export async function visibleConnections(
  page: Page,
): Promise<Array<{ id: string; start: string | null; end: string | null; count: number }>> {
  return page.evaluate(() => {
    const ed = window.__editor!
    return ed
      .getCurrentPageShapes()
      .filter((s) => s.type === 'diagramConnection')
      .filter((s) => !ed.isShapeHidden(s.id))
      .map((s) => {
        const util = ed.getShapeUtil(s) as never as {
          nodeIdFor(shape: unknown, terminal: string): string | null
          mergeCount(shape: unknown): number
        }
        return {
          id: s.id as string,
          start: util.nodeIdFor(s, 'start'),
          end: util.nodeIdFor(s, 'end'),
          count: util.mergeCount(s),
        }
      })
      .sort((a, b) => (a.id < b.id ? -1 : 1))
  })
}

/**
 * Every shape and binding on the page, in full, sorted by id.
 *
 * Enumeration rather than a count: SPEC-007's import criteria are about what
 * the store holds before and after, and a count cannot tell "replaced" from
 * "replaced with something else".
 */
export async function pageRecords(
  page: Page,
): Promise<Array<{ id: string; type: string; parentId?: string; toId?: string }>> {
  return page.evaluate(() =>
    window
      .__editor!.store.allRecords()
      .filter((r) => r.typeName === 'shape' || r.typeName === 'binding')
      .map((r) =>
        r.typeName === 'shape'
          ? { id: r.id as string, type: r.type as string, parentId: r.parentId as string }
          : { id: r.id as string, type: r.type as string, toId: r.toId as string },
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  )
}

/** Open the JSON panel, tolerating it already being open. */
export async function openPanel(page: Page) {
  const launch = page.getByTestId('diagram-io-open')
  if ((await launch.count()) > 0) await launch.click()
  await page.getByTestId('diagram-io').waitFor()
}

/** The JSON the panel is showing for the current page. */
export async function exportedJson(page: Page): Promise<string> {
  await openPanel(page)
  const value = await page.getByTestId('diagram-io-export').inputValue()
  await page.getByTestId('diagram-io-close').click()
  return value
}

/** Paste a document into the panel and press Import. Does NOT confirm. */
export async function pasteDocument(page: Page, json: string) {
  await openPanel(page)
  await page.getByTestId('diagram-io-paste').fill(json)
  await page.getByTestId('diagram-io-import').click()
}

/** Create a connection bound at only one end — the mid-drag state. */
export async function addHalfConnection(page: Page, fromId: string): Promise<string> {
  return page.evaluate((from) => {
    const ed = window.__editor!
    const rid = () => Math.random().toString(36).slice(2, 12)
    const cid = `shape:${rid()}`
    ed.run(() => {
      ed.createShape({ id: cid as never, type: 'diagramConnection', x: 0, y: 0 })
      ed.createBinding({
        id: `binding:${rid()}` as never,
        type: 'connectionEndpoint',
        fromId: cid as never,
        toId: from as never,
        props: { terminal: 'start' },
      })
    })
    return cid
  }, fromId)
}

/**
 * Every scene record in the room, in index order.
 *
 * `pageRecords` filters to shapes and bindings, so scenes are INVISIBLE to it --
 * which is why the whole document-io suite could not see scene loss or scene
 * undo at all. `scenes.spec.ts` still inlines this filter in several places;
 * those predate this helper and are left alone rather than churned through a
 * reviewed file, but new assertions should come here.
 */
export async function sceneRecords(page: Page): Promise<
  Array<{
    id: string
    name: string
    note: string
    collapsed: Record<string, boolean>
    highlighted: string[]
  }>
> {
  return page.evaluate(() =>
    window
      .__editor!.store.allRecords()
      .filter((r) => r.typeName === 'diagramScene')
      .map((r) => ({
        id: r.id as string,
        name: r.name as string,
        note: r.note as string,
        collapsed: r.collapsed as Record<string, boolean>,
        highlighted: r.highlighted as string[],
        index: r.index as string,
      }))
      .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : a.id < b.id ? -1 : 1))
      .map(({ index: _index, ...rest }) => rest),
  )
}

/** Paste a document and confirm the replacement dialog. */
export async function pasteDocumentAndConfirm(page: Page, json: string) {
  await pasteDocument(page, json)
  await page.getByTestId('diagram-io-confirm-yes').click()
}

/** Create a scene record directly, without the authoring UI (which is PR 2). */
export async function addScene(
  page: Page,
  name: string,
  collapsed: Record<string, boolean> = {},
  opts: { highlighted?: string[]; index?: string } = {},
): Promise<string> {
  return page.evaluate(
    ({ name, collapsed, highlighted, index }) => {
      const ed = window.__editor!
      const id = `diagramScene:${Math.random().toString(36).slice(2, 12)}`
      ed.store.put([
        {
          typeName: 'diagramScene',
          id,
          name,
          note: '',
          collapsed,
          highlighted: highlighted ?? [],
          index: index ?? 'a1',
        } as never,
      ])
      return id
    },
    { name, collapsed, highlighted: opts.highlighted, index: opts.index },
  )
}

/**
 * Point this viewer at a scene, or at none. Session-scoped: never synced.
 *
 * Goes through the app's own `viewScene`, not a raw `store.put`. The whole point
 * of that function is that the write is history-IGNORED, and a test that wrote
 * the record directly would prove nothing about the thing under test.
 */
export async function viewScene(page: Page, sceneId: string | null) {
  await page.evaluate((id) => window.__scenes!.viewScene(window.__editor!, id), sceneId)
}

/** The nodes this viewer has taken off-scene. */
export async function offSceneNodeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const record = window.__editor!.store.get('diagramOffScene:current' as never) as
      { nodeIds: string[] } | undefined
    return [...(record?.nodeIds ?? [])].sort()
  })
}

/** Which scene this viewer is on, or null. */
export async function activeSceneId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const record = window.__editor!.store.get('diagramSceneView:current' as never) as
      { activeSceneId: string | null } | undefined
    return record?.activeSceneId ?? null
  })
}

/**
 * Which shapes this viewer currently has hidden.
 *
 * `type` matters more than it looks: folding a container also merges the
 * connections crossing its boundary, so the hidden set legitimately contains
 * connections too. A test about which NODES a scene folds has to say so, or it
 * fails on the feature working.
 */
export async function hiddenShapeIds(page: Page, type?: string): Promise<string[]> {
  return page.evaluate(
    (wanted) =>
      window
        .__editor!.getCurrentPageShapes()
        .filter((s) => (wanted ? s.type === wanted : true))
        .filter((s) => window.__editor!.isShapeHidden(s.id))
        .map((s) => s.id as string)
        .sort(),
    type,
  )
}
