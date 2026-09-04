import { isCollapsedContainer, isShapeId, type GetShape, type HierarchyShape } from './hierarchy'

/**
 * The merged view of the connection graph, as a pure derivation.
 *
 * A collapsed container stands in for its contents, so connections crossing its
 * boundary are re-drawn against it, ones that become the same relationship merge,
 * and ones that turn out to be internal disappear.
 *
 * NOTHING HERE IS WRITTEN TO THE STORE. The tempting implementation -- create a
 * merged connection record on collapse, delete it on expand -- is a defect under
 * sync: two clients collapsing the same container both write, and the room keeps
 * duplicate records no expand deletes. Every client derives the same answer from
 * records that already exist instead.
 *
 * Kept free of any `tldraw` import, like `hierarchy.ts`, so it stays inside the
 * allowlist `shared-imports.test.ts` enforces and is unit-testable without an
 * Editor. Callers inject `getShape`.
 */

/** One connection's terminals, as the caller reads them off the bindings. */
export interface ConnectionEndpoints {
  connectionId: string
  /** The bound node id per terminal; null when that terminal has no binding. */
  startNodeId: string | null
  endNodeId: string | null
}

/** What the derivation concluded about one connection. */
export interface MergeEntry {
  /**
   * The single answer `shouldHide` asks. True for a connection internal to a
   * collapsed container, a binding pointing at a shape that is gone, and every
   * member of a merge group except the representative.
   */
  hidden: boolean
  /**
   * The shapes the line is drawn against, after resolution. Null on a terminal
   * with no binding -- the shape's own start/end prop is used there, as SPEC-005
   * already does mid-drag. A terminal whose node is gone keeps its raw bound id,
   * there being nothing to resolve it against.
   */
  startNodeId: string | null
  endNodeId: string | null
  /** How many connections this line stands for; 1 when not merged. */
  count: number
}

export type MergeIndex = ReadonlyMap<string, MergeEntry>

/**
 * The OUTERMOST collapsed ancestor, or the shape itself when nothing hides it.
 *
 * Outermost rather than nearest -- which is what `collapsedAncestorOf` gives, and
 * why both exist. With a collapsed container inside another collapsed container,
 * only the outer one is on screen, so resolving to the inner one would draw a
 * line to something invisible.
 *
 * On a parentId cycle it returns the shape itself, the same refuse-to-loop
 * convention the rest of `hierarchy.ts` uses: a cycle degrades to "unresolved"
 * rather than to an asymmetric answer where a resolves to b and b to itself.
 */
export function visibleStandInFor(shape: HierarchyShape, getShape: GetShape): HierarchyShape {
  const seen = new Set<string>([shape.id])
  let outermost: HierarchyShape | null = null
  let parentId = shape.parentId
  while (isShapeId(parentId)) {
    if (seen.has(parentId)) return shape
    seen.add(parentId)
    const parent = getShape(parentId)
    if (!parent) break
    if (isCollapsedContainer(parent)) outermost = parent
    parentId = parent.parentId
  }
  return outermost ?? shape
}

function resolveId(id: string | null, getShape: GetShape): string | null {
  if (id === null) return null
  const shape = getShape(id)
  return shape ? visibleStandInFor(shape, getShape).id : id
}

/** A survivor of rules 1-3, carrying the bound ids the gate needs. */
interface Member {
  id: string
  startNodeId: string
  endNodeId: string
  /** Did collapse actually move either endpoint? Rule 5's input. */
  resolved: boolean
}

export function computeMergeIndex(
  connections: readonly ConnectionEndpoints[],
  getShape: GetShape,
): MergeIndex {
  const out = new Map<string, MergeEntry>()
  const groups = new Map<string, Member[]>()

  for (const c of connections) {
    // Rule 1: a terminal with no binding -- the mid-drag state. Never hidden and
    // never grouped, but the BOUND half still resolves, or a half-drawn line
    // whose bound end sits inside a collapsed container would be drawn into the
    // closed container rather than against it.
    if (c.startNodeId === null || c.endNodeId === null) {
      out.set(c.connectionId, {
        hidden: false,
        startNodeId: resolveId(c.startNodeId, getShape),
        endNodeId: resolveId(c.endNodeId, getShape),
        count: 1,
      })
      continue
    }

    const start = getShape(c.startNodeId)
    const end = getShape(c.endNodeId)

    // Rule 2: a binding pointing at a shape that is gone. SPEC-005's
    // onBeforeDeleteToShape should make this transient; hiding is the same
    // defensive answer the pre-merge visibility branch gave.
    if (!start || !end) {
      out.set(c.connectionId, {
        hidden: true,
        startNodeId: start ? visibleStandInFor(start, getShape).id : c.startNodeId,
        endNodeId: end ? visibleStandInFor(end, getShape).id : c.endNodeId,
        count: 1,
      })
      continue
    }

    const vs = visibleStandInFor(start, getShape).id
    const vt = visibleStandInFor(end, getShape).id

    // Rule 3: both ends resolve to the same shape. Either the connection is
    // internal to a collapsed container, or it is a self-connection -- which
    // resolves equal at ANY collapse state, so an A->A hides even in a fully
    // expanded diagram. Nothing in the app can draw one; noted, not guarded.
    if (vs === vt) {
      out.set(c.connectionId, { hidden: true, startNodeId: vs, endNodeId: vt, count: 1 })
      continue
    }

    // Rule 4: a survivor. Direction is part of the key, so A->B and B->A are two
    // relationships, not one.
    const key = `${vs}=>${vt}`
    const member: Member = {
      id: c.connectionId,
      startNodeId: vs,
      endNodeId: vt,
      resolved: vs !== c.startNodeId || vt !== c.endNodeId,
    }
    const group = groups.get(key)
    if (group) group.push(member)
    else groups.set(key, [member])
  }

  for (const members of groups.values()) {
    // Rule 5, the gate: a group merges only if collapse actually moved one of its
    // endpoints. Without it, two hand-drawn connections between two VISIBLE nodes
    // would merge, so an expanded diagram would lose a line and grow a count
    // badge -- and merging is meant to be a consequence of collapse alone.
    //
    // The gate is on the GROUP, not the member: once collapse has made a
    // relationship coarse, every connection that has become that relationship
    // merges into it, hand-drawn ones included.
    const merges = members.length > 1 && members.some((m) => m.resolved)
    if (!merges) {
      for (const m of members) {
        out.set(m.id, {
          hidden: false,
          startNodeId: m.startNodeId,
          endNodeId: m.endNodeId,
          count: 1,
        })
      }
      continue
    }

    // Smallest id under plain `<` -- UTF-16 code-unit order, deliberately not
    // localeCompare, which disagrees with `<` on the mixed-case ids tldraw
    // generates. Every client sorts the same way with no coordination, which is
    // what makes two clients draw the same line.
    let representative = members[0]!
    for (const m of members) if (m.id < representative.id) representative = m

    for (const m of members) {
      out.set(m.id, {
        hidden: m !== representative,
        startNodeId: m.startNodeId,
        endNodeId: m.endNodeId,
        count: m === representative ? members.length : 1,
      })
    }
  }

  return out
}
