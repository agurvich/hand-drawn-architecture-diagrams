import {
  ShapeUtil,
  Vec,
  Group2d,
  Edge2d,
  type TLHandle,
  type TLShapeId,
  type TLShapeUtilCanBindOpts,
} from 'tldraw'
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
 * write to the store once per pointer frame during a drag.
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

  /** Page-space endpoints, resolved through the bindings when they exist. */
  getTerminalsInPageSpace(shape: ConnectionShape): { start: Vec; end: Vec } {
    const shapePage = this.editor.getShapePageTransform(shape.id)
    const fallback = (p: { x: number; y: number }) => shapePage.applyToPoint(new Vec(p.x, p.y))

    const resolve = (terminal: ConnectionTerminal, other: Vec) => {
      const binding = this.bindingFor(shape, terminal)
      if (!binding) return null
      const bounds = this.editor.getShapePageBounds(binding.toId)
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
    const binding = this.bindingFor(shape, terminal)
    if (!binding) return null
    return this.editor.getShapePageBounds(binding.toId)?.center ?? null
  }

  override getGeometry(shape: ConnectionShape) {
    const { start, end } = this.getTerminalsInPageSpace(shape)
    const inv = this.editor.getShapePageTransform(shape.id).clone().invert()
    return new Group2d({
      children: [new Edge2d({ start: inv.applyToPoint(start), end: inv.applyToPoint(end) })],
    })
  }

  override getHandles(shape: ConnectionShape): TLHandle[] {
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
    return (
      <svg className="tl-svg-container" data-testid="diagram-connection">
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
