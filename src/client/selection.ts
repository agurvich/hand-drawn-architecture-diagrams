import type { Editor, TLInstancePageState } from 'tldraw'
import { isHiddenByCollapse } from '@shared/shapes'

/**
 * Keep hidden shapes out of the selection.
 *
 * Hiding a shape does NOT fully prevent selecting it. Click-selection is safe
 * (`getShapeAtPoint` skips hidden shapes), but brushing filters hidden shapes
 * only on its fast path and falls back to an unfiltered list once the viewport
 * has changed -- which edge-scrolling during a marquee does. tldraw explicitly
 * contemplates hidden-but-selected: it just suppresses the selection handles.
 *
 * A `before` handler rather than `after`: rewriting the incoming value means the
 * bad state is never committed, so there is no second change to react to and no
 * feedback loop.
 *
 * Returns a disposer.
 */
export function stripHiddenFromSelection(editor: Editor): () => void {
  return editor.sideEffects.registerBeforeChangeHandler(
    'instance_page_state',
    (_prev, next: TLInstancePageState) => {
      if (next.selectedShapeIds.length === 0) return next
      const getShape = (id: string) => editor.getShape(id as never)
      const visible = next.selectedShapeIds.filter((id) => {
        const shape = editor.getShape(id)
        return shape ? !isHiddenByCollapse(shape, getShape) : false
      })
      if (visible.length === next.selectedShapeIds.length) return next
      return { ...next, selectedShapeIds: visible }
    },
  )
}
