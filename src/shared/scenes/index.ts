import {
  SCENE_RECORD_TYPE,
  SCENE_VIEW_RECORD_TYPE,
  OFF_SCENE_RECORD_TYPE,
  sceneRecordValidator,
  sceneViewRecordValidator,
  offSceneRecordValidator,
  sceneRecordMigrations,
  sceneViewRecordMigrations,
  offSceneRecordMigrations,
} from './scene'

export * from './scene'

/**
 * The registry every schema-construction site consumes.
 *
 * `diagramScene` is `document`-scoped: persisted and synced, the reach a saved
 * narration needs. `diagramSceneView` is `session`-scoped: local to one client,
 * never on the wire, which is what "my place in the narration" is.
 */
export const customRecordSchemas = {
  [SCENE_RECORD_TYPE]: {
    scope: 'document' as const,
    validator: sceneRecordValidator,
    migrations: sceneRecordMigrations,
  },
  [SCENE_VIEW_RECORD_TYPE]: {
    scope: 'session' as const,
    validator: sceneViewRecordValidator,
    migrations: sceneViewRecordMigrations,
  },
  [OFF_SCENE_RECORD_TYPE]: {
    scope: 'session' as const,
    validator: offSceneRecordValidator,
    migrations: offSceneRecordMigrations,
  },
}
