/**
 * The kind record's TYPE STRING and the id prefix built from it, alone in a
 * module that imports nothing.
 *
 * Same shape and same reason as `scenes/sceneType.ts`: THE TYPE IS THE SOURCE
 * AND THE PREFIX IS DERIVED. Deriving the type from the prefix gives it the type
 * `string` rather than the literal `'diagramKind'`, which turns the computed key
 * in `kind.ts`'s `TLGlobalRecordPropsMap` augmentation into an INDEX SIGNATURE
 * and collapses `TLRecord` -- surfacing as errors in files that never mention
 * kinds.
 */

export const KIND_RECORD_TYPE = 'diagramKind'

/** What `createCustomRecordId` puts in front of a kind's id. */
export const KIND_ID_PREFIX = `${KIND_RECORD_TYPE}:` as const
