import { NODE_SHAPE_TYPE, nodeShapeProps, nodeShapeMigrations, type NodeShape } from './node'

export * from './node'
export * from './hierarchy'

/**
 * The registry both runtimes consume. The client maps these to ShapeUtils; the
 * worker spreads them into createTLSchema alongside the built-in schemas.
 */
export const customShapeSchemas = {
  [NODE_SHAPE_TYPE]: { props: nodeShapeProps, migrations: nodeShapeMigrations },
} as const

export type CustomShape = NodeShape
