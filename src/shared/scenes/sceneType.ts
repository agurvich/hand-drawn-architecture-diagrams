/**
 * The scene record's TYPE STRING and the id prefix built from it, alone in a
 * module that imports nothing.
 *
 * Two consumers need them and only one of them may touch tldraw: `scene.ts`
 * builds the record, the validator and the migrations; `document.ts` strips and
 * re-adds the prefix on the way through the JSON format, and is deliberately
 * free of every tldraw package (see its header). Importing `scene.ts` from
 * `document.ts` would drag `@tldraw/tlschema`, `@tldraw/validate` and
 * `@tldraw/store` into a module whose whole point is not having them.
 *
 * THE TYPE IS THE SOURCE AND THE PREFIX IS DERIVED, not the reverse. Deriving
 * the type from the prefix -- `PREFIX.slice(0, -1)` -- gives it the type
 * `string` rather than the literal `'diagramScene'`, and TypeScript then turns
 * the computed key in `scene.ts`'s `TLGlobalRecordPropsMap` augmentation into an
 * INDEX SIGNATURE. `keyof` that map widens to `string | number`, `TLCustomRecord`
 * collapses to a single record, and the view and off-scene records silently fall
 * out of `TLRecord` -- surfacing as errors in files that never mention scenes.
 * An imported `const` keeps its literal type across the module boundary; a
 * computed one does not.
 *
 * Not in `shapes/hierarchy.ts` beside `SHAPE_ID_PREFIX`, tempting as that is: a
 * scene is not a shape, and putting it there would force `hierarchy.ts` onto
 * `shared-imports.test.ts`'s exemption list -- which would exempt it from EVERY
 * type literal, including `'diagramNode'`, which it consumes by import today.
 */

export const SCENE_RECORD_TYPE = 'diagramScene'

/** What `createCustomRecordId` puts in front of a scene's id. */
export const SCENE_ID_PREFIX = `${SCENE_RECORD_TYPE}:` as const
