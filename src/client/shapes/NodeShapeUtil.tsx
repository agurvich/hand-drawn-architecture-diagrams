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
  CONNECTION_SHAPE_TYPE,
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
    // EVERYTHING EXCEPT A CONNECTION. Not a list of accepted types -- a list is
    // what goes stale the first time tldraw ships a new shape, and the rule is
    // genuinely "is this a connection", not "is this one of the six things we
    // thought of". A `diagramConnection` is parented to the PAGE by design
    // (SPEC-005), and SPEC-006's merge derivation depends on that.
    //
    // The cheap type test runs FIRST: tldraw calls this once per candidate
    // parent on every pointer-down of every stroke, and `sceneState` reads the
    // store.
    if (type === CONNECTION_SHAPE_TYPE) return false
    // EFFECTIVE, not the raw prop. This refusal exists so a dropped node cannot
    // vanish into a closed container -- and a container folded only by a scene
    // hides its children just as thoroughly, so it has to refuse too.
    const { scene, offScene } = sceneState(this.editor)
    return !effectiveCollapsed(shape.id, shape.props.collapsed, scene, offScene)
  }

  /**
   * RESIZING A NODE DOES NOT RESIZE WHAT IS INSIDE IT.
   *
   * `ShapeUtil.canResizeChildren` defaults to TRUE, and tldraw's `Resizing`
   * state visits every descendant unless a parent says otherwise. Measured
   * through the real corner handle before this line existed: a 300x200 node
   * taken to 600x400 doubled its content and moved it, and a non-uniform drag
   * squashed it by different factors on each axis. Enlarging a box must not
   * enlarge your handwriting.
   *
   * The hook takes the PARENT only, so it cannot answer differently for a pen
   * stroke and for a child node -- which is why "nested nodes stop scaling too"
   * is a decision the user made (2026-09-06) rather than an implementation
   * detail. One rule for everything inside a box: you resize what you grabbed,
   * nothing else.
   */
  override canResizeChildren() {
    return false
  }

  /*
   * NO `canRemoveChildrenOfType` OVERRIDE, and the absence is a decision.
   *
   * tldraw finishes a resize, a translate and a dozen menu actions with
   * `kickoutOccludedShapes`, which returns to the page any child that no longer
   * overlaps its parent. That hook would suppress it -- but it CANNOT TELL an
   * explicit drag from an automatic kickout, because both go through it.
   *
   * Suppressing it means content can never leave a box by hand: measured, a
   * 500px drag clear of the node left the content still parented to it. It also
   * broke dragging a nested NODE out, which SPEC-004 delivered -- the claim that
   * only the automatic path was affected was simply wrong, and the nesting suite
   * caught it.
   *
   * So the default stands, on the user's decision (2026-09-06): writing can be
   * dragged out of a box. The cost, stated rather than discovered: shrinking a
   * box CLEAR OF its content also returns that content to the page, and moving
   * the box afterwards then leaves it behind. There is no third option without
   * machinery to distinguish the two gestures.
   */

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
    /*
     * NODES ONLY. SPEC-013 lets a box hold hand-drawn content, and this count is
     * a claim about STRUCTURE -- "3 hidden" beside a folded box means three
     * things nested inside it, not three pen strokes. Counting content made a
     * box you had scribbled one note in sprout a collapse control and announce
     * "1 hidden", which is a sentence about nesting that is not true.
     *
     * Consequence, chosen rather than inherited: a box containing ONLY writing
     * has no collapse control at all -- there is no structure to fold. Folding
     * one that does have structure still hides its writing along with
     * everything else, because hiding walks ancestry and does not care what it
     * finds.
     */
    const childCount = descendantCount(shape.id, (id) =>
      this.editor
        .getSortedChildIdsForParent(id as NodeShape['id'])
        .filter((childId) => this.editor.getShape(childId)?.type === NODE_SHAPE_TYPE),
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
