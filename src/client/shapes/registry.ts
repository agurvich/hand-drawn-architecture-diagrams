import { defaultShapeUtils, defaultTools, type TLUiOverrides, type TLComponents } from 'tldraw'
import { NodeShapeUtil } from './NodeShapeUtil'
import { NodeTool } from '../tools/NodeTool'
import { Toolbar } from './Toolbar'
import { NODE_SHAPE_TYPE } from '@shared/shapes'

/**
 * useSync does NOT include tldraw's default shape utils the way <Tldraw> does,
 * so this list must be passed to BOTH -- omit it from either and the built-in
 * shapes vanish on that side.
 */
export const shapeUtils = [...defaultShapeUtils, NodeShapeUtil]
export const tools = [...defaultTools, NodeTool]

export const uiOverrides: TLUiOverrides = {
  tools(editor, toolsInMenu) {
    toolsInMenu[NODE_SHAPE_TYPE] = {
      id: NODE_SHAPE_TYPE,
      icon: 'geo-rectangle', // built-in icon; SPEC-003 excludes introducing one
      label: 'Node',
      kbd: 'n',
      onSelect: () => editor.setCurrentTool(NODE_SHAPE_TYPE),
    }
    return toolsInMenu
  },
}

export const components: TLComponents = {
  // Required for the tool to be reachable from the toolbar: uiOverrides.tools
  // only registers it, it does not render it.
  Toolbar,
}
