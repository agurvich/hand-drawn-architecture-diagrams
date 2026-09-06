import { createBindingId, createShapeId, type Editor, type TLDrawShape, type TLShape } from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import {
  NODE_SHAPE_TYPE,
  CONNECTION_SHAPE_TYPE,
  CONNECTION_BINDING_TYPE,
  nodeShapeDefaultProps,
} from '@shared/shapes'
import { effectiveCollapsed } from '@shared/scenes'
import { recognise, isPurposeful, type Point } from '@shared/sketch'
import { nodeAtPoint } from '../nodeAtPoint'
import { sceneState } from '../sceneView'
import { sketchModeOn } from './sketchMode'

/**
 * Turn a finished stroke into a node or a connection.
 *
 * ON STROKE COMPLETION, not on creation. tldraw creates the draw shape ONCE at
 * pointer-down, with a single point at the origin; every later point is an
 * update, and `complete()` is an update too. An after-CREATE hook therefore sees
 * one point at (0,0), classifies it as nothing, and the feature is inert while
 * looking wired up.
 */

/** What the recogniser is allowed to convert. */
const DRAW_SHAPE_TYPE = 'draw'

/**
 * Announced to assistive technology, because the canvas changing under you with
 * no visible cause is precisely what a screen-reader user cannot see.
 */
export const SKETCH_ANNOUNCE_ID = 'sketch-recognition-status'

function announce(message: string) {
  const region = document.getElementById(SKETCH_ANNOUNCE_ID)
  if (region) region.textContent = message
}

/**
 * A draw shape's points, in PAGE space.
 *
 * Two steps, both easy to get wrong. A `TLDrawShapeSegment` has no `points`
 * field -- it has `path`, delta-encoded base64, decoded by `b64Vecs.decodePoints`
 * (`getPointsFromDrawSegments` would do it too, but it lives in `tldraw` and the
 * shared allowlist does not admit that). And the decoded points are SHAPE-LOCAL:
 * the tool seeds (0,0) at pointer-down and records `getPointInShapeSpace`
 * thereafter, so handing them straight to `nodeAtPoint` -- which hit-tests in
 * page space -- tests the wrong coordinates entirely.
 */
function pagePoints(editor: Editor, shape: TLDrawShape): Point[] {
  const transform = editor.getShapePageTransform(shape.id)
  if (!transform) return []
  return shape.props.segments
    .flatMap((segment) => b64Vecs.decodePoints(segment.path))
    .map((p) => {
      const page = transform.applyToPoint({ x: p.x, y: p.y })
      return { x: page.x, y: page.y }
    })
}

/**
 * The node a converted box should be parented to, or the page.
 *
 * An EXPANDED container containing the whole stroke adopts it. A collapsed one
 * does not: it refuses children while folded, and a node parented into it would
 * vanish the moment it was created.
 */
function containerFor(editor: Editor, min: Point, max: Point): TLShape | undefined {
  const corners: Point[] = [
    { x: min.x, y: min.y },
    { x: max.x, y: min.y },
    { x: min.x, y: max.y },
    { x: max.x, y: max.y },
  ]
  let candidate: TLShape | undefined
  for (const corner of corners) {
    const under = nodeAtPoint(editor, corner)
    // Every corner must land in the SAME container, or the box is not inside it.
    if (!under) return undefined
    if (candidate && under.id !== candidate.id) return undefined
    candidate = under
  }
  if (!candidate) return undefined
  // EFFECTIVE collapse, the same rule `canReceiveNewChildrenOfType` uses for a
  // dropped node -- a container folded only by a SCENE hides its children just
  // as thoroughly as one folded by its own prop, so it must refuse here too.
  // Reusing that rule is what keeps the two paths from disagreeing.
  const { scene, offScene } = sceneState(editor)
  const collapsed = (candidate.props as { collapsed?: unknown }).collapsed === true
  return effectiveCollapsed(candidate.id, collapsed, scene, offScene) ? undefined : candidate
}

/**
 * Convert one finished stroke, or leave it alone.
 *
 * Returns whether it converted, so the e2e can assert on the outcome rather than
 * on a shape count that a different bug could also produce.
 */
export function convertStroke(editor: Editor, shape: TLDrawShape): boolean {
  const points = pagePoints(editor, shape)
  if (points.length === 0) return false

  const verdict = recognise(points)

  /*
   * THE OVERRIDE, and the reason FR-003's rule is outcome-shaped rather than
   * order-shaped: a stroke whose two ends resolve to two DIFFERENT nodes is a
   * connection, whatever the corner count says.
   *
   * A connection routed around an obstacle -- right, down, right -- is either a
   * closed rectangle-ish path (which the node-blind classifier correctly calls a
   * box) or an open one too bent to be a line (which it correctly refuses).
   * Either way the classifier is right about the SHAPE and wrong about the
   * INTENT, and it cannot be otherwise, because intent is what is on the canvas.
   *
   * So the override outweighs a refusal as well as a box -- but only for a
   * PURPOSEFUL stroke, one that went from one end to the other rather than
   * wandering. Without that, a scribble drawn across two nodes becomes a
   * connection, which is the annotation-eating failure in its other costume.
   */
  const first = points[0]!
  const last = points[points.length - 1]!
  const fromNode = nodeAtPoint(editor, first)
  const toNode = nodeAtPoint(editor, last)
  const isConnection = fromNode && toNode && fromNode.id !== toNode.id

  if (isConnection && (verdict.kind !== 'none' || isPurposeful(points))) {
    const connectionId = createShapeId()
    editor.markHistoryStoppingPoint()
    editor.run(() => {
      editor.deleteShape(shape.id)
      editor.createShape({ id: connectionId, type: CONNECTION_SHAPE_TYPE, x: 0, y: 0 })
      // DIRECTION FOLLOWS THE STROKE: the end you started from is the source.
      for (const [terminal, toId] of [
        ['start', fromNode.id],
        ['end', toNode.id],
      ] as const) {
        editor.createBinding({
          id: createBindingId(),
          type: CONNECTION_BINDING_TYPE,
          fromId: connectionId,
          toId,
          props: { terminal },
        })
      }
    })
    announce('Sketch became a connection.')
    return true
  }

  if (verdict.kind !== 'box') return false

  const { min, max } = verdict
  const container = containerFor(editor, min, max)
  const nodeId = createShapeId()

  editor.markHistoryStoppingPoint()
  editor.run(() => {
    editor.deleteShape(shape.id)
    if (container) {
      // Created WITH the parent, never reparented afterwards. `reparentShapes`
      // converts the position; creating with a parentId takes x/y as already
      // parent-local. Naming the wrong one silently misplaces every nested box.
      const parentTransform = editor.getShapePageTransform(container.id)
      const local = parentTransform
        ? parentTransform.clone().invert().applyToPoint({ x: min.x, y: min.y })
        : { x: min.x, y: min.y }
      editor.createShape({
        id: nodeId,
        type: NODE_SHAPE_TYPE,
        parentId: container.id,
        x: local.x,
        y: local.y,
        props: { ...nodeShapeDefaultProps, w: max.x - min.x, h: max.y - min.y },
      })
    } else {
      editor.createShape({
        id: nodeId,
        type: NODE_SHAPE_TYPE,
        x: min.x,
        y: min.y,
        props: { ...nodeShapeDefaultProps, w: max.x - min.x, h: max.y - min.y },
      })
    }
    // Selected, so the next thing you do is name it.
    editor.setSelectedShapes([nodeId])
  })
  announce(container ? 'Sketch became a node inside a container.' : 'Sketch became a node.')
  return true
}

/**
 * Watch for completed strokes and convert them while the mode is on.
 *
 * Returns a disposer.
 */
export function registerSketchRecognition(editor: Editor): () => void {
  // RE-ENTRANCY GUARD: deleting the draw shape and creating the node both fire
  // change handlers, and the create fires this one again.
  let converting = false

  return editor.sideEffects.registerAfterChangeHandler('shape', (prev, next, source) => {
    if (converting) return
    /*
     * ONLY STROKES THIS CLIENT DREW. Without this the mode is per-viewer in name
     * only: a stroke arriving over the wire is a shape change like any other, so
     * a client with recognition ON converts a stroke somebody ELSE just drew,
     * the node syncs back, and the second person watches their sketch turn into
     * a rectangle having never enabled anything. The record is session-scoped,
     * which keeps the SETTING local -- this is what keeps its EFFECT local.
     */
    if (source !== 'user') return
    if (next.type !== DRAW_SHAPE_TYPE) return
    const before = prev as TLDrawShape
    const after = next as TLDrawShape
    // The completion edge, not the completed state: without the `prev` half this
    // fires on every later update to an already-finished stroke.
    if (before.props.isComplete || !after.props.isComplete) return
    if (!sketchModeOn(editor)) return

    converting = true
    try {
      convertStroke(editor, after)
    } finally {
      converting = false
    }
  })
}
