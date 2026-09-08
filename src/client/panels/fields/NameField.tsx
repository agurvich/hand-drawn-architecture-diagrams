import { useRef } from 'react'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { NODE_SHAPE_TYPE } from '@shared/shapes'

/**
 * Renaming a node, from the panel rather than by knowing to double-click it.
 *
 * CONTROLLED, writing straight through to the shape: there is no local buffer,
 * so the canvas updates as you type, the change syncs, and selecting another
 * node has nothing uncommitted to carry across.
 *
 * The history mark is taken on the FIRST KEYSTROKE of a session, not on focus.
 * Marking on focus leaves an empty stopping point behind whenever someone
 * focuses the field and leaves without typing, and the user's next undo is then
 * a press that does nothing.
 *
 * @example
 * <NameField editor={editor} id={nodeId} />
 */
export function NameField({ editor, id }: { editor: Editor; id: TLShapeId }) {
  const marked = useRef(false)

  const label = useValue(
    'node label',
    () => {
      const shape = editor.getShape(id)
      return shape ? ((shape.props as { label?: string }).label ?? '') : ''
    },
    [editor, id],
  )

  return (
    <label className="selection-field">
      <span className="selection-field__label">Name</span>
      <input
        className="selection-field__input"
        data-testid="selection-name"
        type="text"
        value={label}
        onBlur={() => (marked.current = false)}
        onChange={(event) => {
          if (!marked.current) {
            editor.markHistoryStoppingPoint()
            marked.current = true
          }
          editor.updateShape({
            id,
            type: NODE_SHAPE_TYPE,
            props: { label: event.currentTarget.value },
          })
        }}
      />
    </label>
  )
}
