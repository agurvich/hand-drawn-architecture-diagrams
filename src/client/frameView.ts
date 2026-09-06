import type { Editor, TLShape } from 'tldraw'
import {
  withEffectiveCollapsed,
  FRAME_VIEW_SINGLETON_ID,
  OFF_FRAME_SINGLETON_ID,
  OFF_FRAME_RECORD_TYPE,
  FRAME_VIEW_RECORD_TYPE,
  type FrameRecord,
  type OffFrameRecord,
} from '@shared/frames'
import { NODE_SHAPE_TYPE, type GetShape } from '@shared/shapes'

/**
 * Where THIS viewer is in the narration, and the accessor that applies it.
 *
 * A frame is a lens: nothing here writes to a shape's collapsed prop except the
 * one explicit toggle below. The state lives in session-scoped records, so it is
 * in the store -- reactive, and the fence in `decisions.md` respected -- while
 * never reaching another client.
 *
 * TWO records, not one, and which write records history is the reason:
 *
 *   - `activeFrameId` is written with history IGNORED. tldraw's history filters
 *     on `source`, not on record scope, so without this merely LOOKING at a
 *     frame fuses onto the reader's previous edit and one undo throws them off
 *     it -- measured, not theorised.
 *   - the off-frame set is written RECORDED, in the same change as the shape
 *     prop, so one undo reverses both.
 *
 * They cannot share a record: a recorded diff carries the whole record, so a
 * toggle would drag `activeFrameId` into the undo stack and walk the reader
 * backwards through the story.
 */

const EMPTY: ReadonlySet<string> = new Set()

/**
 * The off-frame set, derived once per record identity.
 *
 * `frameAwareGetShape` runs per shape per visibility recompute, so building a
 * fresh Set each time is O(shapes x offFrame). The record is immutable, so
 * caching on its identity is exact.
 */
const offFrameSets = new WeakMap<OffFrameRecord, ReadonlySet<string>>()

function offFrameSetOf(record: OffFrameRecord | undefined): ReadonlySet<string> {
  if (!record || record.nodeIds.length === 0) return EMPTY
  let set = offFrameSets.get(record)
  if (!set) {
    set = new Set(record.nodeIds)
    offFrameSets.set(record, set)
  }
  return set
}

/**
 * The active frame and off-frame set.
 *
 * Reading does NOT create either record: opening a room must not dirty a store
 * nobody has touched. Reading a missing key still registers a reactive
 * dependency, so the first write invalidates every computed that asked.
 */
export function frameState(editor: Editor): {
  frame: FrameRecord | null
  offFrame: ReadonlySet<string>
} {
  const view = editor.store.get(FRAME_VIEW_SINGLETON_ID)
  const frame = view?.activeFrameId ? (editor.store.get(view.activeFrameId) ?? null) : null
  return { frame, offFrame: offFrameSetOf(editor.store.get(OFF_FRAME_SINGLETON_ID)) }
}

/**
 * A shape accessor reporting each node's EFFECTIVE collapsed state.
 *
 * Used by BOTH `visibility.ts` and `mergeIndex.ts`. That is the whole point:
 * collapse is read twice, and overriding at the accessor they share is what
 * makes merging follow the frame. Overriding one call site would fold a
 * container while the connections crossing its boundary stayed drawn to shapes
 * no longer on screen.
 */
export function frameAwareGetShape(editor: Editor): GetShape {
  const { frame, offFrame } = frameState(editor)
  return withEffectiveCollapsed((id) => editor.getShape(id as TLShape['id']), frame, offFrame)
}

/**
 * Point this viewer at a frame, or at none.
 *
 * History IGNORED. Stepping is not a document change, and recording it means an
 * unrelated undo drags the reader off the frame they are reading.
 *
 * Changing frames clears the off-frame set -- otherwise the previous frame's
 * overrides silently suppress the new frame's values for those nodes, and the
 * reader sees a frame that is not the frame. That clear is ignored too: it is
 * part of stepping, not part of an edit.
 */
export function viewFrame(editor: Editor, frameId: FrameRecord['id'] | null): void {
  editor.run(
    () => {
      editor.store.put([
        {
          typeName: FRAME_VIEW_RECORD_TYPE,
          id: FRAME_VIEW_SINGLETON_ID,
          activeFrameId: frameId,
        },
      ])
      const off = editor.store.get(OFF_FRAME_SINGLETON_ID)
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
 *   - the node joins the off-frame set, so the frame stops overriding it for
 *     this viewer while the rest of the frame keeps applying
 *
 * Both inside one `run` after `markHistoryStoppingPoint`, because `run` batches
 * a transaction but does not create an undo boundary. Split across two changes,
 * undo would restore the prop and leave the node off-frame -- a state nobody
 * asked for.
 *
 * This is the ONLY narration write that records history.
 */
export function takeOffFrameAndToggle(
  editor: Editor,
  shape: { id: TLShape['id'] },
  effective: boolean,
): void {
  // No frame active means nothing to be off, and recording one would defeat the
  // identity fast path in `withEffectiveCollapsed` forever after.
  const active = editor.store.get(FRAME_VIEW_SINGLETON_ID)?.activeFrameId ?? null
  const off = editor.store.get(OFF_FRAME_SINGLETON_ID)

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
        typeName: OFF_FRAME_RECORD_TYPE,
        id: OFF_FRAME_SINGLETON_ID,
        nodeIds: [...nodeIds, shape.id],
      },
    ])
  })
}
