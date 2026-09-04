import { StateNode, createShapeId, createBindingId, type TLShape, type TLShapeId } from 'tldraw'
import { CONNECTION_SHAPE_TYPE, CONNECTION_BINDING_TYPE } from '@shared/shapes'
import { nodeAtPoint } from '../nodeAtPoint'

/**
 * Drag from one node to another to connect them.
 *
 * Refusals live here rather than being cleaned up afterwards: a drag that ends
 * on empty canvas, on a non-node, or on the node it started from creates
 * NOTHING -- no shape and no binding to garbage-collect.
 */
class Idle extends StateNode {
  static override id = 'idle'
  override onPointerDown() {
    this.parent.transition('pointing')
  }
}

class Pointing extends StateNode {
  static override id = 'pointing'
  private sourceId: TLShapeId | null = null
  private connectionId: TLShapeId | null = null

  private nodeUnderCursor(): TLShape | undefined {
    return nodeAtPoint(this.editor, this.editor.inputs.getCurrentPagePoint())
  }

  override onEnter() {
    const source = this.nodeUnderCursor()
    if (!source) {
      this.parent.transition('idle')
      return
    }
    this.sourceId = source.id
  }

  override onPointerMove() {
    if (!this.sourceId) return
    const target = this.nodeUnderCursor()
    // Hint what the connection would attach to.
    this.editor.setHintingShapes(target && target.id !== this.sourceId ? [target.id] : [])
  }

  override onPointerUp() {
    const target = this.nodeUnderCursor()
    this.editor.setHintingShapes([])

    // Every refusal: no target, not a node, or the source itself.
    if (!this.sourceId || !target || target.id === this.sourceId) {
      this.cleanup()
      return
    }

    const connectionId = createShapeId()
    this.editor.run(() => {
      this.editor.createShape({ id: connectionId, type: CONNECTION_SHAPE_TYPE, x: 0, y: 0 })
      for (const [terminal, toId] of [
        ['start', this.sourceId!],
        ['end', target.id],
      ] as const) {
        this.editor.createBinding({
          id: createBindingId(),
          type: CONNECTION_BINDING_TYPE,
          fromId: connectionId,
          toId,
          props: { terminal },
        })
      }
    })
    this.connectionId = null
    this.cleanup()
  }

  override onCancel() {
    this.cleanup()
  }

  private cleanup() {
    if (this.connectionId) this.editor.deleteShape(this.connectionId)
    this.sourceId = null
    this.connectionId = null
    this.editor.setHintingShapes([])
    this.editor.setCurrentTool('select')
  }
}

export class ConnectionTool extends StateNode {
  static override id = CONNECTION_SHAPE_TYPE
  static override initial = 'idle'
  static override children() {
    return [Idle, Pointing]
  }
}
