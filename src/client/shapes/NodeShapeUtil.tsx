import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  type TLIndicatorPath,
  type TLResizeInfo,
  resizeBox,
} from 'tldraw'
import { effectiveCollapsed } from '@shared/scenes'
import { highlightState, sceneState, takeOffSceneAndToggle } from '../sceneView'
import { actorsOfSelection } from '../actors'
import {
  NODE_SHAPE_TYPE,
  nodeShapeDefaultProps,
  nodeShapeMigrations,
  nodeShapeProps,
  descendantCount,
  type NodeShape,
} from '@shared/shapes'
import type { TLDragShapesOutInfo, TLShape } from 'tldraw'

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

  /**
   * The gate the whole drag-to-nest behaviour hangs off.
   *
   * It defaults to `false` in the base class, so without it nothing nests. It is
   * also the ONLY place the collapsed refusal belongs: `getReceivableShapesForTarget`
   * filters through it, and the manager only hints and only calls `onDragShapesIn`
   * when something receivable remains. So this one method buys three acceptance
   * criteria -- accepting children, the drop hint, and refusing drops into a
   * collapsed container, which would otherwise make the dropped node vanish.
   *
   * Not extending BaseSceneLikeShapeUtil, which implements this same trio: it
   * also drags in `isSceneLike`, child clipping and scene brush-selection
   * semantics that a diagram node should not have.
   */
  override canReceiveNewChildrenOfType(shape: NodeShape, type: TLShape['type']) {
    // EFFECTIVE, not the raw prop. This refusal exists so a dropped node cannot
    // vanish into a closed container -- and a container folded only by a scene
    // hides its children just as thoroughly, so it has to refuse too.
    const { scene, offScene } = sceneState(this.editor)
    return (
      type === NODE_SHAPE_TYPE &&
      !effectiveCollapsed(shape.id, shape.props.collapsed, scene, offScene)
    )
  }

  /**
   * The REPARENT hook. Deliberately not `onDragShapesOver`, which fires on every
   * cursor move while over the target and is not gated by
   * `canReceiveNewChildrenOfType` -- reparenting there runs once per pointer
   * scene, churning the store and spamming sync.
   */
  override onDragShapesIn(shape: NodeShape, shapes: TLShape[]) {
    // Drag-path cycle guard: refuse when the target is inside something being
    // dragged. reparentShapes THROWS on a self-parent rather than no-op'ing.
    if (shapes.some((dragging) => this.editor.hasAncestor(shape, dragging.id))) return
    this.editor.reparentShapes(shapes, shape.id)
  }

  /**
   * Returning a shape to the page is not automatic on BaseBoxShapeUtil.
   *
   * Guarded on `nextDraggingOverShapeId`: without it, dragging a node straight
   * from one container into another reparents it to the page mid-gesture, and
   * it lands at the wrong index.
   */
  override onDragShapesOut(_shape: NodeShape, shapes: TLShape[], info: TLDragShapesOutInfo) {
    if (info.nextDraggingOverShapeId) return
    this.editor.reparentShapes(shapes, this.editor.getCurrentPageId())
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
    const childCount = descendantCount(shape.id, (id) =>
      this.editor.getSortedChildIdsForParent(id as NodeShape['id']),
    )
    const hasChildren = childCount > 0
    // The EFFECTIVE state, not the raw prop. A scene is a lens over collapse, so
    // a container a scene folds must render folded -- otherwise its children
    // vanish while it still offers "Collapse" and shows no count.
    const { scene, offScene } = sceneState(this.editor)
    const collapsed = effectiveCollapsed(shape.id, shape.props.collapsed, scene, offScene)
    // Ring the named shapes AND dim the rest: on a busy diagram an outline alone
    // is easy to miss, which is the opposite of the point.
    const { ids, dimming } = highlightState(this.editor)
    // "Who does this" answered from the CANVAS as well as from the line: with a
    // connection selected, the node performing it is marked, so the question is
    // answerable without opening a panel.
    const performs = actorsOfSelection(this.editor).has(shape.id)
    const accent = !dimming
      ? ''
      : ids.has(shape.id)
        ? ' diagram-node--highlighted'
        : ' diagram-node--dimmed'

    const toggle = (e: React.PointerEvent | React.MouseEvent) => {
      // Without this the press also selects, drags or enters label editing --
      // SPEC-004 FR-004 requires activating the control to do none of those.
      e.stopPropagation()
      e.preventDefault()
      // Writes the opposite of the EFFECTIVE state -- what the user can see --
      // and takes the node off-scene in the SAME recorded change, so one undo
      // reverses both. Split across two changes, undo would restore the prop
      // while leaving the node off-scene, showing a state nobody asked for.
      takeOffSceneAndToggle(this.editor, shape, collapsed)
    }

    return (
      <HTMLContainer
        id={shape.id}
        style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all' }}
      >
        <div
          className={`diagram-node${collapsed ? ' diagram-node--collapsed' : ''}${accent}${performs ? ' diagram-node--performs' : ''}`}
          data-testid="diagram-node"
          style={{ borderColor: shape.props.color }}
        >
          {hasChildren && (
            <button
              type="button"
              className="diagram-node__toggle"
              data-testid="diagram-node-toggle"
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand container' : 'Collapse container'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggle}
            >
              {collapsed ? '+' : '−'}
            </button>
          )}
          {collapsed && hasChildren && (
            <span className="diagram-node__count" data-testid="diagram-node-count">
              {childCount} hidden
            </span>
          )}
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
