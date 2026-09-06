import {
  createCustomRecordMigrationSequence,
  createCustomRecordId,
  idValidator,
} from '@tldraw/tlschema'
import type { BaseRecord, RecordId } from '@tldraw/store'
import { T } from '@tldraw/validate'

/**
 * SKETCH RECOGNITION MODE: whether finishing a stroke converts it.
 *
 * OFF BY DEFAULT, and that is the requirement the rest of the spec exists to be
 * safe under. This app deliberately keeps hand-drawn work -- SPEC-007 puts a
 * confirmation in front of destroying it. Recognition destroys it one stroke at
 * a time, silently, and a false positive is indistinguishable from a bug to the
 * person whose note just became a rectangle.
 *
 * SESSION-SCOPED, so it never reaches the wire: one person tidying their own
 * sketches must not convert shapes under someone else's pencil. Same seam
 * SPEC-008 established for "my place in the narration", and the same governing
 * rule -- its writes are history-IGNORED. tldraw's history filters on `source`,
 * not on record scope, so without that the toggle joins the undo stack and
 * FR-004's "one undo returns the exact original stroke" is false whenever the
 * toggle was the last thing written.
 */

export const SKETCH_MODE_RECORD_TYPE = 'diagramSketchMode'

export interface SketchModeRecord extends BaseRecord<
  typeof SKETCH_MODE_RECORD_TYPE,
  RecordId<SketchModeRecord>
> {
  on: boolean
}

/**
 * REQUIRED, and easy to miss -- `TLRecord` is derived from this augmented map,
 * so without it the store's `put`/`get` never accept this type.
 */
declare module '@tldraw/tlschema' {
  interface TLGlobalRecordPropsMap {
    [SKETCH_MODE_RECORD_TYPE]: SketchModeRecord
  }
}

/**
 * There is exactly one mode record. Typed at the definition rather than at every
 * call, for the reason SPEC-008 records: `createCustomRecordId` returns a
 * generic `RecordId<UnknownRecord>` that `store.get` cannot narrow.
 */
export const SKETCH_MODE_SINGLETON_ID = createCustomRecordId(
  SKETCH_MODE_RECORD_TYPE,
  'current',
) as RecordId<SketchModeRecord>

/** Validators cover the WHOLE record, `id` and `typeName` included. */
export const sketchModeRecordValidator = T.object<SketchModeRecord>({
  typeName: T.literal(SKETCH_MODE_RECORD_TYPE),
  id: idValidator<RecordId<SketchModeRecord>>(SKETCH_MODE_RECORD_TYPE),
  on: T.boolean,
})

export const sketchModeRecordMigrations = createCustomRecordMigrationSequence({ sequence: [] })
