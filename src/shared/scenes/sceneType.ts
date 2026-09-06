/**
 * The scene record's TYPE STRING and the id prefix built from it, alone in a
 * module that imports nothing.
 *
 * Two consumers need them: `scene.ts` builds the record, the validator and the
 * migrations; `document.ts` strips and re-adds the prefix on the way through the
 * JSON format, and imports no tldraw package DIRECTLY (see its header).
 *
 * The reason is the literal type below, not the import graph -- `document.ts`
 * already reaches `@tldraw/tlschema` and `@tldraw/validate` transitively through
 * the shape modules it imports, so pulling in `scene.ts` would add only a type-
 * only `@tldraw/store`. What it would really cost is the direct-import property
 * the module header states.
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
