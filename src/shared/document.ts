import { NODE_SHAPE_TYPE, nodeShapeDefaultProps, type NodeShapeProps } from './shapes/node'
import {
  CONNECTION_SHAPE_TYPE,
  connectionShapeDefaultProps,
  type ConnectionShapeProps,
} from './shapes/connection'
import { CONNECTION_BINDING_TYPE, type ConnectionTerminal } from './bindings/connection'
import { isShapeId, SHAPE_ID_PREFIX } from './shapes/hierarchy'
import { SCENE_ID_PREFIX } from './scenes/sceneType'

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

export const DOCUMENT_VERSION = 2

/**
 * Every version this build can READ. There is no downgrade: a v1 document is
 * upgraded on the way in and comes back as v2.
 */
export const SUPPORTED_DOCUMENT_VERSIONS = [1, 2] as const

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

/**
 * What `toDocument` consumes for a scene.
 *
 * Deliberately NOT SPEC-008's `SceneRecord`: that extends `BaseRecord` from
 * `@tldraw/store`, and this module imports no tldraw package at all.
 */
export interface ExportableScene {
  /** The raw `diagramScene:...` id; the prefix is stripped into the document. */
  id: string
  name: string
  note: string
  collapsed: Record<string, boolean>
  highlighted: string[]
  index: string
}

/**
 * A scene as a document carries it: what SPEC-008's record carries, minus the
 * machinery.
 *
 * SCENE IDS ARE THEIR OWN NAMESPACE. Nodes and connections share one because
 * both mint `shape:<id>`, so a collision there is one record overwriting
 * another. A scene mints `diagramScene:<id>` -- a different record type in a
 * different id space -- so a scene called `auth` beside a node called `auth`
 * overwrites nothing. Sharing the namespace anyway would buy tidiness and cost
 * correctness: a room can legitimately hold both today, and an export that then
 * refused its own room would break the property this module exists to hold.
 *
 * NO `index`. The record carries a fractional sort key; a document carries an
 * array, and an array is already ordered. Carrying both would give the format
 * two places to disagree.
 */
export interface DocumentScene {
  /** Unique among SCENES. May equal a node or connection id -- see above. */
  id: string
  name: string
  /** Optional; defaults to ''. */
  note?: string
  /** Node ids that read as folded (or explicitly open) while this scene is active. */
  collapsed?: Record<string, boolean>
  /** Node or connection ids to accent. */
  highlighted?: string[]
}

export interface DiagramDocument {
  version: number
  nodes: DocumentNode[]
  connections: DocumentConnection[]
  scenes: DocumentScene[]
}

/** Total: the whole document or a message. Never a partial result. */
export type ParseResult = { ok: true; document: DiagramDocument } | { ok: false; error: string }

// --- The records the conversions consume and produce. `fromDocument` returns
// --- exactly what `toDocument` takes, so the round trip composes with no
// --- intermediate type -- which is what makes it testable without an Editor.

export interface ExportableNode {
  /** The raw `shape:...` id; the prefix is stripped on the way into a document. */
  id: string
  /**
   * REQUIRED, and easy to leave off. `toDocument` never reads it -- real records
   * are structural supersets, so export works without it -- but `fromDocument`
   * has to PRODUCE a complete record, and a shape partial with no `type` makes
   * `createShapes` throw "No shape util found for type undefined". That throw
   * escapes to tldraw's React error boundary and replaces the canvas with
   * "Something went wrong", so a well-formed document would take down the app.
   *
   * The round trip cannot catch its absence: it is closed over the one field
   * that makes a shape a shape.
   */
  type: typeof NODE_SHAPE_TYPE
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
  /** Required for the same reason as `ExportableNode.type`. */
  type: typeof CONNECTION_SHAPE_TYPE
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

/**
 * Checked against the RAW document, before any upgrade -- so this list is
 * permanently the UNION of every version's keys, not the current version's. A
 * key that is legal in v2 therefore passes the check on a v1 document too, and
 * the only thing stopping a v1 document's `scenes` from being silently
 * discarded is the explicit guard in `parseDocument`. A future v3 key needs its
 * own guard for the same reason.
 */
const TOP_LEVEL_KEYS = ['version', 'nodes', 'connections', 'scenes']
const NODE_KEYS = ['id', 'label', 'x', 'y', 'w', 'h', 'rotation', 'color', 'collapsed', 'parentId']
const CONNECTION_KEYS = ['id', 'sourceId', 'targetId']
const SCENE_KEYS = ['id', 'name', 'note', 'collapsed', 'highlighted']

/**
 * A v1 document, as v2: the same document, plus no scenes.
 *
 * Trivial on purpose -- the thing worth testing is not this function, it is that
 * the FROZEN v1 CORPUS still turns into an identical record set on the far side
 * of it. See `document-v1.test.ts`.
 *
 * Pure, and exported so it can be tested with no Editor.
 */
export function upgradeV1(document: Record<string, unknown>): Record<string, unknown> {
  return { ...document, version: 2, scenes: [] }
}

function fail(path: string, reason: string): ParseResult {
  return { ok: false, error: `${path}: ${reason}` }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Unknown keys are REJECTED, not ignored, and this is the rule that decides it:
 * an author who writes `scenes` today must be told it does nothing. Silently
 * dropping it is the predecessor's failure mode in a new costume.
 */
function unknownKey(object: Record<string, unknown>, allowed: string[]): string | null {
  return Object.keys(object).find((key) => !allowed.includes(key)) ?? null
}

function checkNumber(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a finite number'
}

/**
 * Width and height are POSITIVE, not merely finite.
 *
 * `nodeShapeProps` validates them with `T.nonZeroNumber`, so a `w: 0` document
 * passes every check here and then throws inside `createShapes` -- which escapes
 * to tldraw's error boundary and replaces the canvas with "Something went wrong"
 * and a Reset data button. A validator that lets a value through to crash the
 * app downstream is worse than no validator, because the user is told nothing.
 */
function checkSize(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a finite number'
  return value > 0 ? null : 'must be greater than zero'
}

export function parseDocument(input: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(input) as unknown
  } catch (error) {
    return fail('document', `not valid JSON (${(error as Error).message})`)
  }

  if (!isPlainObject(raw)) return fail('document', 'must be a JSON object')

  // VERSION FIRST, then the key check -- the reverse of what this did at v1, and
  // the order is load-bearing. Once `scenes` is a legal v2 key, a v1 document
  // carrying one would otherwise be reported as a KEY problem, when the author's
  // actual mistake is the version. The guard below says so instead.
  if (!('version' in raw)) return fail('document.version', 'missing')
  if (
    !SUPPORTED_DOCUMENT_VERSIONS.includes(
      raw.version as (typeof SUPPORTED_DOCUMENT_VERSIONS)[number],
    )
  ) {
    return fail(
      'document.version',
      `expected ${SUPPORTED_DOCUMENT_VERSIONS.join(' or ')}, got ${JSON.stringify(raw.version)}`,
    )
  }

  // Its OWN step, before the upgrade. The reorder alone is not enough: after it,
  // `version: 1` passes the version gate and `scenes` passes the key gate, so a
  // v1 document carrying scenes would be quietly ACCEPTED and the author's
  // scenes dropped on the floor.
  if (raw.version === 1 && 'scenes' in raw) {
    return fail('document.version', 'scenes requires version 2')
  }

  const extraTop = unknownKey(raw, TOP_LEVEL_KEYS)
  if (extraTop !== null) return fail(`document.${extraTop}`, 'unknown key')

  // A NEW binding, not a reassignment: `raw` is declared `unknown` and narrowed
  // by `isPlainObject` above, and assigning to it would throw that narrowing
  // away.
  const doc: Record<string, unknown> = raw.version === 1 ? upgradeV1(raw) : raw

  // Optional on input, so a node-only document is valid; both are always present
  // on export. ABSENT, not nullish: `?? []` would coalesce an explicit
  // `"nodes": null` into an empty array and accept it, which is the author
  // writing something wrong and seeing an empty diagram rather than an error.
  const rawNodes = 'nodes' in doc ? doc.nodes : []
  const rawConnections = 'connections' in doc ? doc.connections : []
  const rawScenes = 'scenes' in doc ? doc.scenes : []
  if (!Array.isArray(rawNodes)) return fail('document.nodes', 'must be an array')
  if (!Array.isArray(rawConnections)) return fail('document.connections', 'must be an array')
  if (!Array.isArray(rawScenes)) return fail('document.scenes', 'must be an array')

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

    for (const key of ['x', 'y'] as const) {
      const reason = checkNumber(entry[key])
      if (reason !== null) return fail(`${path}.${key}`, reason)
    }
    for (const key of ['w', 'h'] as const) {
      const reason = checkSize(entry[key])
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
        return fail(
          `${path}.color`,
          'must be a hex color like #4f8ff7, or a lowercase CSS color keyword',
        )
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

  // Scenes last: every reference below is checked against `seen`, which the
  // passes above have already filled with what this document actually carries.
  const scenes: DocumentScene[] = []
  const sceneIds = new Set<string>()
  for (let i = 0; i < rawScenes.length; i++) {
    const path = `scenes[${i}]`
    const entry: unknown = rawScenes[i]
    if (!isPlainObject(entry)) return fail(path, 'must be an object')

    const extra = unknownKey(entry, SCENE_KEYS)
    if (extra !== null) return fail(`${path}.${extra}`, 'unknown key')

    if (typeof entry.id !== 'string') return fail(`${path}.id`, 'must be a string')
    if (!DOCUMENT_ID_PATTERN.test(entry.id)) {
      return fail(`${path}.id`, `must match ${String(DOCUMENT_ID_PATTERN)}`)
    }
    // Unique among SCENES ONLY. A scene id equal to a node or connection id is
    // fine -- different record type, different id space.
    if (sceneIds.has(entry.id)) {
      return fail(`${path}.id`, `duplicate id ${JSON.stringify(entry.id)}`)
    }
    sceneIds.add(entry.id)

    if (typeof entry.name !== 'string') return fail(`${path}.name`, 'must be a string')

    const scene: DocumentScene = { id: entry.id, name: entry.name }

    if (entry.note !== undefined) {
      if (typeof entry.note !== 'string') return fail(`${path}.note`, 'must be a string')
      scene.note = entry.note
    }

    if (entry.collapsed !== undefined) {
      if (!isPlainObject(entry.collapsed)) return fail(`${path}.collapsed`, 'must be an object')
      for (const [key, value] of Object.entries(entry.collapsed)) {
        const at = `${path}.collapsed[${JSON.stringify(key)}]`
        // Two errors, because they are two different authoring mistakes.
        const kind = seen.get(key)
        if (kind === undefined) return fail(at, `no node with id ${JSON.stringify(key)}`)
        if (kind === 'connection') {
          return fail(at, 'names a connection, which cannot be collapsed')
        }
        if (typeof value !== 'boolean') return fail(at, 'must be a boolean')
      }
      scene.collapsed = entry.collapsed as Record<string, boolean>
    }

    if (entry.highlighted !== undefined) {
      if (!Array.isArray(entry.highlighted)) {
        return fail(`${path}.highlighted`, 'must be an array')
      }
      for (let j = 0; j < entry.highlighted.length; j++) {
        const at = `${path}.highlighted[${j}]`
        const id: unknown = entry.highlighted[j]
        if (typeof id !== 'string') return fail(at, 'must be a string')
        // A node OR a connection: accenting a line is as meaningful as
        // accenting a box.
        if (!seen.has(id)) return fail(at, `no node or connection with id ${JSON.stringify(id)}`)
      }
      scene.highlighted = entry.highlighted as string[]
    }

    scenes.push(scene)
  }

  return { ok: true, document: { version: DOCUMENT_VERSION, nodes, connections, scenes } }
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
  // TRAILING and OPTIONAL: two dozen existing three-argument call sites would
  // otherwise all have to change for one caller that has scenes.
  scenes: readonly ExportableScene[] = [],
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
      if (node.props.color !== nodeShapeDefaultProps.color) out.color = node.props.color
      if (node.props.collapsed) out.collapsed = true
      if (isShapeId(node.parentId)) out.parentId = documentId(node.parentId)
      return out
    })

  // Indexed once rather than scanned twice per connection. The unindexed
  // version is O(C^2) and was measured at 2.0s for 16,000 connections against
  // 11ms for 64,000 indexed -- and it was the one loop in this module whose
  // linearity nobody had checked, while two others carry measurements in their
  // comments.
  const bindingsByConnection = new Map<string, BindingDescriptor[]>()
  for (const b of bindings) {
    const list = bindingsByConnection.get(b.fromId)
    if (list) list.push(b)
    else bindingsByConnection.set(b.fromId, [b])
  }

  const documentConnections: DocumentConnection[] = []
  // Raw ids of the connections that actually made it into the document. Built
  // HERE rather than by scanning `documentConnections` afterwards: that scan is
  // O(C^2), which is the same defect the binding join above already carries a
  // measurement about, and the linearity test catches it -- 4978ms at 16,000.
  const exportedConnectionIds = new Set<string>()
  for (const connection of connections) {
    // PER TERMINAL, never by binding count. Nothing at the record level forbids
    // two bindings on the same terminal -- two clients re-aiming the same end
    // concurrently produce exactly that, since sync is last-write-wins per
    // record, not per (shape, terminal). A count test would then export a
    // connection with an undefined targetId, which parseDocument rejects.
    const own = bindingsByConnection.get(connection.id) ?? []
    const terminal = (want: ConnectionTerminal) => own.find((b) => b.props.terminal === want)
    const source = terminal('start')
    const target = terminal('end')
    if (!source || !target) continue
    if (!documentable.has(source.toId) || !documentable.has(target.toId)) continue
    documentConnections.push({
      id: documentId(connection.id),
      sourceId: documentId(source.toId),
      targetId: documentId(target.toId),
    })
    exportedConnectionIds.add(connection.id)
  }

  // Plain `<`, matching merge.ts's representative rule and for the same reason:
  // localeCompare disagrees with it on the mixed-case ids the pattern permits.
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

  /*
   * A scene's references are filtered against WHAT THIS DOCUMENT ACTUALLY
   * CARRIES, which is the rule that keeps export from emitting something
   * parseDocument would reject. A scene can legitimately name things the
   * document cannot: SPEC-008 keeps stale scenes rather than deleting them, and
   * the `documentable` rule above drops nodes parented into tldraw shapes and
   * connections bound at only one end.
   *
   * The sets are RAW `shape:` ids, because that is what a scene stores --
   * `collapsed` keys and `highlighted` entries both come from shape ids. The
   * document's own ids are stripped. Compare across the two and EVERY reference
   * is dropped while every drop-case test still passes.
   *
   * And `highlighted` is filtered against nodes AND connections, not against
   * `documentable`, which is nodes only: a connection highlight is meaningful,
   * and filtering it through the node set would silently drop all of them.
   */
  const documentScenes: DocumentScene[] = [...scenes]
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : a.id < b.id ? -1 : 1))
    .map((scene) => {
      const out: DocumentScene = {
        id: scene.id.startsWith(SCENE_ID_PREFIX)
          ? scene.id.slice(SCENE_ID_PREFIX.length)
          : scene.id,
        name: scene.name,
      }
      // One omit-at-default rule for all three, matching the node's.
      if (scene.note !== '') out.note = scene.note

      const collapsed: Record<string, boolean> = {}
      for (const [id, value] of Object.entries(scene.collapsed)) {
        if (documentable.has(id)) collapsed[documentId(id)] = value
      }
      if (Object.keys(collapsed).length > 0) out.collapsed = collapsed

      const highlighted = scene.highlighted
        .filter((id) => documentable.has(id) || exportedConnectionIds.has(id))
        .map(documentId)
      if (highlighted.length > 0) out.highlighted = highlighted

      return out
    })

  return {
    version: DOCUMENT_VERSION,
    nodes: documentNodes.sort(byId),
    connections: documentConnections.sort(byId),
    scenes: documentScenes,
  }
}

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
  /**
   * In ARRAY ORDER and WITHOUT an index. The client adapter mints the indices
   * with tldraw's own helpers as it creates the records -- doing it here would
   * produce a different ordering alphabet from the one `captureScene` mints
   * with, so a scene created after an import would interleave wrongly. (And the
   * naive `a${i + 1}` breaks outright at ten, since `'a10' < 'a2'`.)
   */
  scenes: Omit<ExportableScene, 'index'>[]
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
    type: NODE_SHAPE_TYPE,
    parentId: node.parentId === undefined ? pageId : shapeId(node.parentId),
    x: node.x,
    y: node.y,
    rotation: node.rotation ?? 0,
    props: {
      w: node.w,
      h: node.h,
      label: node.label,
      color: node.color ?? nodeShapeDefaultProps.color,
      collapsed: node.collapsed ?? false,
    },
  }))

  // A connection's geometry is invented, and that is correct: SPEC-005 derives
  // both anchors from the bound nodes' page transforms at geometry time and
  // reads the stored props only while a terminal is unbound, which an imported
  // connection never is.
  const connections: ExportableConnection[] = document.connections.map((connection) => ({
    id: shapeId(connection.id),
    type: CONNECTION_SHAPE_TYPE,
    parentId: pageId,
    x: 0,
    y: 0,
    rotation: 0,
    props: { ...connectionShapeDefaultProps },
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

  const scenes = document.scenes.map((scene) => ({
    id: `${SCENE_ID_PREFIX}${scene.id}`,
    name: scene.name,
    note: scene.note ?? '',
    collapsed: Object.fromEntries(
      Object.entries(scene.collapsed ?? {}).map(([id, value]) => [shapeId(id), value]),
    ),
    highlighted: (scene.highlighted ?? []).map(shapeId),
  }))

  return { nodes, connections, bindings, scenes }
}

/** The shape types a document can describe, for callers splitting a page. */
export const DOCUMENTABLE_SHAPE_TYPES = [NODE_SHAPE_TYPE, CONNECTION_SHAPE_TYPE] as const
