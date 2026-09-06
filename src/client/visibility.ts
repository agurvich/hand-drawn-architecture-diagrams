import type { Editor, TLShape } from 'tldraw'
import { isHiddenByCollapse, CONNECTION_SHAPE_TYPE } from '@shared/shapes'
import { getMergeIndex } from './mergeIndex'
import { frameAwareGetShape } from './frameView'

/**
 * Whether a shape should be hidden.
 *
 * Nodes hide by ANCESTRY -- the parent walk in `isHiddenByCollapse`.
 *
 * A connection cannot use that path at all: it is parented to the PAGE, so no
 * ancestor of it is ever collapsed, and SPEC-005 forbids reparenting it into a
 * container. It hides by RELATIONSHIP instead, and since SPEC-006 that
 * relationship is the whole merge derivation -- a connection hides when it is
 * internal to a collapsed container, when a binding points at a shape that is
 * gone, or when it is a member of a merge group that some other connection
 * represents.
 *
 * The merge index REPLACED an earlier branch here that resolved bindings
 * directly. Both of that branch's answers survive inside the derivation (rules 1
 * and 2), and keeping the old branch alongside it would leave two mechanisms
 * answering one question.
 *
 * Lives in src/client, not src/shared: the shared allowlist permits only
 * @tldraw/tlschema and @tldraw/validate, and this needs the Editor.
 */
export function shouldHide(shape: TLShape, editor: Editor): boolean {
  if (shape.type === CONNECTION_SHAPE_TYPE) {
    return getMergeIndex(editor).get(shape.id)?.hidden === true
  }
  // The FRAME-AWARE accessor, not the raw one: a frame is a lens over collapse,
  // and this is one of the two places collapse is read. The other is
  // mergeIndex.ts, which uses the same accessor for the same reason.
  return isHiddenByCollapse(shape, frameAwareGetShape(editor))
}
