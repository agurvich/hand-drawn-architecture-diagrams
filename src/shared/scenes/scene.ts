import {
  createCustomRecordMigrationSequence,
  createCustomRecordId,
  idValidator,
} from '@tldraw/tlschema'
import type { BaseRecord, RecordId } from '@tldraw/store'
import { T } from '@tldraw/validate'
import { NODE_SHAPE_TYPE } from '../shapes/node'
import type { GetShape, HierarchyShape } from '../shapes/hierarchy'
import { SCENE_RECORD_TYPE } from './sceneType'

export { SCENE_RECORD_TYPE, SCENE_ID_PREFIX } from './sceneType'

/**
 * FRAMES: named, saved ways of LOOKING at the diagram.
 *
 * A scene is a lens, not an edit. Viewing one changes what its viewer sees and
 * nothing else -- not the diagram, and not what a collaborator sees. The scenes
 * themselves are shared; where each viewer is in that set is their own.
 *
 * A scene is not a shape: it has no geometry and nothing hit-tests it. tldraw 5
 * takes CUSTOM RECORD TYPES, which is the same client/worker duality shapes and
 * bindings already have and follows the same rules -- one declaration, neither
 * side writing the type string, a migration for every field change.
 *
 * `@tldraw/store` is imported for BaseRecord/RecordId, which @tldraw/tlschema
 * imports and does not re-export. That is the whole of the allowlist widening
 * `shared-imports.test.ts` records; `tldraw` itself stays forbidden.
 */

export const SCENE_VIEW_RECORD_TYPE = 'diagramSceneView'
export const OFF_SCENE_RECORD_TYPE = 'diagramOffScene'

export interface SceneRecord extends BaseRecord<typeof SCENE_RECORD_TYPE, RecordId<SceneRecord>> {
  /** Shown in the list. */
  name: string
  /** Commentary shown while the scene is active. Empty is fine. */
  note: string
  /**
   * Every node that had children when the scene was captured, with its effective
   * state. A node ABSENT from this map falls back to its own prop -- which is
   * how a node created after the scene behaves sensibly.
   */
  collapsed: Record<string, boolean>
  /** Shape ids to accent. Ids that no longer resolve are ignored. */
  highlighted: string[]
  /** Sort key for the scene order. */
  index: string
}

/**
 * Where THIS VIEWER is. One record per session, never synced.
 *
 * In a record rather than a module atom because it is authoritative state, not a
 * derivation: `activeSceneId` cannot be recomputed from anything, and
 * `decisions.md` -> Derived views are computed, never materialized says such a
 * value belongs in a record. Session scope is what makes "in the store" and
 * "never reaches another client" both true at once.
 *
 * It does NOT survive a reload. tldraw persists the camera through a session
 * snapshot whose field list is closed and hard-coded, written by the local
 * persistence client; `useSync` has no persistence path at all. Accepted rather
 * than worked around: this is where you were in a narration, not anything you
 * authored.
 */
export interface SceneViewRecord extends BaseRecord<
  typeof SCENE_VIEW_RECORD_TYPE,
  RecordId<SceneViewRecord>
> {
  /**
   * BRANDED, not `string`. `editor.store.get(view.activeSceneId)` does not
   * typecheck against a plain string, so every lookup would need an unchecked
   * cast -- in the one place a STALE id is expected, when another client deletes
   * the scene you are viewing.
   */
  activeSceneId: RecordId<SceneRecord> | null
}

/**
 * Which nodes this viewer has taken off-scene. A SEPARATE record, and the split
 * is load-bearing rather than tidiness.
 *
 * tldraw's history records whole-record diffs and filters only on `source`, not
 * on scope -- so a session record lands on the undo stack like any shape. These
 * two fields need OPPOSITE treatment:
 *
 *   - `activeSceneId` must NEVER be undoable. Merely looking at a scene fused
 *     itself onto the reader's previous edit, so one undo threw them off the
 *     scene; and once a toggle was recorded, undo walked them backwards through
 *     the story.
 *   - the off-scene set MUST be undoable, atomically with the shape prop the
 *     toggle writes, or undo restores the prop and leaves the node off-scene --
 *     showing a state nobody asked for.
 *
 * One record cannot be both, and `createCustomRecordType` drops `ephemeralKeys`
 * so a field-level exemption is not available either. Two records is the fix,
 * and the boundary between them is exactly the boundary between "history
 * ignored" and "history recorded".
 */
export interface OffSceneRecord extends BaseRecord<
  typeof OFF_SCENE_RECORD_TYPE,
  RecordId<OffSceneRecord>
> {
  /** Node ids whose own prop wins over the active scene, for this viewer. */
  nodeIds: string[]
}

/**
 * REQUIRED, and easy to miss -- the same trap `node.ts` names for shapes.
 * `TLRecord` is derived from this augmented map, so without it the store's
 * `put`/`get` never accept these types.
 */
declare module '@tldraw/tlschema' {
  interface TLGlobalRecordPropsMap {
    [SCENE_RECORD_TYPE]: SceneRecord
    [SCENE_VIEW_RECORD_TYPE]: SceneViewRecord
    [OFF_SCENE_RECORD_TYPE]: OffSceneRecord
  }
}

/**
 * There is exactly one view record, and this is its id.
 *
 * Typed at the definition rather than at every call: `createCustomRecordId`
 * returns a generic `RecordId<UnknownRecord>`, which `store.get` cannot narrow --
 * it matched `TLUserId` and produced a bewildering error about missing `name`
 * and `color`. One cast here beats one at every lookup.
 */
export const SCENE_VIEW_SINGLETON_ID = createCustomRecordId(
  SCENE_VIEW_RECORD_TYPE,
  'current',
) as RecordId<SceneViewRecord>

export const OFF_SCENE_SINGLETON_ID = createCustomRecordId(
  OFF_SCENE_RECORD_TYPE,
  'current',
) as RecordId<OffSceneRecord>

/** Validators cover the WHOLE record, `id` and `typeName` included. */
export const sceneRecordValidator = T.object<SceneRecord>({
  typeName: T.literal(SCENE_RECORD_TYPE),
  id: idValidator<RecordId<SceneRecord>>(SCENE_RECORD_TYPE),
  name: T.string,
  note: T.string,
  collapsed: T.dict(T.string, T.boolean),
  highlighted: T.arrayOf(T.string),
  index: T.string,
})

export const sceneViewRecordValidator = T.object<SceneViewRecord>({
  typeName: T.literal(SCENE_VIEW_RECORD_TYPE),
  id: idValidator<RecordId<SceneViewRecord>>(SCENE_VIEW_RECORD_TYPE),
  activeSceneId: idValidator<RecordId<SceneRecord>>(SCENE_RECORD_TYPE).nullable(),
})

export const offSceneRecordValidator = T.object<OffSceneRecord>({
  typeName: T.literal(OFF_SCENE_RECORD_TYPE),
  id: idValidator<RecordId<OffSceneRecord>>(OFF_SCENE_RECORD_TYPE),
  nodeIds: T.arrayOf(T.string),
})

/**
 * tldraw asserts the sequence id is exactly `com.tldraw.<typeName>` and throws a
 * mismatch otherwise, so this is not a free choice.
 */
export const sceneRecordMigrations = createCustomRecordMigrationSequence({ sequence: [] })

export const sceneViewRecordMigrations = createCustomRecordMigrationSequence({ sequence: [] })

export const offSceneRecordMigrations = createCustomRecordMigrationSequence({ sequence: [] })

// --- The lens, as pure functions. No Editor, no tldraw import. ---

/**
 * The effective collapsed state of one node.
 *
 * THE FRAME NEVER WRITES. This resolves; it does not mutate. The order is the
 * contract:
 *
 *   1. taken off-scene by a manual toggle  -> its own prop
 *   2. the active scene names it           -> the scene's value
 *   3. otherwise                           -> its own prop
 *
 * "Names it" is `Object.hasOwn`, not `in`: `in` finds inherited keys and would
 * answer for `toString`. Harmless for `shape:` ids, and exactly the sort of thing
 * two builders write differently.
 */
export function effectiveCollapsed(
  nodeId: string,
  ownCollapsed: boolean,
  scene: SceneRecord | null,
  offScene: ReadonlySet<string>,
): boolean {
  if (offScene.has(nodeId)) return ownCollapsed
  if (scene && Object.hasOwn(scene.collapsed, nodeId)) return scene.collapsed[nodeId]!
  return ownCollapsed
}

function ownCollapsedOf(shape: HierarchyShape): boolean {
  return (shape.props as { collapsed?: unknown } | undefined)?.collapsed === true
}

/**
 * A shape accessor that reports each node's EFFECTIVE collapsed state.
 *
 * This is the whole mechanism, and the injection point is deliberate. Collapse is
 * read in TWO places -- `visibility.ts` walks ancestry through
 * `isHiddenByCollapse`, and `mergeIndex.ts` walks it again through `merge.ts`'s
 * `visibleStandInFor` -- and both bottom out in the same pure
 * `isCollapsedContainer`, which reads `props.collapsed` raw. Overriding at the
 * accessor they SHARE covers both without touching either pure module, and it is
 * what makes "merging follows the scene" a property rather than a hope.
 *
 * Returns the accessor unchanged when nothing is in force, so a canvas with no
 * scene active allocates nothing per ancestor step.
 */
export function withEffectiveCollapsed(
  getShape: GetShape,
  scene: SceneRecord | null,
  offScene: ReadonlySet<string>,
): GetShape {
  if (!scene && offScene.size === 0) return getShape
  return (id) => {
    const shape = getShape(id)
    if (!shape || shape.type !== NODE_SHAPE_TYPE) return shape
    const own = ownCollapsedOf(shape)
    const effective = effectiveCollapsed(shape.id, own, scene, offScene)
    if (effective === own) return shape
    return { ...shape, props: { ...shape.props, collapsed: effective } }
  }
}

/**
 * Whether a scene names ids and none of them resolve.
 *
 * Scenes are not shapes, so they outlive a SPEC-007 import that replaced every
 * shape on the page -- and then point at nothing. A scene naming nothing is
 * EMPTY, not stale; one with a single surviving id is neither.
 */
export function isSceneStale(scene: SceneRecord, getShape: GetShape): boolean {
  const named = [...Object.keys(scene.collapsed), ...scene.highlighted]
  if (named.length === 0) return false
  return named.every((id) => getShape(id) === undefined)
}
