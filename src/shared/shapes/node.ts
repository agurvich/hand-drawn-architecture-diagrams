import {
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  type RecordProps,
  type TLBaseShape,
  type TLPropsMigrations,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

/**
 * The ONE declaration of the Node shape. The client builds a ShapeUtil from it
 * and the worker builds its schema from it; neither writes the type string
 * itself. Two hand-written halves agree today and drift tomorrow, and the drift
 * only shows up as records rejected at the room boundary.
 *
 * Imports are restricted to @tldraw/tlschema and @tldraw/validate on purpose --
 * importing `tldraw` would pull React, the DOM and CSS into the Worker bundle.
 * `shared-imports.test.ts` enforces that mechanically.
 */

// Permanent and migration-bearing: changing it later orphans every persisted
// record. Claimed deliberately now, ahead of the SPEC-006 port.
export const NODE_SHAPE_TYPE = 'diagramNode'

export interface NodeShapeProps {
  w: number
  h: number
  label: string
  /** Added at v2 by the migration below. */
  color: string
}

export type NodeShape = TLBaseShape<typeof NODE_SHAPE_TYPE, NodeShapeProps>

/**
 * REQUIRED, and easy to miss. BaseBoxShapeUtil<NodeShape> is constrained to
 * TLBaseBoxShape = Extract<TLShape, ...>, and TLShape is derived from this
 * augmentable registry -- so a custom shape is not a TLShape until it is
 * registered here. Without this, the ShapeUtil fails to compile with
 * "Type 'NodeShape' does not satisfy the constraint 'TLBaseBoxShape'".
 */
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    [NODE_SHAPE_TYPE]: NodeShapeProps
  }
}

export const nodeShapeProps: RecordProps<NodeShape> = {
  w: T.nonZeroNumber,
  h: T.nonZeroNumber,
  label: T.string,
  color: T.string,
}

export const nodeShapeDefaultProps: NodeShapeProps = {
  w: 200,
  h: 120,
  label: '',
  color: 'black',
}

export const nodeVersions = createShapePropsMigrationIds(NODE_SHAPE_TYPE, {
  AddColor: 1,
})

export const nodeShapeMigrations: TLPropsMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: nodeVersions.AddColor,
      up(props) {
        // Rooms persist. A prop added without a migration corrupts documents
        // that already exist, and does so quietly.
        ;(props as NodeShapeProps).color = 'black'
      },
      down(props) {
        delete (props as Partial<NodeShapeProps>).color
      },
    },
  ],
})
