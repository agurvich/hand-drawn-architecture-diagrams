import { useEffect, useRef } from 'react'
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

  /*
   * A NEW SUBJECT ENDS THE SESSION, even without a blur.
   *
   * `marked` is otherwise cleared only on blur, and the selection can move to
   * another node while this input still holds focus -- the field silently
   * rebinds and the next keystroke reuses the PREVIOUS node's history mark, so
   * one undo reverts both renames. Reachability is narrow (every pointer path
   * blurs the input) but the cost of being wrong is a lost edit on a shape the
   * user was not looking at.
   */
  useEffect(() => {
    marked.current = false
  }, [id])

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
