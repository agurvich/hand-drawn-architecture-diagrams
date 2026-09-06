import {
  defaultShapeUtils,
  defaultTools,
  defaultBindingUtils,
  type TLUiOverrides,
  type TLComponents,
} from 'tldraw'
import { NodeShapeUtil } from './NodeShapeUtil'
import { ConnectionShapeUtil } from './ConnectionShapeUtil'
import { ConnectionBindingUtil } from '../bindings/ConnectionBindingUtil'
import { NodeTool } from '../tools/NodeTool'
import { ConnectionTool } from '../tools/ConnectionTool'
import { Toolbar } from './Toolbar'
import { NODE_SHAPE_TYPE, CONNECTION_SHAPE_TYPE } from '@shared/shapes'
import { customRecordSchemas } from '@shared/scenes'

/**
 * useSync does NOT include tldraw's default shape utils the way <Tldraw> does,
 * so this list must be passed to BOTH -- omit it from either and the built-in
 * shapes vanish on that side.
 */
export const shapeUtils = [...defaultShapeUtils, NodeShapeUtil, ConnectionShapeUtil]
export const tools = [...defaultTools, NodeTool, ConnectionTool]

/** Registered on BOTH useSync and <Tldraw>, exactly as shapeUtils are. */
export const bindingUtils = [...defaultBindingUtils, ConnectionBindingUtil]

/**
 * Everything the synced store's schema is built from, as ONE object.
 *
 * Hoisted out of Room.tsx so a test can assert on the exact options useSync
 * receives -- inline options inside a component are unreachable, and the
 * alternative is a source-text scan, which cannot tell a live argument from a
 * dead one.
 *
 * Note `records` belongs to THIS branch only. `TLStoreSchemaOptions` is a union
 * of `{shapeUtils, bindingUtils, records}` and `{schema}`; passing both
 * typechecks and the schema branch discards `records` silently, so devOnly.ts
 * builds its own createTLSchema({ records }) instead.
 */
export const syncSchemaOptions = { shapeUtils, bindingUtils, records: customRecordSchemas }

export const uiOverrides: TLUiOverrides = {
  tools(editor, toolsInMenu) {
    toolsInMenu[NODE_SHAPE_TYPE] = {
      id: NODE_SHAPE_TYPE,
      icon: 'geo-rectangle', // built-in icon; SPEC-003 excludes introducing one
      label: 'Node',
      kbd: 'n',
      onSelect: () => editor.setCurrentTool(NODE_SHAPE_TYPE),
    }
    toolsInMenu[CONNECTION_SHAPE_TYPE] = {
      id: CONNECTION_SHAPE_TYPE,
      icon: 'tool-arrow',
      label: 'Connection',
      kbd: 'c',
      onSelect: () => editor.setCurrentTool(CONNECTION_SHAPE_TYPE),
    }
    return toolsInMenu
  },
}

export const components: TLComponents = {
  // Required for the tool to be reachable from the toolbar: uiOverrides.tools
  // only registers it, it does not render it.
  Toolbar,
}
