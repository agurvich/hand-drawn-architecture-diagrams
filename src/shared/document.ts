import { NODE_SHAPE_TYPE, type NodeShapeProps } from './shapes/node'
import { CONNECTION_SHAPE_TYPE, type ConnectionShapeProps } from './shapes/connection'
import { CONNECTION_BINDING_TYPE, type ConnectionTerminal } from './bindings/connection'
import { isShapeId, SHAPE_ID_PREFIX } from './shapes/hierarchy'

/**
 * The diagram DOCUMENT: a plain JSON representation of a diagram, copyable out,
 * pasteable in, and writable by hand or by a model that has never seen this
 * codebase.
 *
 * Two properties this module exists to hold:
 *
 *   1. VALIDATION IS STRICT AND TOTAL. The predecessor checked that four keys
 *      were arrays and left every referential invariant to the author, so a bad
 *      reference did not error -- it silently rendered wrong. Here a document is
 *      accepted whole or rejected with the path that is broken.
 *   2. EXPORT NEVER EMITS A DOCUMENT parseDocument WOULD REJECT. That is not
 *      automatic: a binding can point at a deleted shape, and a node can be
 *      parented to a tldraw shape this schema cannot describe. The documentable
 *      rule below is what closes it.
 *
 * Imports are relative and stay inside the shared allowlist. Note it imports the
 * sibling MODULES, not `./shapes` -- `shapes/index.ts` re-exports this file, and
 * going through the barrel would be circular.
 */

export const DOCUMENT_VERSION = 1

/**
 * Ids are ONE namespace across nodes and connections, because both mint
 * `shape:<id>` -- a collision is not a naming preference, it is one record
 * overwriting another.
 *
 * The pattern is a deliberate NARROWING, not a platform limit: tldraw validates
 * only the `shape:` prefix and would accept far more. It has one concrete hazard
 * behind it -- tldraw interpolates a shape id into a `[data-shape-id="…"]`
 * selector, which throws on an embedded quote -- and otherwise buys ids that are
 * safe in URLs, filenames and prose.
 */
export const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/

/**
 * A hex color or a bare CSS keyword. The node's own default is the keyword
 * `black`, so keywords must be allowed -- which means a MISSPELLED keyword
 * passes here and then renders as nothing. The authoring guide says so rather
 * than implying the check is complete.
 */
export const DOCUMENT_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$|^[a-z]+$/

export interface DocumentNode {
  id: string
  label: string
  /** Relative to `parentId` when set, absolute otherwise -- as the record stores it. */
  x: number
  y: number
  w: number
  h: number
  /** All three omitted on export when equal to the shape default. */
  rotation?: number
  color?: string
  collapsed?: boolean
  parentId?: string
}

export interface DocumentConnection {
  id: string
  sourceId: string
  targetId: string
}

export interface DiagramDocument {
  version: number
  nodes: DocumentNode[]
  connections: DocumentConnection[]
}

/** Total: the whole document or a message. Never a partial result. */
export type ParseResult = { ok: true; document: DiagramDocument } | { ok: false; error: string }

// --- The records the conversions consume and produce. `fromDocument` returns
// --- exactly what `toDocument` takes, so the round trip composes with no
// --- intermediate type -- which is what makes it testable without an Editor.

export interface ExportableNode {
  /** The raw `shape:...` id; the prefix is stripped on the way into a document. */
  id: string
  /** A shape id or a page id. */
  parentId: string
  x: number
  y: number
  rotation: number
  props: NodeShapeProps
}

/** A connection shape carries no endpoints of its own -- the bindings do. */
export interface ExportableConnection {
  id: string
  parentId: string
  x: number
  y: number
  rotation: number
  props: ConnectionShapeProps
}

export interface BindingDescriptor {
  type: typeof CONNECTION_BINDING_TYPE
  fromId: string
  toId: string
  props: { terminal: ConnectionTerminal }
}

const TOP_LEVEL_KEYS = ['version', 'nodes', 'connections']
const NODE_KEYS = ['id', 'label', 'x', 'y', 'w', 'h', 'rotation', 'color', 'collapsed', 'parentId']
const CONNECTION_KEYS = ['id', 'sourceId', 'targetId']

function fail(path: string, reason: string): ParseResult {
  return { ok: false, error: `${path}: ${reason}` }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Unknown keys are REJECTED, not ignored, and this is the rule that decides it:
 * an author who writes `frames` today must be told it does nothing. Silently
 * dropping it is the predecessor's failure mode in a new costume.
 */
function unknownKey(object: Record<string, unknown>, allowed: string[]): string | null {
  return Object.keys(object).find((key) => !allowed.includes(key)) ?? null
}

function checkNumber(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a finite number'
}

export function parseDocument(input: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(input) as unknown
  } catch (error) {
    return fail('document', `not valid JSON (${(error as Error).message})`)
  }

  if (!isPlainObject(raw)) return fail('document', 'must be a JSON object')

  const extraTop = unknownKey(raw, TOP_LEVEL_KEYS)
  if (extraTop !== null) return fail(`document.${extraTop}`, 'unknown key')

  if (!('version' in raw)) return fail('document.version', 'missing')
  if (raw.version !== DOCUMENT_VERSION) {
    return fail(
      'document.version',
      `expected ${DOCUMENT_VERSION}, got ${JSON.stringify(raw.version)}`,
    )
  }

  // Optional on input, so a node-only document is valid; both are always present
  // on export.
  const rawNodes = raw.nodes ?? []
  const rawConnections = raw.connections ?? []
  if (!Array.isArray(rawNodes)) return fail('document.nodes', 'must be an array')
  if (!Array.isArray(rawConnections)) return fail('document.connections', 'must be an array')

  const nodes: DocumentNode[] = []
  for (let i = 0; i < rawNodes.length; i++) {
    const path = `nodes[${i}]`
    const entry: unknown = rawNodes[i]
    if (!isPlainObject(entry)) return fail(path, 'must be an object')

    const extra = unknownKey(entry, NODE_KEYS)
    if (extra !== null) return fail(`${path}.${extra}`, 'unknown key')

    if (typeof entry.id !== 'string') return fail(`${path}.id`, 'must be a string')
    if (!DOCUMENT_ID_PATTERN.test(entry.id)) {
      return fail(`${path}.id`, `must match ${String(DOCUMENT_ID_PATTERN)}`)
    }
    if (typeof entry.label !== 'string') return fail(`${path}.label`, 'must be a string')

    for (const key of ['x', 'y', 'w', 'h'] as const) {
      const reason = checkNumber(entry[key])
      if (reason !== null) return fail(`${path}.${key}`, reason)
    }

    const node: DocumentNode = {
      id: entry.id,
      label: entry.label,
      x: entry.x as number,
      y: entry.y as number,
      w: entry.w as number,
      h: entry.h as number,
    }

    if (entry.rotation !== undefined) {
      const reason = checkNumber(entry.rotation)
      if (reason !== null) return fail(`${path}.rotation`, reason)
      node.rotation = entry.rotation as number
    }
    if (entry.color !== undefined) {
      if (typeof entry.color !== 'string') return fail(`${path}.color`, 'must be a string')
      if (!DOCUMENT_COLOR_PATTERN.test(entry.color)) {
        return fail(`${path}.color`, 'must be a hex color or a CSS color keyword')
      }
      node.color = entry.color
    }
    if (entry.collapsed !== undefined) {
      if (typeof entry.collapsed !== 'boolean')
        return fail(`${path}.collapsed`, 'must be a boolean')
      node.collapsed = entry.collapsed
    }
    if (entry.parentId !== undefined) {
      if (typeof entry.parentId !== 'string') return fail(`${path}.parentId`, 'must be a string')
      node.parentId = entry.parentId
    }

    nodes.push(node)
  }

  const connections: DocumentConnection[] = []
  for (let i = 0; i < rawConnections.length; i++) {
    const path = `connections[${i}]`
    const entry: unknown = rawConnections[i]
    if (!isPlainObject(entry)) return fail(path, 'must be an object')

    const extra = unknownKey(entry, CONNECTION_KEYS)
    if (extra !== null) return fail(`${path}.${extra}`, 'unknown key')

    for (const key of CONNECTION_KEYS) {
      if (typeof entry[key] !== 'string') return fail(`${path}.${key}`, 'must be a string')
    }
    if (!DOCUMENT_ID_PATTERN.test(entry.id as string)) {
      return fail(`${path}.id`, `must match ${String(DOCUMENT_ID_PATTERN)}`)
    }

    connections.push({
      id: entry.id as string,
      sourceId: entry.sourceId as string,
      targetId: entry.targetId as string,
    })
  }

  // One namespace. A connection id equal to a node id is not a style question:
  // the second createShape replaces the first record, and the survivor is then
  // bound as though it were a node.
  const seen = new Map<string, string>()
  for (const [i, node] of nodes.entries()) {
    if (seen.has(node.id)) return fail(`nodes[${i}].id`, `duplicate id ${JSON.stringify(node.id)}`)
    seen.set(node.id, 'node')
  }
  for (const [i, connection] of connections.entries()) {
    const existing = seen.get(connection.id)
    if (existing !== undefined) {
      return fail(
        `connections[${i}].id`,
        `duplicate id ${JSON.stringify(connection.id)} (already used by a ${existing})`,
      )
    }
    seen.set(connection.id, 'connection')
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  for (const [i, node] of nodes.entries()) {
    if (node.parentId !== undefined && !nodeIds.has(node.parentId)) {
      return fail(`nodes[${i}].parentId`, `no node with id ${JSON.stringify(node.parentId)}`)
    }
  }
  for (const [i, connection] of connections.entries()) {
    for (const key of ['sourceId', 'targetId'] as const) {
      if (!nodeIds.has(connection[key])) {
        return fail(
          `connections[${i}].${key}`,
          `no node with id ${JSON.stringify(connection[key])}`,
        )
      }
    }
  }

  const cyclePath = findCycle(nodes)
  if (cyclePath !== null) return fail(cyclePath, 'parentId cycle')

  return { ok: true, document: { version: DOCUMENT_VERSION, nodes, connections } }
}

/**
 * Colored depth-first search: LINEAR, not a walk per node.
 *
 * Nothing bounds document size, and the per-node ancestor walk is the version
 * that is obvious to write -- measured at 725 ms for 5,000 nodes in a single
 * parent chain and 12.5 s for 20,000.
 *
 * Returns the path of the LOWEST-INDEXED member of a cycle. In a cycle every
 * member is equally offending, so "whichever one we noticed first" would make
 * the message depend on iteration order.
 */
function findCycle(nodes: readonly DocumentNode[]): string | null {
  const indexById = new Map(nodes.map((node, i) => [node.id, i]))
  const parentById = new Map(nodes.map((node) => [node.id, node.parentId]))
  const state = new Map<string, 'visiting' | 'done'>()
  let lowest: number | null = null

  for (const node of nodes) {
    if (state.get(node.id) !== undefined) continue
    const stack: string[] = []
    let cursor: string | undefined = node.id
    while (cursor !== undefined && state.get(cursor) === undefined) {
      state.set(cursor, 'visiting')
      stack.push(cursor)
      cursor = parentById.get(cursor)
    }
    if (cursor !== undefined && state.get(cursor) === 'visiting') {
      // Everything from `cursor` to the top of the stack is the cycle itself.
      for (let i = stack.indexOf(cursor); i < stack.length; i++) {
        const index = indexById.get(stack[i]!)
        if (index !== undefined && (lowest === null || index < lowest)) lowest = index
      }
    }
    for (const id of stack) state.set(id, 'done')
  }

  return lowest === null ? null : `nodes[${lowest}].parentId`
}

/**
 * Whether a node can be described by a document at all.
 *
 * A node is DOCUMENTABLE when every ancestor between it and the page is itself
 * an exported `diagramNode`. A node dragged into a tldraw shape the schema
 * cannot describe -- a `frame`, say -- is not, and takes its subtree with it.
 *
 * Memoised, which gives linearity and the cycle guard together: without the
 * `visiting` marker a parentId cycle in hand-built records hangs the caller
 * rather than failing it, and every walk in `hierarchy.ts` carries the same
 * guard for the same reason.
 */
function documentableNodeIds(nodes: readonly ExportableNode[]): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const verdict = new Map<string, boolean>()

  const resolve = (id: string): boolean => {
    const cached = verdict.get(id)
    if (cached !== undefined) return cached

    const chain: string[] = []
    let cursor: string | undefined = id
    let answer = false
    while (cursor !== undefined) {
      const cachedStep = verdict.get(cursor)
      if (cachedStep !== undefined) {
        answer = cachedStep
        break
      }
      const node = byId.get(cursor)
      if (node === undefined) {
        // Reached a shape the document cannot describe.
        answer = false
        break
      }
      verdict.set(cursor, false) // provisional: breaks a cycle rather than looping
      chain.push(cursor)
      if (!isShapeId(node.parentId)) {
        answer = true // reached the page through nodes only
        break
      }
      cursor = node.parentId
    }
    for (const step of chain) verdict.set(step, answer)
    return answer
  }

  return new Set(nodes.filter((node) => resolve(node.id)).map((node) => node.id))
}

function documentId(shapeId: string): string {
  return shapeId.startsWith(SHAPE_ID_PREFIX) ? shapeId.slice(SHAPE_ID_PREFIX.length) : shapeId
}

/**
 * Records to a document.
 *
 * Takes the BINDINGS rather than pre-joined endpoints, because joining them is
 * where "no binding for this terminal" and "a binding pointing at a shape that
 * is gone" get decided -- and those decisions belong to the format, not to the
 * caller.
 */
export function toDocument(
  nodes: readonly ExportableNode[],
  connections: readonly ExportableConnection[],
  bindings: readonly BindingDescriptor[],
): DiagramDocument {
  const documentable = documentableNodeIds(nodes)

  const documentNodes: DocumentNode[] = nodes
    .filter((node) => documentable.has(node.id))
    .map((node) => {
      const out: DocumentNode = {
        id: documentId(node.id),
        label: node.props.label,
        x: node.x,
        y: node.y,
        w: node.props.w,
        h: node.props.h,
      }
      // One omit-at-default rule for all three: a field annotated for two of
      // them and silent on the third is how an exporter and a guide diverge.
      if (node.rotation !== 0) out.rotation = node.rotation
      if (node.props.color !== DEFAULT_NODE_COLOR) out.color = node.props.color
      if (node.props.collapsed) out.collapsed = true
      if (isShapeId(node.parentId)) out.parentId = documentId(node.parentId)
      return out
    })

  const documentConnections: DocumentConnection[] = []
  for (const connection of connections) {
    // PER TERMINAL, never by binding count. Nothing at the record level forbids
    // two bindings on the same terminal -- two clients re-aiming the same end
    // concurrently produce exactly that, since sync is last-write-wins per
    // record, not per (shape, terminal). A count test would then export a
    // connection with an undefined targetId, which parseDocument rejects.
    const terminal = (want: ConnectionTerminal) =>
      bindings.find((b) => b.fromId === connection.id && b.props.terminal === want)
    const source = terminal('start')
    const target = terminal('end')
    if (!source || !target) continue
    if (!documentable.has(source.toId) || !documentable.has(target.toId)) continue
    documentConnections.push({
      id: documentId(connection.id),
      sourceId: documentId(source.toId),
      targetId: documentId(target.toId),
    })
  }

  // Plain `<`, matching merge.ts's representative rule and for the same reason:
  // localeCompare disagrees with it on the mixed-case ids the pattern permits.
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

  return {
    version: DOCUMENT_VERSION,
    nodes: documentNodes.sort(byId),
    connections: documentConnections.sort(byId),
  }
}

/** The node shape's own default, restated here only as the omit-at-default test. */
const DEFAULT_NODE_COLOR = 'black'

/**
 * A document to records.
 *
 * Returns exactly what `toDocument` consumes, so the round trip composes with no
 * intermediate type. `pageId` is required because a top-level node's parentId is
 * the page's, which the document does not carry.
 *
 * Nodes come back TOPOLOGICALLY ORDERED by parentId. tldraw's `createShapes`
 * does accept a parent that appears elsewhere in the same batch, so this is not
 * forced by the API -- but it is free, it keeps the function correct if a caller
 * ever creates in chunks, and `parseDocument`'s cycle rejection is what makes it
 * total.
 */
export function fromDocument(
  document: DiagramDocument,
  pageId: string,
): {
  nodes: ExportableNode[]
  connections: ExportableConnection[]
  bindings: BindingDescriptor[]
} {
  const shapeId = (id: string) => `${SHAPE_ID_PREFIX}${id}`
  const byId = new Map(document.nodes.map((node) => [node.id, node]))

  const ordered: DocumentNode[] = []
  const placed = new Set<string>()
  const place = (node: DocumentNode) => {
    if (placed.has(node.id)) return
    placed.add(node.id)
    const parent = node.parentId === undefined ? undefined : byId.get(node.parentId)
    if (parent !== undefined) place(parent)
    ordered.push(node)
  }
  for (const node of document.nodes) place(node)

  const nodes: ExportableNode[] = ordered.map((node) => ({
    id: shapeId(node.id),
    parentId: node.parentId === undefined ? pageId : shapeId(node.parentId),
    x: node.x,
    y: node.y,
    rotation: node.rotation ?? 0,
    props: {
      w: node.w,
      h: node.h,
      label: node.label,
      color: node.color ?? DEFAULT_NODE_COLOR,
      collapsed: node.collapsed ?? false,
    },
  }))

  // A connection's geometry is invented, and that is correct: SPEC-005 derives
  // both anchors from the bound nodes' page transforms at geometry time and
  // reads the stored props only while a terminal is unbound, which an imported
  // connection never is.
  const connections: ExportableConnection[] = document.connections.map((connection) => ({
    id: shapeId(connection.id),
    parentId: pageId,
    x: 0,
    y: 0,
    rotation: 0,
    props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
  }))

  const bindings: BindingDescriptor[] = document.connections.flatMap((connection) => [
    {
      type: CONNECTION_BINDING_TYPE,
      fromId: shapeId(connection.id),
      toId: shapeId(connection.sourceId),
      props: { terminal: 'start' as const },
    },
    {
      type: CONNECTION_BINDING_TYPE,
      fromId: shapeId(connection.id),
      toId: shapeId(connection.targetId),
      props: { terminal: 'end' as const },
    },
  ])

  return { nodes, connections, bindings }
}

/** The shape types a document can describe, for callers splitting a page. */
export const DOCUMENTABLE_SHAPE_TYPES = [NODE_SHAPE_TYPE, CONNECTION_SHAPE_TYPE] as const
