import { describe, it, expect } from 'vitest'
import { createTLStore } from 'tldraw'
import { syncSchemaOptions } from '../../client/shapes/registry'
import {
  CONNECTION_SHAPE_TYPE,
  EDGE_KINDS,
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
    // Deliberate, and the half of FR-001 worth a test of its own. A validator
    // closed over EDGE_KINDS would turn a kind added by a NEWER build into a
    // record rejected at the room boundary -- the failure mode CLAUDE.md names
    // for shape-prop changes. `icon` on the node shape is the precedent.
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

  it('KEEPS a string it does not recognise', () => {
    // Dropping it would make a newer build's kind vanish the first time an older
    // build touched the record -- data loss wearing validation's clothes. The
    // renderer is what ignores it.
    expect(normaliseKinds(['data', 'a-kind-from-2027'])).toEqual(['a-kind-from-2027', 'data'])
  })

  it('is empty for empty, and does not mutate its input', () => {
    const input = ['permission', 'data']
    expect(normaliseKinds([])).toEqual([])
    normaliseKinds(input)
    expect(input).toEqual(['permission', 'data'])
  })

  it('leaves every declared kind intact', () => {
    // A vocabulary entry that normalisation silently dropped would be a kind you
    // could set and never see again.
    expect(normaliseKinds([...EDGE_KINDS])).toEqual([...EDGE_KINDS].sort())
  })
})

describe('the default props are not shared between connections', () => {
  it('gives each connection its own kinds array', () => {
    // `{ ...connectionShapeDefaultProps }` is a SHALLOW copy, so without the
    // explicit rewrite at each creation site every connection would share one
    // array. Harmless for start/end, which nothing mutates in place; not
    // harmless for an array somebody will reasonably push to.
    const a = { ...connectionShapeDefaultProps, kinds: [] as string[] }
    const b = { ...connectionShapeDefaultProps, kinds: [] as string[] }
    a.kinds.push('data')
    expect(b.kinds).toEqual([])
    expect(connectionShapeDefaultProps.kinds).toEqual([])
  })
})
