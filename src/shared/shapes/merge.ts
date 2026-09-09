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
  /**
   * The node this connection is attributed to, or null.
   *
   * PASSED IN, not looked up: this module has no store access and this spec does
   * not give it any. `mergeIndex.ts` is the one place `ConnectionEndpoints` is
   * built and the one place that can resolve a binding.
   */
  actorId: string | null
  /**
   * The kinds this connection carries, as its props hold them.
   *
   * PASSED IN like `actorId`, and for the same reason: this module has no store
   * access and this spec does not give it any. `mergeIndex.ts` is the one place
   * `ConnectionEndpoints` is built.
   */
  kinds: readonly string[]
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
   * EVERY DISTINCT ACTOR among the members, ordered by id under plain `<`.
   *
   * Replaced `actorId: string | null` in SPEC-015. That shape said "the one
   * actor, or none", and a merged line whose members disagreed had to answer
   * NONE -- a defensible way to avoid claiming one of them, and the wrong
   * outcome: the whole point of folding a container is to see what crosses its
   * boundary, and who does the crossing is most of that.
   *
   * An unmerged line has zero or one entry, so the same field serves both and
   * there is no branch. "Some attributed, some not" yields the actors that
   * exist, which is the reversal.
   *
   * ORDERED, because two clients must draw the same line without coordinating
   * and `Set` iteration order is insertion order, which is store order, which is
   * exactly what differs between them.
   */
  actorIds: string[]
  /**
   * EVERY DISTINCT KIND among the members, in the same normal form the props
   * hold: deduplicated, ordered by plain `<`.
   *
   * The rule is SPEC-015's, applied to a second field: *a folded view shows
   * every answer, never none*. Showing the representative's kinds would
   * mislabel every other member; showing none would hide exactly what folding
   * exists to reveal.
   *
   * An unmerged line carries its own connection's kinds, so one field serves
   * both cases and the renderer has no branch -- the shape `actorIds` already
   * takes.
   */
  kinds: string[]
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
  actorId: string | null
  kinds: readonly string[]
}

/**
 * Every distinct actor among a set of connections, in a deterministic order.
 *
 * Plain `<` on the id, matching the representative rule above and for the same
 * reason: the order has to come from data both clients already have.
 */
function distinctActors(members: readonly { actorId: string | null }[]): string[] {
  const seen = new Set<string>()
  for (const member of members) {
    if (member.actorId !== null) seen.add(member.actorId)
  }
  return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Every distinct kind among a set of connections, in the same deterministic
 * order `distinctActors` uses and for the same reason.
 *
 * Deliberately a sibling of `distinctActors` rather than a generalisation of
 * it: one takes a nullable field off each member and the other a list, and the
 * shared version would be a function whose only job is to hide which.
 */
function distinctKinds(members: readonly { kinds: readonly string[] }[]): string[] {
  const seen = new Set<string>()
  for (const member of members) for (const kind of member.kinds) seen.add(kind)
  return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
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
        actorIds: c.actorId === null ? [] : [c.actorId],
        kinds: distinctKinds([c]),
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
        actorIds: c.actorId === null ? [] : [c.actorId],
        kinds: distinctKinds([c]),
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
      out.set(c.connectionId, {
        hidden: true,
        startNodeId: vs,
        endNodeId: vt,
        count: 1,
        actorIds: c.actorId === null ? [] : [c.actorId],
        kinds: distinctKinds([c]),
      })
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
      actorId: c.actorId,
      kinds: c.kinds,
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
          actorIds: m.actorId === null ? [] : [m.actorId],
          kinds: distinctKinds([m]),
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

    // The MERGED line carries EVERY distinct actor its members name. Not the
    // representative's -- that silently misattributes the rest -- and not none,
    // which was the old rule and hid the thing collapse exists to reveal.
    const mergedActors = distinctActors(members)
    // And every distinct KIND, by the same rule. A merged line that showed only
    // the representative's kinds would call a data transfer a permission edge
    // because the smallest id happened to be one.
    const mergedKinds = distinctKinds(members)

    for (const m of members) {
      out.set(m.id, {
        hidden: m !== representative,
        startNodeId: m.startNodeId,
        endNodeId: m.endNodeId,
        count: m === representative ? members.length : 1,
        actorIds: m === representative ? mergedActors : m.actorId === null ? [] : [m.actorId],
        kinds: m === representative ? mergedKinds : distinctKinds([m]),
      })
    }
  }

  return out
}
