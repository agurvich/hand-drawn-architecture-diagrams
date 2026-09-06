import type { Editor, TLShape } from 'tldraw'
import {
  withEffectiveCollapsed,
  FRAME_VIEW_SINGLETON_ID,
  type FrameRecord,
  type FrameViewRecord,
} from '@shared/frames'
import { NODE_SHAPE_TYPE, type GetShape } from '@shared/shapes'

/**
 * Where THIS viewer is in the narration, and the accessor that applies it.
 *
 * A frame is a lens: nothing here writes to a shape. The state lives in a
 * session-scoped record, so it is in the store (reactive, and the fence in
 * `decisions.md` is respected) while never reaching another client.
 */

const EMPTY: ReadonlySet<string> = new Set()

/**
 * The active frame and off-frame set.
 *
 * Reading does NOT create the record: opening a room must not dirty a store
 * nobody has touched. It is created on the first step. Reading a missing key
 * still registers a reactive dependency, so the first write invalidates every
 * computed that asked.
 */
export function frameState(editor: Editor): {
  frame: FrameRecord | null
  offFrame: ReadonlySet<string>
} {
  const view = editor.store.get(FRAME_VIEW_SINGLETON_ID) as FrameViewRecord | undefined
  if (!view) return { frame: null, offFrame: EMPTY }
  const frame = view.activeFrameId ? (editor.store.get(view.activeFrameId) ?? null) : null
  return { frame, offFrame: view.offFrame.length ? new Set(view.offFrame) : EMPTY }
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
 * Toggle a node's collapse, from a control showing its EFFECTIVE state.
 *
 * Two writes, one recorded change, with a history mark in front of it:
 *
 *   - the node's own `collapsed` prop flips to the opposite of what the user saw
 *   - the node is taken OFF-FRAME, so the frame stops overriding it for this
 *     viewer while the rest of the frame keeps applying
 *
 * Both in one `run` after a `markHistoryStoppingPoint`, because `run` batches a
 * transaction but does not create an undo boundary. Split across two changes,
 * undo would restore the prop and leave the node off-frame -- showing a state
 * the user never asked for.
 *
 * This is the ONLY narration write that records history. Stepping and selecting
 * a frame ignore it, or undo would walk a reader backwards through the story.
 */
export function takeOffFrameAndToggle(
  editor: Editor,
  shape: { id: TLShape['id'] },
  effective: boolean,
): void {
  const view = editor.store.get(FRAME_VIEW_SINGLETON_ID)
  editor.markHistoryStoppingPoint()
  editor.run(() => {
    editor.updateShape({
      id: shape.id,
      type: NODE_SHAPE_TYPE,
      props: { collapsed: !effective },
    })
    if (view && !view.offFrame.includes(shape.id)) {
      editor.store.put([{ ...view, offFrame: [...view.offFrame, shape.id] }])
    }
  })
}
