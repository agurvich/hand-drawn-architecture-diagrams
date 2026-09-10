import { createCustomRecordId } from '@tldraw/tlschema'
import type { RecordId } from '@tldraw/store'
import { KIND_RECORD_TYPE } from './kindType'
import type { DiagramKind } from './kind'

export * from './kindType'
export * from './kind'
export * from './palette'

/**
 * The record id for a vocabulary entry's id.
 *
 * `KindEntry.id` is the BARE id -- `'data'` for a seed, `'k1a2b3'` for a created
 * kind -- because that is what the overlay matches on. A record carries the
 * prefixed form. This is the one conversion, and it is deliberately blind to
 * which kind of id it is given: writing a record at a seed's id is exactly how a
 * seed is overridden rather than duplicated, so the two cases are the same
 * operation and a caller that had to tell them apart would be a caller that
 * could get it wrong.
 */
export function kindRecordId(entryId: string): RecordId<DiagramKind> {
  return createCustomRecordId(KIND_RECORD_TYPE, entryId) as RecordId<DiagramKind>
}

/**
 * The id for a NEWLY CREATED kind: generated, never derived from the label.
 *
 * Deriving it would make creating a kind called `data`, after the seed `data`
 * had been renamed to `flows`, silently overwrite the renamed seed -- renaming
 * it back and losing its colour. Only seeds derive ids, and only because a
 * derived id is what makes two clients collide on one record instead of racing.
 */
export function newKindId(unique: string): RecordId<DiagramKind> {
  return createCustomRecordId(KIND_RECORD_TYPE, `k${unique}`) as RecordId<DiagramKind>
}
