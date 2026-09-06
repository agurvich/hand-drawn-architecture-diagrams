import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { CONNECTION_SHAPE_TYPE, NODE_SHAPE_TYPE } from '@shared/shapes'
import { actorIdOf, attributeTo, clearActor } from '../actors'

interface ActorControlProps {
  /** The mounted editor, or null before `onMount` has run. */
  editor: Editor | null
}

/**
 * "Performed by" — attributing the selected connection to a node.
 *
 * ON THE CONNECTION, because the connection is the thing being described. It
 * appears only while exactly one connection is selected: an attribution control
 * with nothing to attribute is a permanent panel for an occasional act.
 *
 * A `<select>` rather than a click-the-node gesture. Picking a node by pointing
 * at it is the nicer gesture and it is also the one already spoken for -- that
 * is how you draw a connection -- so a second meaning for the same motion would
 * have to be moded, and a mode you can forget you are in is how an annotation
 * gets eaten. The list is also the only version that works from a keyboard.
 *
 * @example
 * <ActorControl editor={editor} />
 */
export function ActorControl({ editor }: ActorControlProps) {
  const selected = useValue(
    'selected connection',
    () => {
      if (!editor) return null
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return null
      const shape = editor.getShape(ids[0]!)
      return shape?.type === CONNECTION_SHAPE_TYPE ? shape.id : null
    },
    [editor],
  )

  const nodes = useValue(
    'nodes',
    () => {
      if (!editor) return []
      return (
        editor
          .getCurrentPageShapes()
          .filter((shape) => shape.type === NODE_SHAPE_TYPE)
          .map((shape) => ({
            id: shape.id as string,
            label: ((shape.props as { label?: string }).label ?? '').trim() || 'Untitled',
          }))
          .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1))
          // TWO NODES CAN SHARE A NAME, and two identical options are two options
          // a keyboard or voice-control user cannot choose between. Disambiguated
          // only where it is needed, so the common case reads as the plain name.
          .map((node, i, all) => {
            const duplicate = all.some((other, j) => j !== i && other.label === node.label)
            return duplicate ? { ...node, label: `${node.label} (${node.id.slice(-4)})` } : node
          })
      )
    },
    [editor],
  )

  const actorId = useValue(
    'actor',
    () => (editor && selected ? actorIdOf(editor, selected) : null),
    [editor, selected],
  )

  if (!editor || !selected) return null

  return (
    <div className="actor-control" data-testid="actor-control">
      <label className="actor-control__label" htmlFor="actor-control-select">
        Performed by
      </label>
      <select
        id="actor-control-select"
        className="actor-control__select"
        data-testid="actor-select"
        value={actorId ?? ''}
        onChange={(event) => {
          const value = event.target.value
          if (value === '') clearActor(editor, selected)
          else attributeTo(editor, selected, value as TLShapeId)
        }}
      >
        <option value="">Nobody in particular</option>
        {nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.label}
          </option>
        ))}
      </select>
    </div>
  )
}
