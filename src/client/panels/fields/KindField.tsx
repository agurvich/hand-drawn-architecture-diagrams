import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { CONNECTION_SHAPE_TYPE, EDGE_KINDS, normaliseKinds } from '@shared/shapes'
import { getMergeIndex } from '../../mergeIndex'

interface KindFieldProps {
  /** The mounted editor. */
  editor: Editor
  /** The connection this field acts on, resolved by `SelectionPanel`. */
  id: TLShapeId
}

/** What each kind is called, and what it means, in the panel. */
const KIND_LABELS: Record<(typeof EDGE_KINDS)[number], string> = {
  data: 'Data',
  permission: 'Permission',
  sequence: 'Sequence',
}

/**
 * What a line MEANS — the kinds it carries.
 *
 * CHECKBOXES, not a `<select>`, because a connection carries a SET: he declined
 * to draw a third layer of edges and described one edge that is a data transfer
 * AND a step in a sequence. A single-choice control would make the model a lie
 * at the first line that is both.
 *
 * READ-ONLY ON A MERGED LINE, for the reason `getHandles` withdraws the drag
 * handles: the line stands for several connections, so a toggle could only
 * write to the representative and would leave every other member as it was — a
 * silent partial edit with nothing on screen saying only one of several changed.
 * `ActorField` refuses on the same grounds.
 *
 * @example
 * <KindField editor={editor} id={connectionId} />
 */
export function KindField({ editor, id }: KindFieldProps) {
  const selected = useValue(
    'kind field connection',
    () => {
      const shape = editor.getShape(id)
      return shape?.type === CONNECTION_SHAPE_TYPE ? shape.id : null
    },
    [editor, id],
  )

  /*
   * THE COUNT COMES FROM THE MERGE INDEX, as it does in `ActorField`.
   *
   * The panel and the canvas must not say different sentences about one line. A
   * merged line is drawn by its representative and the representative is the
   * only member you can hit-test, so reading the raw props here would offer an
   * editable control for a line the canvas is drawing as several.
   */
  const count = useValue(
    'merge count',
    () => (selected ? (getMergeIndex(editor).get(selected)?.count ?? 1) : 1),
    [editor, selected],
  )

  /*
   * THE VALUES come from the merge index too — which for an unmerged line is
   * that connection's own kinds, and for a merged one is every kind its members
   * name. The checkboxes then show what the LINE says, which is what the reader
   * is looking at. They are disabled in the merged case, so showing the union
   * cannot be mistaken for an editable set.
   */
  const kinds = useValue(
    'kinds',
    () => (selected ? (getMergeIndex(editor).get(selected)?.kinds ?? []) : []),
    [editor, selected],
  )

  if (!selected) return null
  const merged = count > 1
  const has = new Set(kinds)

  const toggle = (kind: string, on: boolean) => {
    const shape = editor.getShape(selected)
    if (!shape || shape.type !== CONNECTION_SHAPE_TYPE) return
    const current = (shape.props as { kinds: string[] }).kinds
    const next = on ? [...current, kind] : current.filter((k) => k !== kind)
    // ONE UNDO STEP per toggle: the mark goes before the write, so an undo
    // restores the previous set rather than unwinding into whatever the user
    // did before this.
    editor.markHistoryStoppingPoint()
    // Written through `normaliseKinds`, so the store only ever holds the normal
    // form and no consumer has to sort defensively. Toggling one kind cannot
    // disturb another: the others are carried through untouched.
    editor.updateShape({
      id: selected,
      type: CONNECTION_SHAPE_TYPE,
      props: { kinds: normaliseKinds(next) },
    })
  }

  return (
    <fieldset className="kind-field" data-testid="kind-field" disabled={merged}>
      {/* A `<fieldset>` with a `<legend>` rather than a label: this is a GROUP
          of controls with one question over them, and a screen reader announces
          the legend with each checkbox inside it. `disabled` on the fieldset
          disables every control in it, which is one place to be right rather
          than three. */}
      <legend className="kind-field__legend">Carries</legend>
      {EDGE_KINDS.map((kind) => (
        <label key={kind} className="kind-field__option">
          <input
            type="checkbox"
            className="kind-field__checkbox"
            data-testid={`kind-${kind}`}
            checked={has.has(kind)}
            onChange={(event) => toggle(kind, event.target.checked)}
          />
          <span>{KIND_LABELS[kind]}</span>
        </label>
      ))}
      {merged && (
        // WHY it cannot be edited, not just that it cannot. The panel heading
        // already says the line stands for several connections; this says what
        // follows from that, which is the different sentence.
        <p className="kind-field__note" data-testid="kind-field-merged">
          This line stands for {count} connections, so it shows every kind they carry. Expand the
          container to change one.
        </p>
      )}
    </fieldset>
  )
}
