import { describe, it, expect } from 'vitest'
import { SEED_KINDS } from '../kinds'
import { createTLStore } from 'tldraw'
import { syncSchemaOptions } from '../../client/shapes/registry'
import { DOCUMENT_VERSION, fromDocument, parseDocument } from '../document'
import {
  CONNECTION_SHAPE_TYPE,
  connectionShapeDefaultProps,
  connectionShapeMigrations,
  connectionShapeProps,
  connectionVersions,
  normaliseKinds,
} from './connection'

/**
 * SPEC-018 FR-001. A connection carries a SET of kinds.
 *
 * Rooms persist, so `kinds` arriving without a migration corrupts documents that
 * already exist -- quietly. The migration is exercised two ways here on purpose,
 * because they fail differently: the props-literal tests prove the migration is
 * CORRECT, and the schema test proves it is REACHABLE VIA REGISTRATION. A
 * migration written and never wired up passes the first set completely.
 */

/**
 * `up`/`down` are typed as `((props) => void) | 'none' | 'retired'`, so they are
 * narrowed rather than asserted -- an assertion would hide the case where a
 * migration is later marked 'retired' and this file silently stops testing it.
 * Lifted verbatim from `node.test.ts`, which needed it first.
 */
function migrationFns(id: string) {
  const found = connectionShapeMigrations.sequence.find((m) => 'id' in m && m.id === id)
  if (!found || !('up' in found)) throw new Error(`no migration with id ${id}`)
  const { up, down } = found as { up: unknown; down?: unknown }
  if (typeof up !== 'function') throw new Error(`migration ${id} has no callable up()`)
  return {
    up: up as (props: Record<string, unknown>) => void,
    down: typeof down === 'function' ? (down as (props: Record<string, unknown>) => void) : null,
  }
}

describe('AddKinds migration — the connection shape gains its first', () => {
  it('adds kinds:[] to a persisted pre-migration record', () => {
    // The record as a room ALREADY HOLDS it -- start and end and nothing else.
    // Creating a fresh shape instead would exercise the default and never touch
    // the migration, which is the vacuous version of this test.
    const persisted = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } } as Record<string, unknown>
    migrationFns(connectionVersions.AddKinds).up(persisted)
    expect(persisted).toEqual({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, kinds: [] })
  })

  it('defaults to NO kinds rather than a guessed one', () => {
    // An existing line said nothing about what it carried. Inventing `sequence`
    // for every one of them would put a claim in the diagram nobody made, and it
    // would be indistinguishable afterwards from one somebody did make.
    const persisted = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } } as Record<string, unknown>
    migrationFns(connectionVersions.AddKinds).up(persisted)
    expect(persisted.kinds).toEqual([])
  })

  it('down() removes kinds, so a pre-migration peer can read the record', () => {
    const current = { ...connectionShapeDefaultProps, kinds: ['data'] } as Record<string, unknown>
    const { down } = migrationFns(connectionVersions.AddKinds)
    if (!down) throw new Error('AddKinds has no down()')
    down(current)
    expect('kinds' in current).toBe(false)
    expect(current.start).toEqual(connectionShapeDefaultProps.start)
  })
})

describe('the shipped schema, not just the validator', () => {
  /**
   * `createTLStore(syncSchemaOptions)` is the exact object `Room.tsx` spreads
   * into `useSync` -- the same trick `scenes/boundary.test.ts` uses. Building the
   * schema is what proves the migration is registered; a props-literal test
   * cannot see a migration that was written and never wired in.
   */
  const store = createTLStore(syncSchemaOptions)

  it('migrates a genuinely persisted record through the real schema', () => {
    const record = {
      id: 'shape:legacy',
      typeName: 'shape',
      type: CONNECTION_SHAPE_TYPE,
      parentId: 'page:page',
      index: 'a1',
      x: 0,
      y: 0,
      rotation: 0,
      isLocked: false,
      opacity: 1,
      meta: {},
      props: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    }
    // The CURRENT serialized schema with this one sequence wound back to 0 --
    // the state of a room persisted before `kinds` existed. Derived from
    // `serialize()` rather than hand-written, so every other sequence stays
    // current and this shape's migration is the only one that runs.
    const current = store.schema.serialize()
    const persistedSchema = {
      ...current,
      sequences: {
        ...current.sequences,
        [`com.tldraw.shape.${CONNECTION_SHAPE_TYPE}`]: 0,
      },
    }
    const result = store.schema.migratePersistedRecord(record as never, persistedSchema)
    expect(result.type).toBe('success')
    if (result.type !== 'success') throw new Error(result.reason as unknown as string)
    expect((result.value as { props: { kinds: string[] } }).props.kinds).toEqual([])
  })

  it('ACCEPTS a kind outside the vocabulary rather than rejecting the record', () => {
    // Deliberate, and the half of FR-001 worth a test of its own. A closed
    // validator would turn a word this build does not know into a record
    // rejected at the room boundary -- the failure mode CLAUDE.md names for
    // shape-prop changes. `icon` on the node shape is the precedent. Since
    // SPEC-019 there is no closed set to be closed over: the words are the
    // user's, and `src/shared/kinds/` holds the vocabulary as DATA.
    expect(() => connectionShapeProps.kinds.validate(['nonsense'])).not.toThrow()
    expect(() => connectionShapeProps.kinds.validate(['data', 'a-kind-from-2027'])).not.toThrow()
  })

  it('still refuses something that is not an array of strings', () => {
    // The structural check has to still bite, or "accepts anything" is what
    // shipped rather than "accepts any string".
    expect(() => connectionShapeProps.kinds.validate([1])).toThrow()
    expect(() => connectionShapeProps.kinds.validate('data')).toThrow()
  })
})

describe('normaliseKinds — the normal form two clients agree on', () => {
  it('is the same array for any order the same kinds arrive in', () => {
    // Insertion order is STORE order, which is exactly what differs between two
    // clients. If the order came from insertion, two people looking at one line
    // would see its kinds drawn in different orders.
    const orders = [
      ['data', 'permission', 'sequence'],
      ['sequence', 'data', 'permission'],
      ['permission', 'sequence', 'data'],
    ]
    const [first, ...rest] = orders.map(normaliseKinds)
    for (const other of rest) expect(other).toEqual(first)
    expect(first).toEqual(['data', 'permission', 'sequence'])
  })

  it('drops duplicates', () => {
    expect(normaliseKinds(['data', 'data', 'permission'])).toEqual(['data', 'permission'])
  })

  it('KEEPS a string this room has no kind for', () => {
    // Dropping it would be data loss wearing validation's clothes. Since
    // SPEC-019 the commonest source is a CONCURRENT RENAME rather than a newer
    // build, and the renderer draws it unresolved rather than ignoring it, so
    // the user can see it and turn it off.
    expect(normaliseKinds(['data', 'a-kind-from-2027'])).toEqual(['a-kind-from-2027', 'data'])
  })

  it('is empty for empty, and does not mutate its input', () => {
    const input = ['permission', 'data']
    expect(normaliseKinds([])).toEqual([])
    normaliseKinds(input)
    expect(input).toEqual(['permission', 'data'])
  })

  it('leaves every seeded kind intact', () => {
    // A vocabulary entry that normalisation silently dropped would be a kind you
    // could set and never see again. Read from `SEED_KINDS` rather than from a
    // constant in this file: the vocabulary moved, and a test that kept its own
    // copy of it would stop tracking the thing it is checking.
    const labels = SEED_KINDS.map((s) => s.label)
    expect(normaliseKinds(labels)).toEqual([...labels].sort())
  })
})

describe('the default props are not shared between connections', () => {
  /*
   * ASSERTED ON A REAL CREATION SITE, not on two hand-built literals.
   *
   * The first version of this test built `{ ...connectionShapeDefaultProps,
   * kinds: [] }` twice in its own body -- which is the fix, written out inline,
   * so it passed with BOTH production creation sites reverted to a bare spread.
   * A test that contains the thing it is checking for cannot fail. Two
   * reviewers found it independently.
   *
   * `fromDocument` is pure and needs no editor, so it covers one of the two
   * sites here; `getDefaultProps` needs a live ShapeUtil and is covered in
   * `e2e/edge-kinds.spec.ts`.
   */
  it('gives each connection created by fromDocument its own kinds array', () => {
    const parsed = parseDocument(
      JSON.stringify({
        version: DOCUMENT_VERSION,
        nodes: [
          { id: 'a', label: 'A', x: 0, y: 0, w: 100, h: 60 },
          { id: 'b', label: 'B', x: 300, y: 0, w: 100, h: 60 },
        ],
        connections: [
          { id: 'k1', sourceId: 'a', targetId: 'b' },
          { id: 'k2', sourceId: 'b', targetId: 'a' },
        ],
        scenes: [],
      }),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const { connections } = fromDocument(parsed.document, 'page:test')
    expect(connections).toHaveLength(2)

    const [first, second] = connections
    expect(first!.props.kinds).not.toBe(second!.props.kinds)
    // And not the module-level default either, which is the array both would
    // otherwise be pointing at.
    expect(first!.props.kinds).not.toBe(connectionShapeDefaultProps.kinds)

    first!.props.kinds.push('data')
    expect(second!.props.kinds).toEqual([])
    expect(connectionShapeDefaultProps.kinds).toEqual([])
  })
})
