import { describe, it, expect } from 'vitest'
import { createTLStore } from 'tldraw'
import { roomSchema } from '../../worker/schema'
import { syncSchemaOptions } from '../../client/shapes/registry'
import { unvalidatedSchemaIfRequested, UNVALIDATED_MARKER } from '../../client/devOnly'
import { customRecordSchemas } from '../scenes'
import { KIND_RECORD_TYPE, kindRecordValidator, kindRecordId } from './index'

/**
 * The kind record really reaches every schema-construction site.
 *
 * Asserted on the resulting SCHEMA, not on source text, for the reason
 * `scenes/boundary.test.ts` records: `TLStoreSchemaOptions` is a union, and
 * passing `records` alongside `schema` typechecks and is then silently
 * DISCARDED. A source scan would see the argument and pass.
 */
describe('the kind record reaches every schema', () => {
  it('the worker schema carries it', () => {
    expect(Object.keys(roomSchema.types)).toContain(KIND_RECORD_TYPE)
  })

  it("the client's useSync options build a schema carrying it", () => {
    expect(Object.keys(createTLStore(syncSchemaOptions).schema.types)).toContain(KIND_RECORD_TYPE)
  })

  it('the permissive dev schema carries it, or the ?unvalidated path desyncs', () => {
    const original = window.location.search
    window.history.replaceState({}, '', '?unvalidated')
    try {
      const schema = unvalidatedSchemaIfRequested()
      expect(schema, `expected the ${UNVALIDATED_MARKER} schema under ?unvalidated`).not.toBeNull()
      expect(Object.keys(schema!.types)).toContain(KIND_RECORD_TYPE)
    } finally {
      window.history.replaceState({}, '', original || '/')
    }
  })

  it('is registered at document scope, and the store agrees', () => {
    // The vocabulary a diagram uses is part of the diagram, not part of who is
    // looking at it. Session scope would keep one person's kinds off the wire.
    expect(customRecordSchemas[KIND_RECORD_TYPE].scope).toBe('document')
    const store = createTLStore(syncSchemaOptions)
    expect(store.scopedTypes.document.has(KIND_RECORD_TYPE)).toBe(true)
    expect(store.scopedTypes.session.has(KIND_RECORD_TYPE)).toBe(false)
  })
})

describe('the validator refuses what the overlay cannot represent', () => {
  const valid = {
    typeName: KIND_RECORD_TYPE,
    id: kindRecordId('data'),
    label: 'data',
    colour: 'orange',
    dash: 'solid',
  }

  it('accepts a well-formed kind', () => {
    expect(() => kindRecordValidator.validate(valid)).not.toThrow()
  })

  it('refuses an empty label', () => {
    expect(() => kindRecordValidator.validate({ ...valid, label: '' })).toThrow(/empty/)
  })

  it('refuses an untrimmed label', () => {
    // Stored untrimmed, ` data` and `data` are two entries that look like one.
    expect(() => kindRecordValidator.validate({ ...valid, label: ' data' })).toThrow(/trimmed/)
  })

  it('refuses a colour outside the palette', () => {
    expect(() => kindRecordValidator.validate({ ...valid, colour: '#ff0000' })).toThrow(/colour/)
  })

  it('refuses a dash outside the set', () => {
    expect(() => kindRecordValidator.validate({ ...valid, dash: '4 4' })).toThrow(/dash/)
  })

  it('refuses an inherited key posing as a palette colour', () => {
    // `in` would find `constructor` on Object.prototype and resolve it to a
    // function; `Object.hasOwn` is what makes this throw.
    expect(() => kindRecordValidator.validate({ ...valid, colour: 'constructor' })).toThrow(
      /colour/,
    )
  })

  it('does NOT enforce uniqueness — a validator sees one record', () => {
    // Recorded as a property, not an omission: uniqueness is a fact about the
    // set, so it is enforced where the set is visible, at the write sites.
    expect(() => kindRecordValidator.validate({ ...valid, label: 'permission' })).not.toThrow()
  })
})
