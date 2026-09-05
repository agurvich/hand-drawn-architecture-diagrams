import { createBindingId, type Editor, type TLParentId, type TLShapeId } from 'tldraw'
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

  return toDocument(nodes, connections, bindings)
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
  const { nodes, connections, bindings } = fromDocument(document, editor.getCurrentPageId())

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
  })
}
