import type { Editor, TLShape } from 'tldraw'
import {
  isHiddenByCollapse,
  CONNECTION_SHAPE_TYPE,
  CONNECTION_BINDING_TYPE,
  type ConnectionBinding,
} from '@shared/shapes'

/**
 * Whether a shape should be hidden.
 *
 * Nodes hide by ANCESTRY -- the parent walk in `isHiddenByCollapse`.
 *
 * A connection cannot use that path at all: it is parented to the PAGE, so no
 * ancestor of it is ever collapsed, and SPEC-005 forbids reparenting it into a
 * container. It hides by RELATIONSHIP instead -- resolve its bindings and hide
 * when either bound node is hidden. Two different mechanisms because they are
 * two different questions, and the parent walk silently answers "no" for every
 * connection.
 *
 * Lives in src/client, not src/shared: the shared allowlist permits only
 * @tldraw/tlschema and @tldraw/validate, and this needs the Editor's binding index.
 */
export function shouldHide(shape: TLShape, editor: Editor): boolean {
  if (shape.type === CONNECTION_SHAPE_TYPE) {
    const bindings = editor.getBindingsFromShape<ConnectionBinding>(shape, CONNECTION_BINDING_TYPE)
    // An unbound connection (mid-drag) is not hidden; a bound one follows its endpoints.
    return bindings.some((b) => {
      const node = editor.getShape(b.toId)
      return !node || editor.isShapeHidden(node.id)
    })
  }
  return isHiddenByCollapse(shape, (id) => editor.getShape(id as TLShape['id']))
}
