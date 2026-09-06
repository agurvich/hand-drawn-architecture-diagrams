import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTLStore } from 'tldraw'
import { roomSchema } from '../../worker/schema'
import { syncSchemaOptions } from '../../client/shapes/registry'
import { unvalidatedSchemaIfRequested, UNVALIDATED_MARKER } from '../../client/devOnly'
import {
  FRAME_RECORD_TYPE,
  FRAME_VIEW_RECORD_TYPE,
  OFF_FRAME_RECORD_TYPE,
  customRecordSchemas,
} from './index'

/**
 * Every schema-construction site really carries the frame records.
 *
 * Asserted on the resulting SCHEMA, not on source text. `TLStoreSchemaOptions` is
 * a union of `{shapeUtils, bindingUtils, records}` and `{schema}`; passing
 * `records` alongside `schema` typechecks and is then silently DISCARDED. A
 * source scan would see the argument and pass; only building the schema shows
 * whether it survived.
 */
const RECORD_TYPES = [FRAME_RECORD_TYPE, FRAME_VIEW_RECORD_TYPE, OFF_FRAME_RECORD_TYPE]

describe('the frame records reach every schema', () => {
  it('the worker schema carries both', () => {
    for (const type of RECORD_TYPES) expect(Object.keys(roomSchema.types)).toContain(type)
  })

  it("the client's useSync options build a schema carrying both", () => {
    // The exact object Room.tsx spreads into useSync, not a reconstruction.
    const store = createTLStore(syncSchemaOptions)
    for (const type of RECORD_TYPES) expect(Object.keys(store.schema.types)).toContain(type)
  })

  it('the permissive dev schema carries both, or the ?unvalidated path desyncs', () => {
    const original = window.location.search
    window.history.replaceState({}, '', '?unvalidated')
    try {
      const schema = unvalidatedSchemaIfRequested()
      expect(schema, `expected the ${UNVALIDATED_MARKER} schema under ?unvalidated`).not.toBeNull()
      for (const type of RECORD_TYPES) expect(Object.keys(schema!.types)).toContain(type)
    } finally {
      window.history.replaceState({}, '', original || '/')
    }
  })

  it('both are registered at the scope their behaviour depends on', () => {
    // document = synced and persisted; session = local to one client and never
    // on the wire. Swapping them silently breaks the whole lens design.
    expect(customRecordSchemas[FRAME_RECORD_TYPE].scope).toBe('document')
    expect(customRecordSchemas[FRAME_VIEW_RECORD_TYPE].scope).toBe('session')
    expect(customRecordSchemas[OFF_FRAME_RECORD_TYPE].scope).toBe('session')
  })

  it('the store agrees about which scope each type is in', () => {
    const store = createTLStore(syncSchemaOptions)
    expect(store.scopedTypes.document.has(FRAME_RECORD_TYPE)).toBe(true)
    expect(store.scopedTypes.session.has(FRAME_VIEW_RECORD_TYPE)).toBe(true)
    expect(store.scopedTypes.session.has(OFF_FRAME_RECORD_TYPE)).toBe(true)
    expect(store.scopedTypes.document.has(FRAME_VIEW_RECORD_TYPE)).toBe(false)
  })
})

let warn: typeof console.warn
beforeEach(() => {
  warn = console.warn
  console.warn = () => {}
})
afterEach(() => {
  console.warn = warn
})
