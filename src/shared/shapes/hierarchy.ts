import { NODE_SHAPE_TYPE, type NodeShapeProps } from './node'

/**
 * The hierarchy rules, as pure functions.
 *
 * Ported in spirit from the predecessor's `engine/ancestry.ts`, reimplemented
 * over tldraw records rather than lifted. Kept runtime-agnostic and free of any
 * `tldraw` import so it stays inside the allowlist `shared-imports.test.ts`
 * enforces -- which also means it is unit-testable without an Editor.
 *
 * Callers inject accessors rather than passing an Editor, for the same reason.
 */

/** The minimum a shape must look like for these rules to apply. */
export interface HierarchyShape {
  id: string
  type: string
  parentId: string
  props?: Partial<NodeShapeProps>
}

export type GetShape = (id: string) => HierarchyShape | undefined
export type GetChildIds = (parentId: string) => readonly string[]

/** A parentId that names a page rather than a shape terminates every walk. */
function isShapeId(id: string): boolean {
  return id.startsWith('shape:')
}

function isCollapsedContainer(shape: HierarchyShape): boolean {
  return shape.type === NODE_SHAPE_TYPE && shape.props?.collapsed === true
}

/**
 * The NEAREST collapsed ancestor, or null when nothing hides this shape.
 *
 * Nearest rather than any: a shape inside two nested collapsed containers is
 * hidden once, and the outer one is not the thing standing in for it.
 * The shape's OWN collapsed flag never hides the shape itself -- a collapsed
 * container is still visible, that is the entire point.
 */
export function collapsedAncestorOf(
  shape: HierarchyShape,
  getShape: GetShape,
): HierarchyShape | null {
  const seen = new Set<string>([shape.id])
  let parentId = shape.parentId
  while (isShapeId(parentId)) {
    if (seen.has(parentId)) return null // cycle: refuse to loop forever
    seen.add(parentId)
    const parent = getShape(parentId)
    if (!parent) return null
    if (isCollapsedContainer(parent)) return parent
    parentId = parent.parentId
  }
  return null
}

/** Drives getShapeVisibility. */
export function isHiddenByCollapse(shape: HierarchyShape, getShape: GetShape): boolean {
  return collapsedAncestorOf(shape, getShape) !== null
}

/**
 * Would parenting `shapeId` to `nextParentId` make the shape its own ancestor?
 *
 * Guarded BEFORE calling reparentShapes, which throws on a self-parent rather
 * than no-op'ing. The drag path is already safe -- the editor excludes the
 * dragged shapes' descendants from candidate targets -- so this covers the
 * programmatic path.
 */
export function wouldCreateCycle(
  shapeId: string,
  nextParentId: string,
  getShape: GetShape,
): boolean {
  if (shapeId === nextParentId) return true
  const seen = new Set<string>()
  let cursor = nextParentId
  while (isShapeId(cursor)) {
    if (cursor === shapeId) return true
    if (seen.has(cursor)) return true // pre-existing cycle; refuse either way
    seen.add(cursor)
    const parent = getShape(cursor)
    if (!parent) return false
    cursor = parent.parentId
  }
  return false
}

/** Every descendant id, depth-first. Used for the collapsed container's count. */
export function descendantIds(shapeId: string, getChildIds: GetChildIds): string[] {
  const out: string[] = []
  const seen = new Set<string>([shapeId])
  const walk = (id: string) => {
    for (const childId of getChildIds(id)) {
      if (seen.has(childId)) continue // cycle guard: never recurse forever
      seen.add(childId)
      out.push(childId)
      walk(childId)
    }
  }
  walk(shapeId)
  return out
}

export function descendantCount(shapeId: string, getChildIds: GetChildIds): number {
  return descendantIds(shapeId, getChildIds).length
}
