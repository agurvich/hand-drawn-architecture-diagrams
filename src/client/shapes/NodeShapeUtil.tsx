import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  type TLIndicatorPath,
  type TLResizeInfo,
  resizeBox,
} from 'tldraw'
import {
  NODE_SHAPE_TYPE,
  nodeShapeDefaultProps,
  nodeShapeMigrations,
  nodeShapeProps,
  type NodeShape,
} from '@shared/shapes'

/**
 * The client half of the Node shape. Everything identifying comes from
 * `@shared/shapes` -- the type string is never written here.
 *
 * Extends BaseBoxShapeUtil for box resize. Two easy traps on tldraw 5:
 *  - `indicator()` is a deprecated stub and is NOT rendered. Overriding it
 *    compiles cleanly and draws no selection indicator; `getIndicatorPath` is
 *    the abstract method that actually runs.
 *  - `canEdit()` defaults to FALSE, so double-click label editing does nothing
 *    until it is overridden.
 */
export class NodeShapeUtil extends BaseBoxShapeUtil<NodeShape> {
  static override type = NODE_SHAPE_TYPE
  static override props = nodeShapeProps
  static override migrations = nodeShapeMigrations

  override getDefaultProps(): NodeShape['props'] {
    return { ...nodeShapeDefaultProps }
  }

  override canEdit() {
    return true
  }

  override getGeometry(shape: NodeShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override getIndicatorPath(shape: NodeShape): TLIndicatorPath | undefined {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  override onResize(shape: NodeShape, info: TLResizeInfo<NodeShape>) {
    return resizeBox(shape, info)
  }

  override component(shape: NodeShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id
    return (
      <HTMLContainer
        id={shape.id}
        style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all' }}
      >
        <div
          className="diagram-node"
          data-testid="diagram-node"
          style={{ borderColor: shape.props.color }}
        >
          {isEditing ? (
            <textarea
              className="diagram-node__input"
              data-testid="diagram-node-input"
              autoFocus
              defaultValue={shape.props.label}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                this.editor.updateShape<NodeShape>({
                  id: shape.id,
                  type: NODE_SHAPE_TYPE,
                  props: { label: e.currentTarget.value },
                })
              }
            />
          ) : (
            <span className="diagram-node__label">{shape.props.label}</span>
          )}
        </div>
      </HTMLContainer>
    )
  }
}
