import {
  DefaultToolbar,
  DefaultToolbarContent,
  TldrawUiMenuItem,
  useIsToolSelected,
  useTools,
} from 'tldraw'
import { NODE_SHAPE_TYPE, CONNECTION_SHAPE_TYPE } from '@shared/shapes'

/**
 * `uiOverrides.tools` registers a tool but does NOT put it in the toolbar --
 * the toolbar renders a fixed set of items. Adding one means overriding the
 * Toolbar component and rendering our item alongside the defaults.
 */
export function Toolbar() {
  const tools = useTools()
  const nodeTool = tools[NODE_SHAPE_TYPE]
  const connectionTool = tools[CONNECTION_SHAPE_TYPE]
  const nodeSelected = useIsToolSelected(nodeTool)
  const connectionSelected = useIsToolSelected(connectionTool)
  return (
    <DefaultToolbar>
      {nodeTool && <TldrawUiMenuItem {...nodeTool} isSelected={nodeSelected} />}
      {connectionTool && <TldrawUiMenuItem {...connectionTool} isSelected={connectionSelected} />}
      <DefaultToolbarContent />
    </DefaultToolbar>
  )
}
