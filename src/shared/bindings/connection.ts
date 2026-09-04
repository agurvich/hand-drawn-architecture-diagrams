import {
  createBindingPropsMigrationIds,
  createBindingPropsMigrationSequence,
  type RecordProps,
  type TLBaseBinding,
  type TLPropsMigrations,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

/**
 * The ONE declaration of the connection binding. Same contract as a custom
 * shape (SPEC-003): declared here, consumed by the client's BindingUtil and the
 * worker's schema, with neither writing the type string itself.
 *
 * Note bindings have their OWN migration API -- createBindingProps*, not
 * createShapeProps* -- and their sequence key is `com.tldraw.binding.<type>`.
 */

export const CONNECTION_BINDING_TYPE = 'connectionEndpoint'

/** Which end of the connection this binding attaches. */
export type ConnectionTerminal = 'start' | 'end'

export interface ConnectionBindingProps {
  terminal: ConnectionTerminal
}

export type ConnectionBinding = TLBaseBinding<
  typeof CONNECTION_BINDING_TYPE,
  ConnectionBindingProps
>

declare module '@tldraw/tlschema' {
  interface TLGlobalBindingPropsMap {
    [CONNECTION_BINDING_TYPE]: ConnectionBindingProps
  }
}

export const connectionBindingProps: RecordProps<ConnectionBinding> = {
  terminal: T.literalEnum('start', 'end'),
}

export const connectionBindingVersions = createBindingPropsMigrationIds(CONNECTION_BINDING_TYPE, {})

export const connectionBindingMigrations: TLPropsMigrations = createBindingPropsMigrationSequence({
  sequence: [],
})
