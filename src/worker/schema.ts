import { createTLSchema, defaultShapeSchemas, defaultBindingSchemas } from '@tldraw/tlschema'
import { customShapeSchemas, customBindingSchemas } from '../shared/shapes'
import { customRecordSchemas } from '../shared/scenes'

/**
 * The worker's half of the shape declaration, built from the same shared
 * definition the client's ShapeUtils are.
 *
 * `shapes` REPLACES the defaults rather than extending them. Omitting the spread
 * below would make every built-in record -- draw, geo, arrow, note -- an unknown
 * type at the room boundary, silently undoing everything SPEC-002 proved. It
 * would also make "an unknown shape type is rejected" pass for exactly the wrong
 * reason.
 */
export const roomSchema = createTLSchema({
  shapes: { ...defaultShapeSchemas, ...customShapeSchemas },
  // Same replace-not-extend trap as `shapes`: omitting the spread would make
  // tldraw's own arrow bindings unknown at the room boundary.
  bindings: { ...defaultBindingSchemas, ...customBindingSchemas },
  // Custom RECORD types -- scenes. No defaults to spread here: tldraw's own
  // record types are not opt-in the way shapes and bindings are.
  records: customRecordSchemas,
})
