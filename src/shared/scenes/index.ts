import {
  SKETCH_MODE_RECORD_TYPE,
  sketchModeRecordValidator,
  sketchModeRecordMigrations,
} from '../sketch/mode'
import { KIND_RECORD_TYPE, kindRecordValidator, kindRecordMigrations } from '../kinds'
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
 *
 * `diagramKind` (SPEC-019) is `document`-scoped for the same reason `diagramScene` is:
 * the vocabulary a diagram uses is part of the diagram, not part of who is
 * looking at it. It lives in `src/shared/kinds/` and is registered here for the
 * reason the sketch mode is -- one registry, or the client and the worker come
 * to disagree.
 *
 * `diagramSketchMode` (SPEC-010) is session-scoped for the same reason, stated
 * differently: one person tidying their sketches must not convert strokes under
 * someone else's pencil. It lives in `src/shared/sketch/` and is registered here
 * because this is the ONE registry every schema-construction site consumes --
 * a second registry is how the client and the worker come to disagree.
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
  [KIND_RECORD_TYPE]: {
    scope: 'document' as const,
    validator: kindRecordValidator,
    migrations: kindRecordMigrations,
  },
  [SKETCH_MODE_RECORD_TYPE]: {
    scope: 'session' as const,
    validator: sketchModeRecordValidator,
    migrations: sketchModeRecordMigrations,
  },
}
