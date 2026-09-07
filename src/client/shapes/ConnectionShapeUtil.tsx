import {
  ShapeUtil,
  Vec,
  Group2d,
  Edge2d,
  type TLHandle,
  type TLHandleDragInfo,
  type TLShape,
  type TLShapeId,
  type TLShapeUtilCanBindOpts,
} from 'tldraw'
import { getMergeIndex } from '../mergeIndex'
import { NodeIcon } from '../icons/NodeIcon'
import { actorsOnScreen, type OnScreenActor } from '../actorsOnScreen'
import { MAX_ACTOR_ICONS } from '../icons/actorIcons'
import { nodeAtPoint } from '../nodeAtPoint'
import { highlightState } from '../sceneView'
import {
  CONNECTION_SHAPE_TYPE,
  connectionShapeDefaultProps,
  connectionShapeMigrations,
  connectionShapeProps,
  CONNECTION_BINDING_TYPE,
  type ConnectionShape,
  type ConnectionBinding,
  type ConnectionTerminal,
} from '@shared/shapes'

/**
 * Anchors are DERIVED here, every time, and never written to props.
 *
 * The tempting alternative -- recompute in the binding util's
 * onAfterChangeToShape and store the result -- fails outright: that hook fires
 * for the bound shape's OWN record and for its parentId, so moving a CONTAINER
 * fires nothing for a connection bound to one of its descendants. It would also
 * write to the store once per pointer scene during a drag.
 *
 * Reading the bound shapes' page transforms here instead means the geometry
 * recomputes whenever anything upstream moves, including an ancestor.
 */
export class ConnectionShapeUtil extends ShapeUtil<ConnectionShape> {
  static override type = CONNECTION_SHAPE_TYPE
  static override props = connectionShapeProps
  static override migrations = connectionShapeMigrations

  override getDefaultProps(): ConnectionShape['props'] {
    return { ...connectionShapeDefaultProps }
  }

  /**
   * canBind is asked about a BINDING, not about this shape in isolation -- a
   * blanket `false` blocks the bindings that go FROM the connection to its
   * nodes, which is every binding it has. What is actually meant: a connection
   * may be the `from` side, and nothing may bind TO it (no connection-to-
   * connection edges).
   */
  override canBind({ toShape }: TLShapeUtilCanBindOpts) {
    return toShape.type !== CONNECTION_SHAPE_TYPE
  }
  override canEdit() {
    return false
  }
  override canResize() {
    return false
  }
  override hideRotateHandle() {
    return true
  }

  private bindingFor(shape: ConnectionShape, terminal: ConnectionTerminal) {
    return this.editor
      .getBindingsFromShape<ConnectionBinding>(shape, CONNECTION_BINDING_TYPE)
      .find((b) => b.props.terminal === terminal)
  }

  /**
   * The shape this terminal is DRAWN against -- which since SPEC-006 is not
   * always the shape it is bound to: an endpoint inside a collapsed container
   * resolves to the container standing in for it.
   *
   * Only the ID comes from the index. Bounds are read live below, which is what
   * keeps a container move re-routing the line.
   */
  nodeIdFor(shape: ConnectionShape, terminal: ConnectionTerminal): TLShapeId | null {
    const entry = getMergeIndex(this.editor).get(shape.id)
    if (entry) {
      const id = terminal === 'start' ? entry.startNodeId : entry.endNodeId
      return id === null ? null : (id as TLShapeId)
    }
    // Index miss -- a shape on another page, or a store read mid-change. Fall
    // back to the raw binding, which is what this did before merging existed.
    return this.bindingFor(shape, terminal)?.toId ?? null
  }

  /** How many connections this line stands for; 1 when it is not merged. */
  mergeCount(shape: ConnectionShape): number {
    return getMergeIndex(this.editor).get(shape.id)?.count ?? 1
  }

  /**
   * The actors to draw, split into the ones with a glyph and the rest.
   *
   * `actorsOnScreen` answers WHO; this decides what fits. Ordered by NAME here
   * rather than by the id the derivation sorts on: the derivation's order has to
   * come from data both clients hold with no coordination, and the label is
   * exactly that -- it is in the store -- so sorting by it is just as
   * deterministic and gives a reader an order they can predict. Which two of six
   * icons you see should not look like a coin toss.
   *
   * An actor pinned to NO ICON is not drawn -- there is nothing to draw -- but
   * it is still counted, per the spec: it crosses the boundary whether or not it
   * has a glyph. Giving it an empty 20px slot instead, which is what the first
   * version did, spends the scarce space on a blank tile and quietly makes the
   * count of visible icons mean nothing.
   */
  private drawableActors(shape: ConnectionShape): {
    drawn: OnScreenActor[]
    rest: OnScreenActor[]
  } {
    const all = [...actorsOnScreen(this.editor, shape.id)].sort((a, b) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1,
    )
    const drawn = all.filter((actor) => actor.hasGlyph).slice(0, MAX_ACTOR_ICONS)
    const shown = new Set(drawn.map((actor) => actor.id))
    return { drawn, rest: all.filter((actor) => !shown.has(actor.id)) }
  }

  /** Page-space endpoints, resolved through the merge index. */
  getTerminalsInPageSpace(shape: ConnectionShape): { start: Vec; end: Vec } {
    const shapePage = this.editor.getShapePageTransform(shape.id)
    const fallback = (p: { x: number; y: number }) => shapePage.applyToPoint(new Vec(p.x, p.y))

    const resolve = (terminal: ConnectionTerminal, other: Vec) => {
      const nodeId = this.nodeIdFor(shape, terminal)
      if (!nodeId) return null
      const bounds = this.editor.getShapePageBounds(nodeId)
      if (!bounds) return null
      return anchorOnBorder(bounds.center, bounds, other)
    }

    // Two passes: aim each terminal at the OTHER node's centre, which is what
    // makes the line meet both borders rather than both centres.
    const startCentre = this.centreOf(shape, 'start') ?? fallback(shape.props.start)
    const endCentre = this.centreOf(shape, 'end') ?? fallback(shape.props.end)
    return {
      start: resolve('start', endCentre) ?? startCentre,
      end: resolve('end', startCentre) ?? endCentre,
    }
  }

  private centreOf(shape: ConnectionShape, terminal: ConnectionTerminal): Vec | null {
    const nodeId = this.nodeIdFor(shape, terminal)
    if (!nodeId) return null
    return this.editor.getShapePageBounds(nodeId)?.center ?? null
  }

  override getGeometry(shape: ConnectionShape) {
    const { start, end } = this.getTerminalsInPageSpace(shape)
    const inv = this.editor.getShapePageTransform(shape.id).clone().invert()
    return new Group2d({
      children: [new Edge2d({ start: inv.applyToPoint(start), end: inv.applyToPoint(end) })],
    })
  }

  override getHandles(shape: ConnectionShape): TLHandle[] {
    // A line standing for several connections offers NO handles: re-aiming it
    // could only rebind one arbitrary member of the group, so the affordance is
    // withdrawn rather than made to pick.
    if (this.mergeCount(shape) > 1) return []
    const { start, end } = this.getTerminalsInPageSpace(shape)
    const inv = this.editor.getShapePageTransform(shape.id).clone().invert()
    const a = inv.applyToPoint(start)
    const b = inv.applyToPoint(end)
    return [
      { id: 'start', type: 'vertex', index: 'a1' as never, x: a.x, y: a.y },
      { id: 'end', type: 'vertex', index: 'a2' as never, x: b.x, y: b.y },
    ]
  }

  override component(shape: ConnectionShape) {
    const { start, end } = this.getTerminalsInPageSpace(shape)
    const inv = this.editor.getShapePageTransform(shape.id).clone().invert()
    const a = inv.applyToPoint(start)
    const b = inv.applyToPoint(end)
    const count = this.mergeCount(shape)
    const { drawn, rest } = this.drawableActors(shape)
    const { ids, dimming } = highlightState(this.editor)
    const accent = !dimming
      ? ''
      : ids.has(shape.id)
        ? ' diagram-connection--highlighted'
        : ' diagram-connection--dimmed'
    return (
      <svg className={`tl-svg-container${accent}`} data-testid="diagram-connection">
        <defs>
          <marker
            id={`arrow-${shape.id.replace(/[^a-zA-Z0-9]/g, '')}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="currentColor"
          strokeWidth={2}
          markerEnd={`url(#arrow-${shape.id.replace(/[^a-zA-Z0-9]/g, '')})`}
        />
        {count > 1 && (
          // The count is information about MERGING, so a line standing for one
          // connection renders nothing at all rather than a decorative x1.
          <text
            className="diagram-connection__count"
            data-testid="diagram-connection-count"
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2 - 6}
            textAnchor="middle"
          >
            {`\u00d7${count}`}
          </text>
        )}
        {count === 1 && drawn.length + rest.length === 1 && drawn.length === 1 && (
          // UNMERGED, so there is exactly one and the NAME is the more precise
          // thing to show -- SPEC-011's rendering, unchanged. Icons are the
          // answer to "several", not a replacement for a name that fits.
          //
          // STACKED BELOW the count, not on top of it. Both want the midpoint.
          <text
            className="diagram-connection__actor"
            data-testid="diagram-connection-actor"
            data-actor={drawn[0]!.id}
            aria-label={`Performed by ${drawn[0]!.label}`}
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2 + 16}
            textAnchor="middle"
          >
            {drawn[0]!.label}
          </text>
        )}
        {count > 1 && drawn.length + rest.length > 0 && (
          /*
           * MERGED: every distinct actor, as icons, stacked below the count.
           *
           * Icons rather than names because a merged edge can stand for five
           * connections, and five names on one line is a wall of text where five
           * icons is a glance -- which is the whole reason SPEC-014 came first.
           *
           * FIRST TWO, THEN `+N more`. The cap lives here rather than in the
           * derivation: the derivation says what the line stands for, and how
           * many fit is a question about a canvas. A derivation that truncated
           * would also be making the JSON export's decision for it.
           */
          <foreignObject
            x={(a.x + b.x) / 2 - 60}
            y={(a.y + b.y) / 2 + 4}
            width={120}
            height={26}
            className="diagram-connection__actors"
            data-testid="diagram-connection-actors"
          >
            <div className="diagram-connection__actors-row">
              {drawn.map((entry) => (
                <span
                  key={entry.id}
                  className="diagram-connection__actor-icon"
                  data-testid="diagram-connection-actor"
                  data-actor={entry.id}
                  // The glyph is the visual channel; the NAME is what a screen
                  // reader has, and "which resources cross this boundary" has to
                  // be answerable without seeing it.
                  role="img"
                  aria-label={`Performed by ${entry.label}`}
                >
                  <NodeIcon icon={entry.icon} label={entry.label} />
                </span>
              ))}
              {rest.length > 0 && (
                // NAMED, not just counted. The two glyphs are the glance; this
                // is the only place the rest of the answer exists, and a bare
                // "+3 more" tells a reader that they are missing something
                // without telling them what. `title` would be the obvious home
                // and it is inert here -- the whole row is `pointer-events:
                // none` so a tap reaches the line -- so the name goes where
                // assistive tech will actually read it.
                <span
                  className="diagram-connection__actor-more"
                  data-testid="diagram-connection-actors-more"
                  role="img"
                  aria-label={`and ${rest.length} more: ${rest.map((e) => e.label).join(', ')}`}
                >
                  {`+${rest.length} more`}
                </span>
              )}
            </div>
          </foreignObject>
        )}
      </svg>
    )
  }

  override getIndicatorPath(shape: ConnectionShape) {
    const { start, end } = this.getTerminalsInPageSpace(shape)
    const inv = this.editor.getShapePageTransform(shape.id).clone().invert()
    const a = inv.applyToPoint(start)
    const b = inv.applyToPoint(end)
    const path = new Path2D()
    path.moveTo(a.x, a.y)
    path.lineTo(b.x, b.y)
    return path
  }

  /** Connections are positioned entirely by their bindings. */
  override onTranslateStart(shape: ConnectionShape) {
    return shape
  }

  /**
   * Re-aiming an endpoint. The connection's shape id and its two binding records
   * survive -- only a binding's `toId` moves, so this is an edit rather than a
   * delete-and-redraw.
   *
   * Nothing is written until the drop. A refusal (empty canvas, a non-node, or
   * the connection's other endpoint) therefore leaves the binding exactly as it
   * was rather than needing to be undone.
   */
  override onHandleDrag(shape: ConnectionShape, { handle }: TLHandleDragInfo<ConnectionShape>) {
    const target = this.dropTargetFor(shape, handle.id as ConnectionTerminal)
    this.editor.setHintingShapes(target ? [target.id] : [])
  }

  override onHandleDragEnd(shape: ConnectionShape, { handle }: TLHandleDragInfo<ConnectionShape>) {
    this.editor.setHintingShapes([])
    const terminal = handle.id as ConnectionTerminal
    const target = this.dropTargetFor(shape, terminal)
    if (!target) return
    const binding = this.bindingFor(shape, terminal)
    if (!binding || binding.toId === target.id) return
    this.editor.updateBinding({ ...binding, toId: target.id })
  }

  override onHandleDragCancel() {
    this.editor.setHintingShapes([])
  }

  /** The node a drop would attach to, or undefined for every refusal. */
  private dropTargetFor(shape: ConnectionShape, terminal: ConnectionTerminal): TLShape | undefined {
    const target = nodeAtPoint(this.editor, this.editor.inputs.getCurrentPagePoint())
    if (!target) return undefined
    // A self-connection is refused here as well as in the tool -- otherwise it
    // arrives by the back door, which is the whole reason this criterion exists.
    const opposite: ConnectionTerminal = terminal === 'start' ? 'end' : 'start'
    if (this.bindingFor(shape, opposite)?.toId === target.id) return undefined
    return target
  }

  boundNodeIds(shape: ConnectionShape): TLShapeId[] {
    return this.editor
      .getBindingsFromShape<ConnectionBinding>(shape, CONNECTION_BINDING_TYPE)
      .map((b) => b.toId)
  }
}

/**
 * Where the line should meet a node's border, aiming at `target`.
 *
 * When one node CONTAINS or overlaps the other -- ordinary once nesting ships --
 * the centre-to-target segment never crosses the border, so the intersection set
 * is empty. The fallback is the nearest point on the border to the target, which
 * still produces a line that starts on an edge rather than in the middle.
 */
function anchorOnBorder(
  centre: Vec,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  target: Vec,
): Vec {
  const dir = Vec.Sub(target, centre)
  if (dir.len() < 1e-6) return centre

  const halfW = (bounds.maxX - bounds.minX) / 2
  const halfH = (bounds.maxY - bounds.minY) / 2
  const scaleX = halfW / Math.abs(dir.x || 1e-9)
  const scaleY = halfH / Math.abs(dir.y || 1e-9)
  const scale = Math.min(scaleX, scaleY)
  return Vec.Add(centre, dir.clone().mul(scale))
}
