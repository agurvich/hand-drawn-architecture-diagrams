import {
  createCustomRecordMigrationSequence,
  createCustomRecordId,
  idValidator,
} from '@tldraw/tlschema'
import type { BaseRecord, RecordId } from '@tldraw/store'
import { T } from '@tldraw/validate'
import { NODE_SHAPE_TYPE } from '../shapes/node'
import type { GetShape, HierarchyShape } from '../shapes/hierarchy'

/**
 * FRAMES: named, saved ways of LOOKING at the diagram.
 *
 * A frame is a lens, not an edit. Viewing one changes what its viewer sees and
 * nothing else -- not the diagram, and not what a collaborator sees. The frames
 * themselves are shared; where each viewer is in that set is their own.
 *
 * A frame is not a shape: it has no geometry and nothing hit-tests it. tldraw 5
 * takes CUSTOM RECORD TYPES, which is the same client/worker duality shapes and
 * bindings already have and follows the same rules -- one declaration, neither
 * side writing the type string, a migration for every field change.
 *
 * `@tldraw/store` is imported for BaseRecord/RecordId, which @tldraw/tlschema
 * imports and does not re-export. That is the whole of the allowlist widening
 * `shared-imports.test.ts` records; `tldraw` itself stays forbidden.
 */

export const FRAME_RECORD_TYPE = 'diagramFrame'
export const FRAME_VIEW_RECORD_TYPE = 'diagramFrameView'
export const OFF_FRAME_RECORD_TYPE = 'diagramOffFrame'

export interface FrameRecord extends BaseRecord<typeof FRAME_RECORD_TYPE, RecordId<FrameRecord>> {
  /** Shown in the list. */
  name: string
  /** Commentary shown while the frame is active. Empty is fine. */
  note: string
  /**
   * Every node that had children when the frame was captured, with its effective
   * state. A node ABSENT from this map falls back to its own prop -- which is
   * how a node created after the frame behaves sensibly.
   */
  collapsed: Record<string, boolean>
  /** Shape ids to accent. Ids that no longer resolve are ignored. */
  highlighted: string[]
  /** Sort key for the frame order. */
  index: string
}

/**
 * Where THIS VIEWER is. One record per session, never synced.
 *
 * In a record rather than a module atom because it is authoritative state, not a
 * derivation: `activeFrameId` cannot be recomputed from anything, and
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
export interface FrameViewRecord extends BaseRecord<
  typeof FRAME_VIEW_RECORD_TYPE,
  RecordId<FrameViewRecord>
> {
  /**
   * BRANDED, not `string`. `editor.store.get(view.activeFrameId)` does not
   * typecheck against a plain string, so every lookup would need an unchecked
   * cast -- in the one place a STALE id is expected, when another client deletes
   * the frame you are viewing.
   */
  activeFrameId: RecordId<FrameRecord> | null
}

/**
 * Which nodes this viewer has taken off-frame. A SEPARATE record, and the split
 * is load-bearing rather than tidiness.
 *
 * tldraw's history records whole-record diffs and filters only on `source`, not
 * on scope -- so a session record lands on the undo stack like any shape. These
 * two fields need OPPOSITE treatment:
 *
 *   - `activeFrameId` must NEVER be undoable. Merely looking at a frame fused
 *     itself onto the reader's previous edit, so one undo threw them off the
 *     frame; and once a toggle was recorded, undo walked them backwards through
 *     the story.
 *   - the off-frame set MUST be undoable, atomically with the shape prop the
 *     toggle writes, or undo restores the prop and leaves the node off-frame --
 *     showing a state nobody asked for.
 *
 * One record cannot be both, and `createCustomRecordType` drops `ephemeralKeys`
 * so a field-level exemption is not available either. Two records is the fix,
 * and the boundary between them is exactly the boundary between "history
 * ignored" and "history recorded".
 */
export interface OffFrameRecord extends BaseRecord<
  typeof OFF_FRAME_RECORD_TYPE,
  RecordId<OffFrameRecord>
> {
  /** Node ids whose own prop wins over the active frame, for this viewer. */
  nodeIds: string[]
}

/**
 * REQUIRED, and easy to miss -- the same trap `node.ts` names for shapes.
 * `TLRecord` is derived from this augmented map, so without it the store's
 * `put`/`get` never accept these types.
 */
declare module '@tldraw/tlschema' {
  interface TLGlobalRecordPropsMap {
    [FRAME_RECORD_TYPE]: FrameRecord
    [FRAME_VIEW_RECORD_TYPE]: FrameViewRecord
    [OFF_FRAME_RECORD_TYPE]: OffFrameRecord
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
export const FRAME_VIEW_SINGLETON_ID = createCustomRecordId(
  FRAME_VIEW_RECORD_TYPE,
  'current',
) as RecordId<FrameViewRecord>

export const OFF_FRAME_SINGLETON_ID = createCustomRecordId(
  OFF_FRAME_RECORD_TYPE,
  'current',
) as RecordId<OffFrameRecord>

/** Validators cover the WHOLE record, `id` and `typeName` included. */
export const frameRecordValidator = T.object<FrameRecord>({
  typeName: T.literal(FRAME_RECORD_TYPE),
  id: idValidator<RecordId<FrameRecord>>(FRAME_RECORD_TYPE),
  name: T.string,
  note: T.string,
  collapsed: T.dict(T.string, T.boolean),
  highlighted: T.arrayOf(T.string),
  index: T.string,
})

export const frameViewRecordValidator = T.object<FrameViewRecord>({
  typeName: T.literal(FRAME_VIEW_RECORD_TYPE),
  id: idValidator<RecordId<FrameViewRecord>>(FRAME_VIEW_RECORD_TYPE),
  activeFrameId: idValidator<RecordId<FrameRecord>>(FRAME_RECORD_TYPE).nullable(),
})

export const offFrameRecordValidator = T.object<OffFrameRecord>({
  typeName: T.literal(OFF_FRAME_RECORD_TYPE),
  id: idValidator<RecordId<OffFrameRecord>>(OFF_FRAME_RECORD_TYPE),
  nodeIds: T.arrayOf(T.string),
})

/**
 * tldraw asserts the sequence id is exactly `com.tldraw.<typeName>` and throws a
 * mismatch otherwise, so this is not a free choice.
 */
export const frameRecordMigrations = createCustomRecordMigrationSequence({ sequence: [] })

export const frameViewRecordMigrations = createCustomRecordMigrationSequence({ sequence: [] })

export const offFrameRecordMigrations = createCustomRecordMigrationSequence({ sequence: [] })

// --- The lens, as pure functions. No Editor, no tldraw import. ---

/**
 * The effective collapsed state of one node.
 *
 * THE FRAME NEVER WRITES. This resolves; it does not mutate. The order is the
 * contract:
 *
 *   1. taken off-frame by a manual toggle  -> its own prop
 *   2. the active frame names it           -> the frame's value
 *   3. otherwise                           -> its own prop
 *
 * "Names it" is `Object.hasOwn`, not `in`: `in` finds inherited keys and would
 * answer for `toString`. Harmless for `shape:` ids, and exactly the sort of thing
 * two builders write differently.
 */
export function effectiveCollapsed(
  nodeId: string,
  ownCollapsed: boolean,
  frame: FrameRecord | null,
  offFrame: ReadonlySet<string>,
): boolean {
  if (offFrame.has(nodeId)) return ownCollapsed
  if (frame && Object.hasOwn(frame.collapsed, nodeId)) return frame.collapsed[nodeId]!
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
 * what makes "merging follows the frame" a property rather than a hope.
 *
 * Returns the accessor unchanged when nothing is in force, so a canvas with no
 * frame active allocates nothing per ancestor step.
 */
export function withEffectiveCollapsed(
  getShape: GetShape,
  frame: FrameRecord | null,
  offFrame: ReadonlySet<string>,
): GetShape {
  if (!frame && offFrame.size === 0) return getShape
  return (id) => {
    const shape = getShape(id)
    if (!shape || shape.type !== NODE_SHAPE_TYPE) return shape
    const own = ownCollapsedOf(shape)
    const effective = effectiveCollapsed(shape.id, own, frame, offFrame)
    if (effective === own) return shape
    return { ...shape, props: { ...shape.props, collapsed: effective } }
  }
}

/**
 * Whether a frame names ids and none of them resolve.
 *
 * Frames are not shapes, so they outlive a SPEC-007 import that replaced every
 * shape on the page -- and then point at nothing. A frame naming nothing is
 * EMPTY, not stale; one with a single surviving id is neither.
 */
export function isFrameStale(frame: FrameRecord, getShape: GetShape): boolean {
  const named = [...Object.keys(frame.collapsed), ...frame.highlighted]
  if (named.length === 0) return false
  return named.every((id) => getShape(id) === undefined)
}
