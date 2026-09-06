import { NODE_SHAPE_TYPE, nodeShapeProps, nodeShapeMigrations, type NodeShape } from './node'
import {
  CONNECTION_SHAPE_TYPE,
  connectionShapeProps,
  connectionShapeMigrations,
  type ConnectionShape,
} from './connection'
import {
  CONNECTION_BINDING_TYPE,
  connectionBindingProps,
  connectionBindingMigrations,
} from '../bindings/connection'
import { ACTOR_BINDING_TYPE, actorBindingProps, actorBindingMigrations } from '../bindings/actor'

export * from './node'
export * from './hierarchy'
export * from './connection'
export * from './merge'
export * from '../document'
export * from '../bindings/connection'
export * from '../bindings/actor'

/**
 * The registry both runtimes consume. The client maps these to ShapeUtils; the
 * worker spreads them into createTLSchema alongside the built-in schemas.
 */
export const customShapeSchemas = {
  [NODE_SHAPE_TYPE]: { props: nodeShapeProps, migrations: nodeShapeMigrations },
  [CONNECTION_SHAPE_TYPE]: {
    props: connectionShapeProps,
    migrations: connectionShapeMigrations,
  },
} as const

/**
 * Bindings register exactly as shapes do, and the worker spreads these alongside
 * `defaultBindingSchemas` -- `bindings` REPLACES the defaults, the same
 * replace-not-extend trap SPEC-003 hit with shapes.
 */
export const customBindingSchemas = {
  [CONNECTION_BINDING_TYPE]: {
    props: connectionBindingProps,
    migrations: connectionBindingMigrations,
  },
  [ACTOR_BINDING_TYPE]: {
    props: actorBindingProps,
    migrations: actorBindingMigrations,
  },
} as const

export type CustomShape = NodeShape | ConnectionShape
