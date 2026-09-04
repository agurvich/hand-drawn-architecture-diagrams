import { BaseBoxShapeTool } from 'tldraw'
import { NODE_SHAPE_TYPE } from '@shared/shapes'

/**
 * Click-drag to place a Node. BaseBoxShapeTool gives the drag-out-a-box
 * interaction for free; `shapeType` comes from the shared definition.
 */
export class NodeTool extends BaseBoxShapeTool {
  static override id = NODE_SHAPE_TYPE
  static override initial = 'idle'
  // Annotated, not inferred: assignment to a mutable property widens the
  // literal to `string`, which no longer satisfies the shape-type union.
  override shapeType: typeof NODE_SHAPE_TYPE = NODE_SHAPE_TYPE
}
