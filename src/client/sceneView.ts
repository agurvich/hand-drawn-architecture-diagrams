import {
  computed,
  createCustomRecordId,
  getIndexAbove,
  getIndexBetween,
  uniqueId,
  ZERO_INDEX_KEY,
  type Computed,
  type Editor,
  type IndexKey,
  type TLShape,
} from 'tldraw'
import {
  withEffectiveCollapsed,
  effectiveCollapsed,
  SCENE_RECORD_TYPE,
  SCENE_VIEW_SINGLETON_ID,
  OFF_SCENE_SINGLETON_ID,
  OFF_SCENE_RECORD_TYPE,
  SCENE_VIEW_RECORD_TYPE,
  type SceneRecord,
  type OffSceneRecord,
} from '@shared/scenes'
import { NODE_SHAPE_TYPE, type GetShape } from '@shared/shapes'

/**
 * Where THIS viewer is in the narration, and the accessor that applies it.
 *
 * A scene is a lens: nothing here writes to a shape's collapsed prop except the
 * one explicit toggle below. The state lives in session-scoped records, so it is
 * in the store -- reactive, and the fence in `decisions.md` respected -- while
 * never reaching another client.
 *
 * TWO records, not one, and which write records history is the reason:
 *
 *   - `activeSceneId` is written with history IGNORED. tldraw's history filters
 *     on `source`, not on record scope, so without this merely LOOKING at a
 *     scene fuses onto the reader's previous edit and one undo throws them off
 *     it -- measured, not theorised.
 *   - the off-scene set is written RECORDED, in the same change as the shape
 *     prop, so one undo reverses both.
 *
 * They cannot share a record: a recorded diff carries the whole record, so a
 * toggle would drag `activeSceneId` into the undo stack and walk the reader
 * backwards through the story.
 */

const EMPTY: ReadonlySet<string> = new Set()

/**
 * The off-scene set, derived once per record identity.
 *
 * `sceneAwareGetShape` runs per shape per visibility recompute, so building a
 * fresh Set each time is O(shapes x offScene). The record is immutable, so
 * caching on its identity is exact.
 */
const offSceneSets = new WeakMap<OffSceneRecord, ReadonlySet<string>>()

function offSceneSetOf(record: OffSceneRecord | undefined): ReadonlySet<string> {
  if (!record || record.nodeIds.length === 0) return EMPTY
  let set = offSceneSets.get(record)
  if (!set) {
    set = new Set(record.nodeIds)
    offSceneSets.set(record, set)
  }
  return set
}

/**
 * The active scene and off-scene set.
 *
 * Reading does NOT create either record: opening a room must not dirty a store
 * nobody has touched. Reading a missing key still registers a reactive
 * dependency, so the first write invalidates every computed that asked.
 */
export function sceneState(editor: Editor): {
  scene: SceneRecord | null
  offScene: ReadonlySet<string>
} {
  const view = editor.store.get(SCENE_VIEW_SINGLETON_ID)
  const scene = view?.activeSceneId ? (editor.store.get(view.activeSceneId) ?? null) : null
  return { scene, offScene: offSceneSetOf(editor.store.get(OFF_SCENE_SINGLETON_ID)) }
}

/**
 * A shape accessor reporting each node's EFFECTIVE collapsed state.
 *
 * Used by BOTH `visibility.ts` and `mergeIndex.ts`. That is the whole point:
 * collapse is read twice, and overriding at the accessor they share is what
 * makes merging follow the scene. Overriding one call site would fold a
 * container while the connections crossing its boundary stayed drawn to shapes
 * no longer on screen.
 */
export function sceneAwareGetShape(editor: Editor): GetShape {
  const { scene, offScene } = sceneState(editor)
  return withEffectiveCollapsed((id) => editor.getShape(id as TLShape['id']), scene, offScene)
}

/**
 * Point this viewer at a scene, or at none.
 *
 * History IGNORED. Stepping is not a document change, and recording it means an
 * unrelated undo drags the reader off the scene they are reading.
 *
 * Changing scenes clears the off-scene set -- otherwise the previous scene's
 * overrides silently suppress the new scene's values for those nodes, and the
 * reader sees a scene that is not the scene. That clear is ignored too: it is
 * part of stepping, not part of an edit.
 */
export function viewScene(editor: Editor, sceneId: SceneRecord['id'] | null): void {
  editor.run(
    () => {
      editor.store.put([
        {
          typeName: SCENE_VIEW_RECORD_TYPE,
          id: SCENE_VIEW_SINGLETON_ID,
          activeSceneId: sceneId,
        },
      ])
      const off = editor.store.get(OFF_SCENE_SINGLETON_ID)
      if (off && off.nodeIds.length > 0) {
        editor.store.put([{ ...off, nodeIds: [] }])
      }
    },
    { history: 'ignore' },
  )
}

/**
 * Toggle a node's collapse, from a control showing its EFFECTIVE state.
 *
 * Two writes, one recorded change, behind a history mark:
 *
 *   - the node's own `collapsed` prop flips to the opposite of what the user saw
 *   - the node joins the off-scene set, so the scene stops overriding it for
 *     this viewer while the rest of the scene keeps applying
 *
 * Both inside one `run` after `markHistoryStoppingPoint`, because `run` batches
 * a transaction but does not create an undo boundary. Split across two changes,
 * undo would restore the prop and leave the node off-scene -- a state nobody
 * asked for.
 *
 * This is the ONLY narration write that records history.
 */
export function takeOffSceneAndToggle(
  editor: Editor,
  shape: { id: TLShape['id'] },
  effective: boolean,
): void {
  // No scene active means nothing to be off, and recording one would defeat the
  // identity fast path in `withEffectiveCollapsed` forever after.
  const active = editor.store.get(SCENE_VIEW_SINGLETON_ID)?.activeSceneId ?? null
  const off = editor.store.get(OFF_SCENE_SINGLETON_ID)

  editor.markHistoryStoppingPoint()
  editor.run(() => {
    editor.updateShape({
      id: shape.id,
      type: NODE_SHAPE_TYPE,
      props: { collapsed: !effective },
    })
    if (active === null) return
    const nodeIds = off?.nodeIds ?? []
    if (nodeIds.includes(shape.id)) return
    editor.store.put([
      {
        typeName: OFF_SCENE_RECORD_TYPE,
        id: OFF_SCENE_SINGLETON_ID,
        nodeIds: [...nodeIds, shape.id],
      },
    ])
  })
}

/**
 * Every scene in the room, in order.
 *
 * Behind a `computed` with an `isEqual`, keyed on the editor, exactly as
 * `mergeIndex` is. `store.allRecords()` reads every value atom in the store, so
 * an unguarded call makes the panel depend on the camera and on every shape --
 * and the fresh array it returns fails `Object.is` every time, so React
 * re-renders on every pointer frame of a drag.
 */
const orders = new WeakMap<Editor, Computed<SceneRecord[]>>()

function sameOrder(a: SceneRecord[], b: SceneRecord[]): boolean {
  return a.length === b.length && a.every((scene, i) => scene === b[i])
}

export function scenesInOrder(editor: Editor): SceneRecord[] {
  let order = orders.get(editor)
  if (!order) {
    order = computed(
      'scenes in order',
      () =>
        editor.store
          .allRecords()
          .filter((r): r is SceneRecord => r.typeName === SCENE_RECORD_TYPE)
          .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : a.id < b.id ? -1 : 1)),
      { isEqual: sameOrder },
    )
    orders.set(editor, order)
  }
  return order.get()
}

/**
 * The current effective view, as a scene's `collapsed` map.
 *
 * Extracted so `recaptureScene` does not have to create a scene and delete it
 * again: that committed a document-scoped record in its own transaction, so a
 * throw in the second one leaked a duplicate scene to everyone in the room, and
 * between the two the temporary scene was genuinely visible and syncable.
 *
 * The population is every node that HAS CHILDREN right now: "container" is not a
 * type here -- every node carries `collapsed` -- so the set has to be named. A
 * node with no children is not recorded, and therefore falls back to its own
 * prop if it later gains some.
 */
export function captureCollapsedMap(editor: Editor): Record<string, boolean> {
  const { scene, offScene } = sceneState(editor)
  const collapsed: Record<string, boolean> = {}
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== NODE_SHAPE_TYPE) continue
    if (editor.getSortedChildIdsForParent(shape.id).length === 0) continue
    const own = (shape.props as { collapsed: boolean }).collapsed
    collapsed[shape.id] = effectiveCollapsed(shape.id, own, scene, offScene)
  }
  return collapsed
}

/**
 * Capture the CURRENT EFFECTIVE VIEW as a new scene, and activate it.
 *
 * "Effective" means what is on screen, off-scene overrides included -- not what
 * the props say. The population is every node that HAS CHILDREN right now:
 * "container" is not a type here, every node carries `collapsed`, so the set has
 * to be named. A node with no children is not recorded, and therefore falls back
 * to its own prop if it later gains some.
 *
 * History ignored, like every scene edit. Document-scoped records share the
 * diagram's undo stack, so without this, drawing a node after capturing and
 * pressing undo twice deletes the scene -- for everyone in the room.
 */
export function captureScene(editor: Editor, name: string): SceneRecord['id'] {
  const collapsed = captureCollapsedMap(editor)
  const last = scenesInOrder(editor).at(-1)
  const id = createCustomRecordId(SCENE_RECORD_TYPE, uniqueId()) as SceneRecord['id']
  editor.run(
    () => {
      editor.store.put([
        {
          typeName: SCENE_RECORD_TYPE,
          id,
          name,
          note: '',
          collapsed,
          // The selection is the highlight: no new control, and it is a gesture
          // the reader already performs before talking about something.
          highlighted: editor.getSelectedShapeIds().map((s) => s as string),
          index: last ? getIndexAbove(last.index as IndexKey) : (ZERO_INDEX_KEY as string),
        },
      ])
    },
    { history: 'ignore' },
  )
  // Activating also clears offScene, which is viewScene's job.
  viewScene(editor, id)
  return id
}

/**
 * Overwrite a scene's captured view, keeping its id, name, note and position.
 *
 * One write. An earlier version captured a temporary scene and deleted it, which
 * committed a synced record in its own transaction -- a leak on any throw, and
 * visible to every client in between.
 */
export function recaptureScene(editor: Editor, sceneId: SceneRecord['id']): void {
  const existing = editor.store.get(sceneId)
  if (!existing) return
  const collapsed = captureCollapsedMap(editor)
  const highlighted = editor.getSelectedShapeIds().map((s) => s as string)
  editor.run(() => editor.store.put([{ ...existing, collapsed, highlighted }]), {
    history: 'ignore',
  })
  viewScene(editor, sceneId)
}

/** Rename a scene, or rewrite its note. */
export function updateScene(
  editor: Editor,
  sceneId: SceneRecord['id'],
  patch: Partial<Pick<SceneRecord, 'name' | 'note'>>,
): void {
  const existing = editor.store.get(sceneId)
  if (!existing) return
  editor.run(() => editor.store.put([{ ...existing, ...patch }]), { history: 'ignore' })
}

/** Delete a scene. The confirmation is the panel's; this is the write. */
export function deleteScene(editor: Editor, sceneId: SceneRecord['id']): void {
  const active = editor.store.get(SCENE_VIEW_SINGLETON_ID)?.activeSceneId ?? null
  editor.run(() => editor.store.remove([sceneId]), { history: 'ignore' })
  if (active === sceneId) viewScene(editor, null)
}

/**
 * Move a scene one place earlier or later.
 *
 * ONE record, with a fractional index between its new neighbours. Re-indexing the
 * whole list writes N records from a fixed sequence, so two clients reordering at
 * once merge halves of two different orders per-record and land on neither
 * person's intent -- and a concurrent capture can mint a duplicate index, after
 * which the order is decided by an id tiebreak nobody asked for. Fractional
 * indexing is the total order over data both clients already have, which is what
 * `decisions.md` requires of a tie.
 */
export function moveScene(editor: Editor, sceneId: SceneRecord['id'], delta: -1 | 1): void {
  const order = scenesInOrder(editor)
  const from = order.findIndex((s) => s.id === sceneId)
  const to = from + delta
  if (from < 0 || to < 0 || to >= order.length) return

  const without = order.filter((s) => s.id !== sceneId)
  const before = without[to - 1]
  const after = without[to]
  const index = getIndexBetween(
    before?.index as IndexKey | undefined,
    after?.index as IndexKey | undefined,
  )
  editor.run(() => editor.store.put([{ ...order[from]!, index: index as string }]), {
    history: 'ignore',
  })
}

/** Step through the order. Stops at the ends rather than wrapping. */
export function stepScene(editor: Editor, delta: -1 | 1): void {
  const order = scenesInOrder(editor)
  if (order.length === 0) return
  const active = editor.store.get(SCENE_VIEW_SINGLETON_ID)?.activeSceneId ?? null
  const current = order.findIndex((s) => s.id === active)
  // From nowhere, forward starts at the first scene and back at the last.
  const next = current < 0 ? (delta === 1 ? 0 : order.length - 1) : current + delta
  if (next < 0 || next >= order.length) return
  viewScene(editor, order[next]!.id)
}
