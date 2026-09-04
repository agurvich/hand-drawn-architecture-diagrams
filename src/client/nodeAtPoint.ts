import type { Editor, TLShape, VecLike } from 'tldraw'
import { NODE_SHAPE_TYPE } from '@shared/shapes'

/**
 * The `diagramNode` under a page point, or undefined.
 *
 * One definition, two callers: the connection tool deciding what a drag attaches
 * to, and the connection shape's handle drag deciding what an endpoint re-aims
 * onto. They must agree -- a drop that the tool would accept and the handle drag
 * would not is a difference no test would name.
 *
 * `hitInside` so the whole box is a target, not just its stroke; hidden shapes
 * are excluded because `getShapeAtPoint` does not exclude them itself. That has a
 * consequence worth stating: a node inside a COLLAPSED container is not a pointer
 * target at all, so dropping there attaches to the container, which is the shape
 * actually on screen and actually under the finger.
 */
export function nodeAtPoint(editor: Editor, point: VecLike): TLShape | undefined {
  const shape = editor.getShapeAtPoint(point, {
    hitInside: true,
    filter: (s) => s.type === NODE_SHAPE_TYPE,
  })
  return shape && !editor.isShapeHidden(shape.id) ? shape : undefined
}
