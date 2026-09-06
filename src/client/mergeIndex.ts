import { computed, type Computed, type Editor } from 'tldraw'
import { frameAwareGetShape } from './frameView'
import {
  computeMergeIndex,
  CONNECTION_SHAPE_TYPE,
  CONNECTION_BINDING_TYPE,
  type ConnectionBinding,
  type ConnectionEndpoints,
  type MergeEntry,
  type MergeIndex,
} from '@shared/shapes'

/**
 * The merged view of the connection graph, derived once per store change.
 *
 * THE INDEX HOLDS IDS, FLAGS AND A COUNT. IT MUST NOT HOLD COORDINATES.
 *
 * SPEC-005's load-bearing result is that a connection's anchors are read from the
 * bound shapes' page transforms at geometry time, so moving a CONTAINER re-routes
 * lines bound to its descendants -- nothing fires a hook there. An index that also
 * cached anchor points would put a second, staler answer beside the live one, and
 * SPEC-005's own test would not catch it: that test uses an EXPANDED container and
 * an unmerged connection, so it never reads a resolved entry at all.
 *
 * The structural reason it cannot go wrong by accident: `merge.ts` is a pure
 * src/shared module with no access to page transforms in the first place.
 */

/**
 * The `computed` has to live somewhere across calls. Building one per call would
 * silently revert to recomputing per shape per store change -- the exact churn
 * the wrapper exists to prevent, and it reverts without any symptom. Keyed on the
 * editor so it is collected with it.
 */
const indexes = new WeakMap<Editor, Computed<MergeIndex>>()

export function getMergeIndex(editor: Editor): MergeIndex {
  let index = indexes.get(editor)
  if (!index) {
    index = computed('mergeIndex', () => deriveMergeIndex(editor), { isEqual: sameIndex })
    indexes.set(editor, index)
  }
  return index.get()
}

function deriveMergeIndex(editor: Editor): MergeIndex {
  const connections: ConnectionEndpoints[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== CONNECTION_SHAPE_TYPE) continue
    const bindings = editor.getBindingsFromShape<ConnectionBinding>(shape, CONNECTION_BINDING_TYPE)
    connections.push({
      connectionId: shape.id,
      startNodeId: bindings.find((b) => b.props.terminal === 'start')?.toId ?? null,
      endNodeId: bindings.find((b) => b.props.terminal === 'end')?.toId ?? null,
    })
  }
  // The same frame-aware accessor visibility.ts uses. Collapse is read in two
  // places; if only one of them saw the frame, a frame would fold a container
  // while the connections crossing its boundary stayed unmerged and drawn to
  // shapes that are no longer on screen.
  return computeMergeIndex(connections, frameAwareGetShape(editor))
}

/**
 * The derivation reads every shape record on the page, so ANY shape change --
 * including every pointer frame of dragging an unrelated node -- reruns it and
 * produces a fresh Map. Without this the new Map's identity alone would
 * invalidate every connection's geometry, handles and visibility caches, which
 * on an iPad is a real cost for no change in output.
 */
function sameIndex(a: MergeIndex, b: MergeIndex): boolean {
  if (a.size !== b.size) return false
  for (const [id, entry] of a) {
    const other = b.get(id)
    if (!other || !sameEntry(entry, other)) return false
  }
  return true
}

function sameEntry(a: MergeEntry, b: MergeEntry): boolean {
  return (
    a.hidden === b.hidden &&
    a.count === b.count &&
    a.startNodeId === b.startNodeId &&
    a.endNodeId === b.endNodeId
  )
}
