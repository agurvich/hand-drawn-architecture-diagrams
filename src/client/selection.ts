import { react, type Editor, type TLInstancePageState } from 'tldraw'

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
 * It asks `editor.isShapeHidden`, which routes through the same
 * `getShapeVisibility` -> `shouldHide` the canvas uses. It must not ask
 * `isHiddenByCollapse` directly: that walks parentId, a connection is parented
 * to the PAGE, so it answers "not hidden" for every connection ever. Before
 * SPEC-006 that was merely wrong; once a connection can be hidden by MERGING
 * while a line is still drawn in its place, it means the user selects a visible
 * line, presses Delete, and destroys a different invisible connection with the
 * only feedback being a count quietly changing.
 *
 * TWO mechanisms, because there are two ways to arrive at the bad state and each
 * is blind to the other:
 *
 *   1. the shape is already hidden and something SELECTS it -- a before-handler
 *      on instance_page_state rewrites the incoming selection;
 *   2. the shape is already selected and something HIDES it -- collapsing a
 *      container, or a merge group re-forming around a different representative.
 *      No page-state change accompanies that, so (1) never fires; a reaction on
 *      the derived selection covers it.
 *
 * (2) was missing until SPEC-006 and is not connection-specific: collapsing a
 * container while one of its children was selected left the child selected too.
 * It only became dangerous once a line could be hidden while another line is
 * still drawn in its place.
 *
 * Returns a disposer for both.
 */
export function stripHiddenFromSelection(editor: Editor): () => void {
  const disposeGuard = editor.sideEffects.registerBeforeChangeHandler(
    'instance_page_state',
    (_prev, next: TLInstancePageState) => {
      if (next.selectedShapeIds.length === 0) return next
      const visible = next.selectedShapeIds.filter(
        (id) => !!editor.getShape(id) && !editor.isShapeHidden(id),
      )
      if (visible.length === next.selectedShapeIds.length) return next
      return { ...next, selectedShapeIds: visible }
    },
  )

  // Settles in one pass: the write it makes leaves nothing further to strip.
  const disposeReaction = react('strip newly-hidden shapes from selection', () => {
    const selected = editor.getSelectedShapeIds()
    if (selected.length === 0) return
    const visible = selected.filter((id) => !!editor.getShape(id) && !editor.isShapeHidden(id))
    if (visible.length !== selected.length) editor.setSelectedShapes(visible)
  })

  return () => {
    disposeGuard()
    disposeReaction()
  }
}
