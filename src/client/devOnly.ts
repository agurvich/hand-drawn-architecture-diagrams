import { createTLSchema, defaultShapeSchemas, defaultBindingSchemas } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import {
  NODE_SHAPE_TYPE,
  nodeShapeMigrations,
  nodeShapeProps,
  customShapeSchemas,
  customBindingSchemas,
} from '@shared/shapes'
import { customRecordSchemas } from '@shared/scenes'

/**
 * DEV ONLY, and opt-in PER TEST.
 *
 * SPEC-003 FR-003 requires proving the WORKER rejects a malformed record. The
 * client store validates locally and throws first, so a malformed record cannot
 * be produced through the normal editor API -- it never reaches the socket.
 * This builds a deliberately permissive client schema so one can.
 *
 * Two gates, not one. `import.meta.env.DEV` alone is not enough, because the e2e
 * suite runs against the DEV server (SPEC-002 replaced `vite preview` with it),
 * so a blanket permissive schema would silently weaken every other sync spec.
 * The URL flag makes it opt-in for the single test that needs it.
 *
 * The marker string below is asserted ABSENT from the production bundle by
 * `e2e/custom-shape.spec.ts` -- a gate nobody tests is not a gate.
 */
export const UNVALIDATED_MARKER = 'HDAD_DEV_UNVALIDATED_CLIENT'

export function unvalidatedSchemaIfRequested() {
  if (!import.meta.env.DEV) return null
  if (!new URLSearchParams(window.location.search).has('unvalidated')) return null
  console.warn(`${UNVALIDATED_MARKER}: client-side validation disabled for this session`)
  return createTLSchema({
    bindings: { ...defaultBindingSchemas, ...customBindingSchemas },
    // Scenes too, or the ?unvalidated path desyncs on a record the room has.
    records: customRecordSchemas,
    shapes: {
      ...defaultShapeSchemas,
      ...customShapeSchemas,
      [NODE_SHAPE_TYPE]: {
        // DERIVED from the real prop names, not a hand-written list. A literal
        // list goes stale the moment a prop is added -- SPEC-004's `collapsed`
        // broke exactly that, with a confusing "Unexpected property" error in a
        // test about a different subject.
        props: Object.fromEntries(Object.keys(nodeShapeProps).map((k) => [k, T.any])),
        migrations: nodeShapeMigrations,
      },
    },
  })
}
