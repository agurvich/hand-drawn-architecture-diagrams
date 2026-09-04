import { createTLSchema, defaultShapeSchemas, defaultBindingSchemas } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { NODE_SHAPE_TYPE, nodeShapeMigrations } from '@shared/shapes'

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
    shapes: {
      ...defaultShapeSchemas,
      [NODE_SHAPE_TYPE]: {
        props: { w: T.any, h: T.any, label: T.any, color: T.any },
        migrations: nodeShapeMigrations,
      },
    },
    bindings: defaultBindingSchemas,
  })
}
