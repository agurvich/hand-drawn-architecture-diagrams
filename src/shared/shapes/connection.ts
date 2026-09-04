import {
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  type RecordProps,
  type TLBaseShape,
  type TLPropsMigrations,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

/**
 * The connection shape: a line between two nodes.
 *
 * `start` and `end` are a FALLBACK only, used while a terminal is unbound
 * mid-drag. When a terminal is bound, its anchor is DERIVED in getGeometry from
 * the bound node's page transform and never written here -- see
 * `ConnectionShapeUtil` for why storing it fails FR-003.
 */

export const CONNECTION_SHAPE_TYPE = 'diagramConnection'

export interface ConnectionShapeProps {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

export type ConnectionShape = TLBaseShape<typeof CONNECTION_SHAPE_TYPE, ConnectionShapeProps>

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    [CONNECTION_SHAPE_TYPE]: ConnectionShapeProps
  }
}

const point = T.object({ x: T.number, y: T.number })

export const connectionShapeProps: RecordProps<ConnectionShape> = {
  start: point,
  end: point,
}

export const connectionShapeDefaultProps: ConnectionShapeProps = {
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
}

export const connectionVersions = createShapePropsMigrationIds(CONNECTION_SHAPE_TYPE, {})

export const connectionShapeMigrations: TLPropsMigrations = createShapePropsMigrationSequence({
  sequence: [],
})
