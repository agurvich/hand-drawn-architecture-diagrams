import {
  BindingUtil,
  type BindingOnShapeDeleteOptions,
  type BindingOnShapeChangeOptions,
} from 'tldraw'
import {
  CONNECTION_BINDING_TYPE,
  connectionBindingMigrations,
  connectionBindingProps,
  type ConnectionBinding,
} from '@shared/shapes'

/**
 * `fromId` is the connection shape; `toId` is the node it attaches to.
 *
 * Routing is NOT computed here -- see ConnectionShapeUtil.getGeometry for why.
 * This util has exactly two jobs.
 */
export class ConnectionBindingUtil extends BindingUtil<ConnectionBinding> {
  static override type = CONNECTION_BINDING_TYPE
  static override props = connectionBindingProps
  static override migrations = connectionBindingMigrations

  override getDefaultProps() {
    return { terminal: 'start' as const }
  }

  /**
   * Keep the connection somewhere sensible in the hierarchy. Not routing.
   */
  override onAfterChangeToShape({ binding }: BindingOnShapeChangeOptions<ConnectionBinding>) {
    const connection = this.editor.getShape(binding.fromId)
    if (!connection) return
    const pageId = this.editor.getCurrentPageId()
    if (connection.parentId !== pageId) {
      this.editor.reparentShapes([connection.id], pageId)
    }
  }

  /**
   * The load-bearing one. tldraw already deletes the BINDING when a bound shape
   * goes -- what it does not do is delete the connection SHAPE, which would
   * otherwise survive as a line bound to nothing.
   */
  override onBeforeDeleteToShape({ binding }: BindingOnShapeDeleteOptions<ConnectionBinding>) {
    this.editor.deleteShape(binding.fromId)
  }
}
