import {
  FRAME_RECORD_TYPE,
  FRAME_VIEW_RECORD_TYPE,
  frameRecordValidator,
  frameViewRecordValidator,
  frameRecordMigrations,
  frameViewRecordMigrations,
} from './frame'

export * from './frame'

/**
 * The registry every schema-construction site consumes.
 *
 * `diagramFrame` is `document`-scoped: persisted and synced, the reach a saved
 * narration needs. `diagramFrameView` is `session`-scoped: local to one client,
 * never on the wire, which is what "my place in the narration" is.
 */
export const customRecordSchemas = {
  [FRAME_RECORD_TYPE]: {
    scope: 'document' as const,
    validator: frameRecordValidator,
    migrations: frameRecordMigrations,
  },
  [FRAME_VIEW_RECORD_TYPE]: {
    scope: 'session' as const,
    validator: frameViewRecordValidator,
    migrations: frameViewRecordMigrations,
  },
}
