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
  /** Added at v3. While true, every descendant is hidden. */
  collapsed: boolean
  /**
   * Added at v4. THREE STATES, and the third is the interesting one:
   *
   *   a key   -> pinned. This icon, whatever the label says.
   *   'none'  -> pinned to nothing. No icon here, deliberately.
   *   ''      -> automatic. Guessed live, so renaming the node updates it.
   *
   * Automatic is the ABSENCE of a decision, not a value written once at
   * creation. A node called "DB" renamed to "Queue" changes icon; one whose icon
   * was chosen by hand does not. Writing the guess into the record at creation
   * would look identical on day one and lose that behaviour forever.
   *
   * The empty string is the sentinel because a shape prop cannot be `undefined`
   * -- it is validated and persisted, and an optional prop on a required record
   * is a different thing from an absent one. See `resolveNodeIcon`.
   */
  icon: string
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
  collapsed: T.boolean,
  icon: T.string,
}

export const nodeShapeDefaultProps: NodeShapeProps = {
  w: 200,
  h: 120,
  label: '',
  color: 'black',
  collapsed: false,
  // '' means AUTOMATIC -- guessed live from the label. See `resolveNodeIcon`.
  icon: '',
}

export const nodeVersions = createShapePropsMigrationIds(NODE_SHAPE_TYPE, {
  AddColor: 1,
  AddCollapsed: 2,
  AddIcon: 3,
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
    {
      id: nodeVersions.AddCollapsed,
      up(props) {
        // Rooms already hold v2 records. Default to expanded: a node that
        // silently arrived collapsed would look like its children were lost.
        ;(props as NodeShapeProps).collapsed = false
      },
      down(props) {
        delete (props as Partial<NodeShapeProps>).collapsed
      },
    },
    {
      id: nodeVersions.AddIcon,
      up(props) {
        // Rooms hold v3 records. Default to AUTOMATIC rather than to a guessed
        // key: every existing node gains an icon derived from its label, which
        // is the intended outcome, and it keeps following the label afterwards.
        // Writing a guess here would freeze whatever the label happened to be
        // at migration time.
        ;(props as NodeShapeProps).icon = ''
      },
      down(props) {
        delete (props as Partial<NodeShapeProps>).icon
      },
    },
  ],
})
