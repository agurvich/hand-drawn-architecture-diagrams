import { useState } from 'react'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { CONNECTION_SHAPE_TYPE, normaliseKinds } from '@shared/shapes'
import {
  KIND_DASHES,
  KIND_PALETTE,
  KIND_RECORD_TYPE,
  labelCollision,
  newKindId,
  pairCollision,
  kindRecordId,
  type DiagramKind,
  type KindEntry,
} from '@shared/kinds'
import { getMergeIndex } from '../../mergeIndex'
import { getVocabulary } from '../../kindVocabulary'

interface KindFieldProps {
  /** The mounted editor. */
  editor: Editor
  /** The connection this field acts on, resolved by `SelectionPanel`. */
  id: TLShapeId
}

/** What a write to the vocabulary is refused for, or null if it is allowed. */
export function refuseKindWrite(
  label: string,
  colour: string,
  dash: string,
  entries: readonly KindEntry[],
  exceptId?: string,
): string | null {
  /*
   * ONE function for create and for edit, which is not tidiness.
   *
   * SPEC-019's plan review found that a guard on creation alone is bypassable
   * in two steps -- create a kind that is distinct, then edit it onto another
   * one's exact colour and dash. Two kinds identical in both channels are one
   * kind to a reader, and the person who caused it cannot see that they did.
   */
  const trimmed = label.trim()
  if (trimmed.length === 0) return 'A kind needs a name.'
  const clash = labelCollision(trimmed, entries, exceptId)
  if (clash) return `There is already a kind called “${clash.label}”.`
  const pair = pairCollision(colour, dash, entries, exceptId)
  if (pair) {
    return `“${pair.label}” already uses that colour and dash — pick one or the other.`
  }
  return null
}

/** The dash key an entry's resolved dash came from, for editing it back. */
function dashKeyOf(entry: KindEntry): string {
  return Object.keys(KIND_DASHES).find((key) => KIND_DASHES[key] === entry.dash) ?? 'solid'
}

/**
 * What a line MEANS — the kinds it carries, from a vocabulary this diagram owns.
 *
 * CHECKBOXES, not a `<select>`, because a connection carries a SET: the project
 * owner declined to draw a third layer of edges and described one edge that is a
 * data transfer AND a step in a sequence. A single-choice control would make the
 * model a lie at the first line that is both.
 *
 * The vocabulary is EDITABLE HERE rather than in a settings screen, because a
 * word is invented at the moment somebody needs it — while drawing the line that
 * needs it. SPEC-018 shipped three kinds read off one drawing; the next design
 * needed four different ones.
 *
 * READ-ONLY ON A MERGED LINE, for the reason `getHandles` withdraws the drag
 * handles: the line stands for several connections, so a toggle could only write
 * to the representative and would leave every other member as it was — a silent
 * partial edit with nothing on screen saying only one of several changed.
 * `ActorField` refuses on the same grounds.
 *
 * NO CONTROL DELETES A KIND. Deletion asks what happens to the connections
 * carrying it, and answering it wrong loses meaning silently; SPEC-019 puts it
 * out of scope, and the absence is asserted rather than merely intended.
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
   * BOTH READINGS COME FROM THE MERGE INDEX, in ONE scope, as `ActorField` does.
   *
   * The panel and the canvas must not say different sentences about one line. A
   * merged line is drawn by its representative and the representative is the
   * only member you can hit-test, so reading the raw props here would offer an
   * editable control for a line the canvas is drawing as several -- and would
   * show that one member's kinds where the canvas shows every member's.
   */
  const entry = useValue(
    'kind field merge entry',
    () => {
      const found = selected ? getMergeIndex(editor).get(selected) : undefined
      return { count: found?.count ?? 1, kinds: found?.kinds ?? [] }
    },
    [editor, selected],
  )

  const vocabulary = useValue('kind field vocabulary', () => [...getVocabulary(editor).values()], [
    editor,
  ])

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  if (!selected) return null
  const merged = entry.count > 1
  const has = new Set(entry.kinds)
  const listed = new Set(vocabulary.map((e) => e.label))
  /*
   * A label this line carries that the vocabulary does not list.
   *
   * Reachable without anybody doing anything wrong: `toggle` writes back the
   * whole array it read, so a client toggling a kind while another renames one
   * writes the stale word back. FR-005 shows it so it can be turned off; the
   * canvas draws it unresolved so it is not silently invisible.
   */
  const unlisted = entry.kinds.filter((label) => !listed.has(label))

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
    // form and no consumer has to sort defensively.
    editor.updateShape({
      id: selected,
      type: CONNECTION_SHAPE_TYPE,
      props: { kinds: normaliseKinds(next) },
    })
  }

  const create = (label: string, colour: string, dash: string) => {
    /*
     * A GENERATED id, never one derived from the label. A derived id would make
     * creating a kind called `data`, after the seed `data` had been renamed to
     * `flows`, land back on the seed's record -- silently renaming `flows` back
     * and losing its colour.
     */
    const record: DiagramKind = {
      typeName: KIND_RECORD_TYPE,
      id: newKindId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
      label: label.trim(),
      colour,
      dash,
    }
    editor.markHistoryStoppingPoint()
    editor.store.put([record])
    // NOTHING IS CHECKED. A new kind is a word in the vocabulary, not a claim
    // about the line that happened to be selected when it was invented.
    setAdding(false)
  }

  const save = (target: KindEntry, label: string, colour: string, dash: string) => {
    const trimmed = label.trim()
    const renaming = trimmed !== target.label
    /*
     * ONE UNDO STEP covering the record AND every connection rewritten.
     *
     * The undo comes from `markHistoryStoppingPoint`, not from `run` -- `run`
     * batches a transaction and does not touch history unless asked -- so
     * nothing may mark between the mark here and the end of this call. That
     * rules out routing the rewrite through `toggle`, which marks per write.
     * `documentIO.ts` states the same trap for the same reason.
     */
    editor.markHistoryStoppingPoint()
    editor.run(() => {
      editor.store.put([
        {
          typeName: KIND_RECORD_TYPE,
          // A record at the SEED's id, so renaming a seed replaces it rather
          // than adding a fourth entry beside it.
          id: target.id.startsWith('k')
            ? (target.id as DiagramKind['id'])
            : kindRecordId(target.id),
          label: trimmed,
          colour,
          dash,
        } as DiagramKind,
      ])
      if (!renaming) return
      /*
       * PAGE-SCOPED, matching every other reader in this repo (`mergeIndex.ts`,
       * `documentIO.ts` both use `getCurrentPageShapes`). The app is
       * single-page today, so a rename crossing pages is latent, not live.
       */
      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type !== CONNECTION_SHAPE_TYPE) continue
        const kinds = (shape.props as { kinds: string[] }).kinds
        if (!kinds.includes(target.label)) continue
        editor.updateShape({
          id: shape.id,
          type: CONNECTION_SHAPE_TYPE,
          // The OTHER labels on this connection are carried through untouched,
          // and the result goes back through the normal form.
          props: { kinds: normaliseKinds(kinds.map((k) => (k === target.label ? trimmed : k))) },
        })
      }
    })
    setEditingId(null)
  }

  return (
    <fieldset className="kind-field" data-testid="kind-field" disabled={merged}>
      {/* A `<fieldset>` with a `<legend>` rather than a label: this is a GROUP
          of controls with one question over them, and a screen reader announces
          the legend with each checkbox inside it. `disabled` on the fieldset
          disables every control in it, which is one place to be right rather
          than three -- and it is what makes the add and edit controls
          unreachable on a merged line without a second condition. */}
      <legend className="kind-field__legend">Carries</legend>
      {vocabulary.map((kind) =>
        editingId === kind.id ? (
          <KindForm
            key={kind.id}
            entries={vocabulary}
            initial={kind}
            onCancel={() => setEditingId(null)}
            onSubmit={(label, colour, dash) => save(kind, label, colour, dash)}
          />
        ) : (
          <div key={kind.id} className="kind-field__row">
            <label className="kind-field__option">
              <input
                type="checkbox"
                className="kind-field__checkbox"
                data-testid={`kind-${kind.label}`}
                checked={has.has(kind.label)}
                onChange={(event) => toggle(kind.label, event.target.checked)}
              />
              <span
                className="kind-field__swatch"
                style={{ background: KIND_PALETTE[kind.colour]?.hex }}
                aria-hidden="true"
              />
              <span>{kind.label}</span>
            </label>
            <button
              type="button"
              className="kind-field__edit"
              data-testid={`kind-edit-${kind.label}`}
              aria-label={`Edit ${kind.label}`}
              onClick={() => setEditingId(kind.id)}
            >
              Edit
            </button>
          </div>
        ),
      )}
      {unlisted.map((label) => (
        <label key={label} className="kind-field__option kind-field__option--unresolved">
          {/* Checked, and marked. It is a word this line carries that this
              room's vocabulary does not define -- unchecking is the only thing
              offered, because it was never a kind here to re-check. */}
          <input
            type="checkbox"
            className="kind-field__checkbox"
            data-testid={`kind-${label}`}
            data-unresolved="true"
            checked
            onChange={() => toggle(label, false)}
          />
          <span>
            {label} <span className="kind-field__unresolved-note">(not in this diagram)</span>
          </span>
        </label>
      ))}
      {adding ? (
        <KindForm
          entries={vocabulary}
          onCancel={() => setAdding(false)}
          onSubmit={(label, colour, dash) => create(label, colour, dash)}
        />
      ) : (
        <button
          type="button"
          className="kind-field__add"
          data-testid="kind-add"
          onClick={() => setAdding(true)}
        >
          + New kind
        </button>
      )}
      {merged && (
        // WHY it cannot be edited, not just that it cannot. The panel heading
        // already says the line stands for several connections; this says what
        // follows from that, which is the different sentence.
        <p className="kind-field__note" data-testid="kind-field-merged">
          This line stands for {entry.count} connections, so it shows every kind they carry. Expand
          the container to change one.
        </p>
      )}
    </fieldset>
  )
}

interface KindFormProps {
  entries: readonly KindEntry[]
  initial?: KindEntry
  onCancel: () => void
  onSubmit: (label: string, colour: string, dash: string) => void
}

/**
 * Naming a kind, or renaming one. The same form both ways, so the collision
 * rules cannot differ between them.
 */
function KindForm({ entries, initial, onCancel, onSubmit }: KindFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [colour, setColour] = useState(initial?.colour ?? Object.keys(KIND_PALETTE)[0]!)
  const [dash, setDash] = useState(initial ? dashKeyOf(initial) : 'solid')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const refusal = refuseKindWrite(label, colour, dash, entries, initial?.id)
    if (refusal) {
      setError(refusal)
      return
    }
    onSubmit(label, colour, dash)
  }

  return (
    <div className="kind-form" data-testid="kind-form">
      <label className="kind-form__label">
        <span>Name</span>
        <input
          type="text"
          className="kind-form__input"
          data-testid="kind-form-label"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value)
            setError(null)
          }}
        />
      </label>
      <div className="kind-form__swatches" role="radiogroup" aria-label="Colour">
        {Object.entries(KIND_PALETTE).map(([name, { hex }]) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={colour === name}
            aria-label={name}
            data-testid={`kind-form-colour-${name}`}
            className="kind-form__swatch"
            style={{ background: hex }}
            onClick={() => {
              setColour(name)
              setError(null)
            }}
          />
        ))}
      </div>
      <label className="kind-form__label">
        <span>Line</span>
        <select
          className="kind-form__select"
          data-testid="kind-form-dash"
          value={dash}
          onChange={(event) => {
            setDash(event.target.value)
            setError(null)
          }}
        >
          {Object.keys(KIND_DASHES).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="kind-form__error" data-testid="kind-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="kind-form__actions">
        <button type="button" data-testid="kind-form-save" onClick={submit}>
          {initial ? 'Save' : 'Create'}
        </button>
        <button type="button" data-testid="kind-form-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
