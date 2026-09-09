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

/**
 * WHAT A LINE MEANS, as a closed vocabulary.
 *
 * The project owner typed his edges with colour on the first real iPad session
 * without being asked to -- orange for data movement, light-green for
 * permission, black for structure and sequence. The model is a SET on one edge
 * rather than parallel edge sets, which he chose: he declined to draw a third
 * layer of edges, and one edge with three kinds is what he described instead.
 *
 * The accepted cost, so nobody rediscovers it: one edge has one pair of
 * endpoints, so a step whose endpoints differ from the transfer's cannot be
 * expressed. See `decisions.md` -> *An edge carries a set of kinds*.
 */
export const EDGE_KINDS = ['data', 'permission', 'sequence'] as const

export type EdgeKind = (typeof EDGE_KINDS)[number]

export interface ConnectionShapeProps {
  start: { x: number; y: number }
  end: { x: number; y: number }
  /**
   * Added at v1 by the migration below. Empty means an ordinary line, drawn
   * exactly as connections were drawn before kinds existed.
   *
   * Stored in NORMAL FORM -- deduplicated, ordered by plain `<`. Two clients
   * must draw the same line with no coordination, and insertion order is store
   * order, which is exactly what differs between them. Same reason
   * `merge.ts`'s `distinctActors` sorts.
   *
   * Typed `string[]` and not `EdgeKind[]` because the VALIDATOR is structural:
   * see `connectionShapeProps` below.
   */
  kinds: string[]
}

export type ConnectionShape = TLBaseShape<typeof CONNECTION_SHAPE_TYPE, ConnectionShapeProps>

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    [CONNECTION_SHAPE_TYPE]: ConnectionShapeProps
  }
}

/**
 * The normal form: deduplicated, ordered by plain `<`.
 *
 * NOT `localeCompare`, which disagrees with `<` on mixed case -- `merge.ts`
 * records the same choice for the same reason. Order has to come from data both
 * clients already hold.
 *
 * An unrecognised string SURVIVES rather than being dropped. Dropping it here
 * would make a newer build's kind vanish the first time an older build touched
 * the record, which is data loss dressed as validation; the RENDERER is what
 * ignores it.
 */
export function normaliseKinds(kinds: readonly string[]): string[] {
  return [...new Set(kinds)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

const point = T.object({ x: T.number, y: T.number })

export const connectionShapeProps: RecordProps<ConnectionShape> = {
  start: point,
  end: point,
  /**
   * STRUCTURAL, deliberately -- an array of strings, not a union over
   * `EDGE_KINDS`. A closed validator would turn a kind added by a newer build
   * into a record REJECTED at the room boundary, which is the failure mode
   * CLAUDE.md names for shape-prop changes. `icon` on the node shape is the
   * precedent: `T.string`, with the resolver handling a key it does not know.
   */
  kinds: T.arrayOf(T.string),
}

export const connectionShapeDefaultProps: ConnectionShapeProps = {
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  kinds: [],
}

export const connectionVersions = createShapePropsMigrationIds(CONNECTION_SHAPE_TYPE, {
  AddKinds: 1,
})

export const connectionShapeMigrations: TLPropsMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: connectionVersions.AddKinds,
      up(props) {
        // Rooms persist. A prop added without a migration corrupts documents
        // that already exist, and does so quietly. Empty rather than a guessed
        // kind: an existing line said nothing about what it carried, and
        // inventing an answer would put a claim in the diagram nobody made.
        ;(props as ConnectionShapeProps).kinds = []
      },
      down(props) {
        delete (props as Partial<ConnectionShapeProps>).kinds
      },
    },
  ],
})
