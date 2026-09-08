import type { Editor, TLShapeId } from 'tldraw'
import { NODE_SHAPE_TYPE, CONNECTION_SHAPE_TYPE } from '@shared/shapes'

/** What the properties panel is about. */
export type SelectionSubject =
  { kind: 'node'; id: TLShapeId } | { kind: 'connection'; id: TLShapeId }

/**
 * The one shape the panel is about, or null.
 *
 * Null for nothing selected, for several, and for a shape this app has no
 * properties for -- a tldraw geo, draw or native arrow. That last case is
 * deliberate and is SPEC-016 Out of Scope: a native arrow LOOKS like a
 * connection and is not one (handoff F3), and giving it a properties panel
 * would say it is.
 *
 * Takes a non-null Editor. The null check stays in the caller, as it does for
 * every other panel mounted in `Room.tsx`.
 */
export function selectionSubject(editor: Editor): SelectionSubject | null {
  const ids = editor.getSelectedShapeIds()
  if (ids.length !== 1) return null
  const shape = editor.getShape(ids[0]!)
  if (!shape) return null
  if (shape.type === NODE_SHAPE_TYPE) return { kind: 'node', id: shape.id }
  if (shape.type === CONNECTION_SHAPE_TYPE) return { kind: 'connection', id: shape.id }
  return null
}
