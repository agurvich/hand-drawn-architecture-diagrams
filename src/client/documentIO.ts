import {
  createBindingId,
  getIndexAbove,
  ZERO_INDEX_KEY,
  type Editor,
  type IndexKey,
  type TLParentId,
  type TLShapeId,
} from 'tldraw'
import { SCENE_RECORD_TYPE, OFF_SCENE_SINGLETON_ID, type SceneRecord } from '@shared/scenes'
import { scenesInOrder } from './sceneView'
import {
  toDocument,
  fromDocument,
  NODE_SHAPE_TYPE,
  CONNECTION_SHAPE_TYPE,
  CONNECTION_BINDING_TYPE,
  type ConnectionBinding,
  type DiagramDocument,
  type ExportableConnection,
  type ExportableNode,
  type BindingDescriptor,
  type ExportableScene,
} from '@shared/shapes'

/**
 * The two adapters between the tldraw store and the diagram document. The
 * format itself is pure and lives in `src/shared/document.ts`; this is the only
 * place an Editor appears.
 */

/**
 * The current page as a document.
 *
 * Reads `getCurrentPageShapes`, NEVER `getCurrentPageRenderingShapesSorted` --
 * that one filters hidden and off-screen shapes, so collapsing a container or
 * scrolling away from one would silently drop it from the export.
 */
export function exportDocument(editor: Editor): DiagramDocument {
  const nodes: ExportableNode[] = []
  const connections: ExportableConnection[] = []
  const bindings: BindingDescriptor[] = []

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === NODE_SHAPE_TYPE) {
      nodes.push({
        id: shape.id,
        type: NODE_SHAPE_TYPE,
        parentId: shape.parentId,
        x: shape.x,
        y: shape.y,
        rotation: shape.rotation,
        props: shape.props,
      })
    } else if (shape.type === CONNECTION_SHAPE_TYPE) {
      connections.push({
        id: shape.id,
        type: CONNECTION_SHAPE_TYPE,
        parentId: shape.parentId,
        x: shape.x,
        y: shape.y,
        rotation: shape.rotation,
        props: shape.props,
      })
      for (const binding of editor.getBindingsFromShape<ConnectionBinding>(
        shape,
        CONNECTION_BINDING_TYPE,
      )) {
        bindings.push({
          type: CONNECTION_BINDING_TYPE,
          fromId: binding.fromId,
          toId: binding.toId,
          props: binding.props,
        })
      }
    }
  }

  // Through `scenesInOrder`, NOT a raw `store.allRecords().filter`. That call
  // reads every value atom in the store, and this function runs inside two
  // `useValue`s in the panel -- `undocumentableShapeCount` calls it too -- so an
  // unguarded read makes the panel depend on the camera and on every shape, and
  // re-render on every pointer frame of a drag. `scenesInOrder` is a `computed`
  // with an `isEqual` for exactly that reason, and it already sorts by
  // `(index, id)` under plain `<`, which is the comparator the format wants.
  const scenes: ExportableScene[] = scenesInOrder(editor).map((scene) => ({
    id: scene.id,
    name: scene.name,
    note: scene.note,
    collapsed: scene.collapsed,
    highlighted: scene.highlighted,
    index: scene.index,
  }))

  return toDocument(nodes, connections, bindings, scenes)
}

/**
 * How many shapes on the page the document cannot describe.
 *
 * Derived from the same conversion the export runs, so the number the panel
 * shows and the omissions the export makes cannot disagree. It counts pure
 * LOSS, not deletions: importing removes every shape, but the documentable ones
 * are immediately replaced by their equivalents.
 *
 * A half-bound connection counts, despite being a `diagramConnection` -- which
 * is why this is derived rather than a shape-type test.
 */
export function undocumentableShapeCount(editor: Editor): number {
  const document = exportDocument(editor)
  const onPage = editor.getCurrentPageShapes().length
  return onPage - (document.nodes.length + document.connections.length)
}

/**
 * How many scenes an import would replace.
 *
 * Its own function because scenes are NOT page shapes: they never enter
 * `undocumentableShapeCount`'s arithmetic, so a room with six hand-authored
 * scenes and nothing undocumentable on the page would have been replaced with no
 * confirmation at all. Every scene is lost on import, documentable or not --
 * this is replacement, not omission, which is why it counts all of them rather
 * than a difference.
 */
export function replacedSceneCount(editor: Editor): number {
  return scenesInOrder(editor).length
}

/**
 * Replace the page with a document, as one undoable step.
 *
 * The single undo comes from `markHistoryStoppingPoint`, not from `run` --
 * `run` batches into one transaction but does not touch history unless asked.
 * What has to hold is that NOTHING marks between the mark here and the end of
 * this call, or the import splits across two undo entries.
 *
 * Takes an already-parsed document: `parseDocument` is the panel's job, on the
 * paste path, so an invalid document cannot reach the store through here.
 */
export function importDocument(editor: Editor, document: DiagramDocument): void {
  const { nodes, connections, bindings, scenes } = fromDocument(document, editor.getCurrentPageId())

  editor.markHistoryStoppingPoint()
  editor.run(() => {
    const existing = editor.getCurrentPageShapes().map((shape) => shape.id)
    if (existing.length > 0) editor.deleteShapes(existing)

    // Parents before children: `fromDocument` returns them ordered, and
    // connections last so their bindings have something to point at.
    editor.createShapes(
      [...nodes, ...connections].map((record) => ({
        ...record,
        id: record.id as TLShapeId,
        parentId: record.parentId as TLParentId,
      })),
    )
    editor.createBindings(
      bindings.map((binding) => ({
        ...binding,
        id: createBindingId(),
        fromId: binding.fromId as TLShapeId,
        toId: binding.toId as TLShapeId,
      })),
    )

    /*
     * Scenes are REPLACED, exactly as the diagram is -- a document is the whole
     * artifact, so pasting a revised one revises the whole thing.
     *
     * DIRECT STORE WRITES, not `sceneView.ts`'s mutations. Those pass
     * `{ history: 'ignore' }` by design, so narration never interleaves with
     * diagram edits; an import IS a diagram edit, and this is the one place
     * that exception is made. Routing through them would leave the scenes
     * outside the single undo while the shapes were inside it.
     *
     * The indices are minted HERE and not in `document.ts`, which has no tldraw
     * import: a hand-rolled scheme there would produce a different ordering
     * alphabet from the one `captureScene` mints with, so the next scene
     * captured after an import would interleave wrongly. (And the obvious
     * `a${i + 1}` breaks outright at ten, since `'a10' < 'a2'`.)
     */
    const oldScenes = editor.store
      .allRecords()
      .filter((record) => record.typeName === SCENE_RECORD_TYPE)
      .map((record) => record.id)
    if (oldScenes.length > 0) editor.store.remove(oldScenes)

    let index = ZERO_INDEX_KEY
    editor.store.put(
      scenes.map((scene) => {
        const record: SceneRecord = {
          typeName: SCENE_RECORD_TYPE,
          id: scene.id as SceneRecord['id'],
          name: scene.name,
          note: scene.note,
          collapsed: scene.collapsed,
          highlighted: scene.highlighted,
          index,
        }
        index = getIndexAbove(index as IndexKey)
        return record
      }),
    )

    /*
     * And the viewer's off-scene set goes with them. A direct write bypasses
     * `viewScene`, whose job includes clearing it -- and because an import
     * preserves author-chosen ids, a viewer who had folded `shape:a` off-scene
     * before importing a document containing node `a` would have the new
     * scene's `collapsed['a']` silently suppressed, for them alone.
     */
    editor.store.remove([OFF_SCENE_SINGLETON_ID])
  })
}
