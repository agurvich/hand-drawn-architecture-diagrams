import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Editor } from 'tldraw'
import { KindField, refuseKindWrite } from './KindField'
import { overlayVocabulary, KIND_PALETTE, KIND_RECORD_TYPE, type KindEntry } from '@shared/kinds'
import { CONNECTION_SHAPE_TYPE } from '@shared/shapes'

/**
 * The panel half of SPEC-019.
 *
 * `refuseKindWrite` is tested directly because it is the ONE place create and
 * edit share: the plan review found that a guard on creation alone is
 * bypassable in two steps -- create something distinct, then edit it onto
 * another kind's exact colour and dash -- so "the same function both ways" is
 * the property, and a test that exercised only the create path would not see it.
 */

const put = vi.fn()
const updateShape = vi.fn()
const markHistoryStoppingPoint = vi.fn()
let vocabulary: KindEntry[] = []
let kinds: string[] = []
let count = 1
let pageShapes: unknown[] = []

vi.mock('../../kindVocabulary', () => ({
  getVocabulary: () => new Map(vocabulary.map((e) => [e.label, e])),
}))
vi.mock('../../mergeIndex', () => ({
  getMergeIndex: () => new Map([['shape:c', { count, kinds }]]),
}))
vi.mock('tldraw', async () => {
  const actual = await vi.importActual<typeof import('tldraw')>('tldraw')
  return { ...actual, useValue: (_n: string, fn: () => unknown) => fn() }
})

const editor = {
  getShape: () => ({ id: 'shape:c', type: CONNECTION_SHAPE_TYPE, props: { kinds } }),
  getCurrentPageShapes: () => pageShapes,
  updateShape: (...a: unknown[]) => updateShape(...a),
  markHistoryStoppingPoint: () => markHistoryStoppingPoint(),
  run: (fn: () => void) => fn(),
  store: { put: (...a: unknown[]) => put(...a) },
} as unknown as Editor

beforeEach(() => {
  vi.clearAllMocks()
  vocabulary = overlayVocabulary([])
  kinds = []
  count = 1
  pageShapes = []
})

const mount = () => render(<KindField editor={editor} id={'shape:c' as never} />)

describe('refuseKindWrite — one rule for create and for edit', () => {
  const entries = overlayVocabulary([])

  it('allows a genuinely new kind', () => {
    expect(refuseKindWrite('enriches', 'violet', 'long', entries)).toBeNull()
  })

  it('refuses a name that is empty after trimming', () => {
    expect(refuseKindWrite('   ', 'violet', 'long', entries)).toMatch(/needs a name/)
  })

  it('refuses a duplicate name, ignoring case', () => {
    expect(refuseKindWrite('DATA', 'violet', 'long', entries)).toMatch(/already a kind/)
  })

  it('refuses a colour AND dash pair that already exists', () => {
    // Two kinds identical in both channels are one kind to a reader, and the
    // person who caused it cannot see that they did.
    expect(refuseKindWrite('enriches', 'orange', 'solid', entries)).toMatch(/colour and dash/)
  })

  it('allows a shared colour when the dash differs', () => {
    expect(refuseKindWrite('enriches', 'orange', 'dotted', entries)).toBeNull()
  })

  it('lets an entry keep its own name and its own pair while being edited', () => {
    /*
     * Both self-collisions, excluded BY ID. Without the id exclusion, opening
     * the edit form on `data` and pressing Save refuses the entry against
     * itself, and renaming `data` to `Data` -- capitalising a label, which is
     * what SPEC-018's `KIND_LABELS` did in code -- is impossible.
     */
    expect(refuseKindWrite('data', 'orange', 'solid', entries, 'data')).toBeNull()
    expect(refuseKindWrite('Data', 'orange', 'solid', entries, 'data')).toBeNull()
  })

  it('still refuses a rename onto ANOTHER entry', () => {
    expect(refuseKindWrite('sequence', 'violet', 'long', entries, 'data')).toMatch(/already a kind/)
  })
})

describe('the field', () => {
  it('offers a checkbox per vocabulary entry, in label order', () => {
    mount()
    expect(screen.getByTestId('kind-data')).toBeTruthy()
    expect(screen.getByTestId('kind-permission')).toBeTruthy()
    expect(screen.getByTestId('kind-sequence')).toBeTruthy()
  })

  it('offers NO control that deletes a kind', () => {
    /*
     * Deletion is out of scope, and this is what makes the exclusion
     * load-bearing rather than aspirational: it asks what happens to the
     * connections carrying the kind, and answering that wrong loses meaning
     * silently.
     */
    mount()
    const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    expect(labels.join(' ').toLowerCase()).not.toMatch(/delete|remove/)
  })

  it('shows a label the vocabulary does not list, checked and marked', () => {
    // Reachable without anybody doing anything wrong: a concurrent rename while
    // another client toggles a kind writes the stale word back.
    kinds = ['enriches']
    mount()
    const box = screen.getByTestId('kind-enriches') as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.dataset.unresolved).toBe('true')
    expect(screen.getByText(/not in this diagram/)).toBeTruthy()
  })

  it('lets an unlisted label be turned OFF, and offers no way back', () => {
    kinds = ['enriches']
    mount()
    fireEvent.click(screen.getByTestId('kind-enriches'))
    expect(updateShape).toHaveBeenCalledWith(expect.objectContaining({ props: { kinds: [] } }))
    /*
     * And the checkbox GOES rather than being offered again -- it was never a
     * kind here to re-check. Re-rendered with the connection's new kinds,
     * because `updateShape` is a mock and the module-level `kinds` is what the
     * component reads.
     *
     * An earlier version asserted that the vocabulary did not contain
     * `enriches`, which was a tautology over the array this test itself sets.
     */
    kinds = []
    cleanup()
    mount()
    expect(screen.queryByTestId('kind-enriches')).toBeNull()
  })

  it('gives the colour choice NATIVE radio semantics, not a hand-rolled group', () => {
    /*
     * The first version was eight `<button role="radio">`, which announces
     * correctly and does nothing: a custom radiogroup owes a roving `tabIndex`
     * and arrow-key handling, and without them every swatch is a separate tab
     * stop and the arrow keys are dead. Asserted on the DOM rather than left to
     * a review, because "announces correctly" is exactly what made it look fine.
     */
    mount()
    fireEvent.click(screen.getByTestId('kind-add'))
    const swatch = screen.getByTestId('kind-form-colour-violet') as HTMLInputElement
    expect(swatch.tagName).toBe('INPUT')
    expect(swatch.type).toBe('radio')
    // One group, so arrow keys move within it and only one can be chosen. This
    // does NOT assert that the group name is generated -- a hardcoded constant
    // passes, and would be fine while one form mounts at a time.
    const all = screen
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).name)
      .filter(Boolean)
    expect(new Set(all).size).toBe(1)
    expect(all).toHaveLength(Object.keys(KIND_PALETTE).length)
  })

  it('names each colour for anyone who cannot see the swatch', () => {
    mount()
    fireEvent.click(screen.getByTestId('kind-add'))
    expect(screen.getByRole('radio', { name: 'violet' })).toBeTruthy()
  })

  it('ties a refusal to the field, not only to the live region', () => {
    // `role="alert"` announces it once, when it appears. A user who tabs back
    // to the input afterwards is otherwise told nothing about why.
    mount()
    fireEvent.click(screen.getByTestId('kind-add'))
    fireEvent.change(screen.getByTestId('kind-form-label'), { target: { value: 'data' } })
    fireEvent.click(screen.getByTestId('kind-form-save'))
    const input = screen.getByTestId('kind-form-label')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(
      screen.getByTestId('kind-form-error').getAttribute('id'),
    )
  })

  it('moves focus into the form when it opens', () => {
    // Opening the form UNMOUNTS the button that had focus, so focus would land
    // on <body> and the next Tab would restart from the top of the document.
    mount()
    fireEvent.click(screen.getByTestId('kind-add'))
    expect(document.activeElement).toBe(screen.getByTestId('kind-form-label'))
  })

  it('is disabled whole on a merged line, EVERY control included', () => {
    /*
     * The fieldset alone genuinely blocks interaction -- but `disabled` on a
     * control is what an assistive technology reads off the ELEMENT, and a
     * fieldset's does not propagate to it. A keyboard user was told six
     * checkboxes and seven buttons were operable, activated one, and got
     * silence. Asserted per control, which is the only way to see it.
     */
    count = 3
    kinds = ['data', 'enriches']
    mount()
    expect((screen.getByTestId('kind-field') as HTMLFieldSetElement).disabled).toBe(true)
    const field = screen.getByTestId('kind-field')
    const controls = field.querySelectorAll('input, button, select')
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
      expect(
        (control as HTMLInputElement).disabled,
        `${control.getAttribute('data-testid') ?? control.tagName} says it is operable`,
      ).toBe(true)
    }
    expect(screen.getByTestId('kind-field-merged')).toBeTruthy()
  })

  it('opens on a colour and dash nothing else is using', () => {
    /*
     * The first version defaulted to the first palette entry and a solid line,
     * which is exactly `data` -- so pressing Create on a fresh form was refused
     * for a collision the user had not made. Found because the Enter test below
     * failed for what looked like the wrong reason.
     */
    mount()
    fireEvent.click(screen.getByTestId('kind-add'))
    fireEvent.change(screen.getByTestId('kind-form-label'), { target: { value: 'enriches' } })
    fireEvent.click(screen.getByTestId('kind-form-save'))
    expect(screen.queryByTestId('kind-form-error')).toBeNull()
    expect(put).toHaveBeenCalled()
  })

  it('submits the form on Enter', () => {
    // On an iPad the software keyboard's Return is the obvious confirm, and it
    // did nothing at all.
    mount()
    fireEvent.click(screen.getByTestId('kind-add'))
    fireEvent.change(screen.getByTestId('kind-form-label'), { target: { value: 'enriches' } })
    fireEvent.keyDown(screen.getByTestId('kind-form-label'), { key: 'Enter' })
    expect(put).toHaveBeenCalledWith([expect.objectContaining({ label: 'enriches' })])
  })

  it('refuses on Enter exactly as it refuses on Save', () => {
    // A second entry point to a guarded write is how a guard stops guarding.
    mount()
    fireEvent.click(screen.getByTestId('kind-add'))
    fireEvent.change(screen.getByTestId('kind-form-label'), { target: { value: 'data' } })
    fireEvent.keyDown(screen.getByTestId('kind-form-label'), { key: 'Enter' })
    expect(put).not.toHaveBeenCalled()
    expect(screen.getByTestId('kind-form-error')).toBeTruthy()
  })
})

describe('creating a kind', () => {
  const create = (label: string) => {
    mount()
    fireEvent.click(screen.getByTestId('kind-add'))
    fireEvent.change(screen.getByTestId('kind-form-label'), { target: { value: label } })
    fireEvent.click(screen.getByTestId('kind-form-colour-violet'))
    fireEvent.click(screen.getByTestId('kind-form-save'))
  }

  it('writes a kind record, marked as one undo step', () => {
    create('enriches')
    expect(markHistoryStoppingPoint).toHaveBeenCalled()
    expect(put).toHaveBeenCalledWith([
      expect.objectContaining({ typeName: KIND_RECORD_TYPE, label: 'enriches', colour: 'violet' }),
    ])
  })

  it('CHECKS NO BOX', () => {
    // A new kind is a word in the vocabulary, not a claim about the line that
    // happened to be selected when it was invented.
    create('enriches')
    expect(updateShape).not.toHaveBeenCalled()
  })

  it('trims the name before storing it', () => {
    create('  enriches  ')
    expect(put).toHaveBeenCalledWith([expect.objectContaining({ label: 'enriches' })])
  })

  it('generates the id rather than deriving it from the label', () => {
    /*
     * A derived id would make creating a kind called `data`, after the seed
     * `data` had been renamed, land back on the seed's own record -- silently
     * renaming it back and losing its colour.
     */
    create('data-ish')
    const record = put.mock.calls[0]![0]![0] as { id: string }
    expect(record.id).not.toContain('data-ish')
  })

  it('refuses a duplicate and writes nothing', () => {
    create('data')
    expect(put).not.toHaveBeenCalled()
    expect(screen.getByTestId('kind-form-error').textContent).toMatch(/already a kind/)
  })

  it('survives a name of `__proto__`', () => {
    // The prototype-pollution hazard moved from `KIND_BY_COLOUR` to labels,
    // which the user now types.
    create('__proto__')
    expect(put).toHaveBeenCalledWith([expect.objectContaining({ label: '__proto__' })])
  })
})

describe('renaming a kind', () => {
  const rename = (from: string, to: string) => {
    mount()
    fireEvent.click(screen.getByTestId(`kind-edit-${from}`))
    fireEvent.change(screen.getByTestId('kind-form-label'), { target: { value: to } })
    fireEvent.click(screen.getByTestId('kind-form-save'))
  }

  it('writes a record at the SEED’s id, so the vocabulary stays three', () => {
    rename('data', 'flows')
    const record = put.mock.calls[0]![0]![0] as { id: string; label: string }
    expect(record.id).toBe(`${KIND_RECORD_TYPE}:data`)
    expect(record.label).toBe('flows')
  })

  it('rewrites every connection carrying the old label, leaving the others alone', () => {
    pageShapes = [
      { id: 'shape:1', type: CONNECTION_SHAPE_TYPE, props: { kinds: ['data', 'sequence'] } },
      { id: 'shape:2', type: CONNECTION_SHAPE_TYPE, props: { kinds: ['permission'] } },
      { id: 'shape:3', type: 'diagramNode', props: {} },
    ]
    rename('data', 'flows')
    expect(updateShape).toHaveBeenCalledTimes(1)
    // Normal form preserved, and `sequence` carried through untouched.
    expect(updateShape).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'shape:1', props: { kinds: ['flows', 'sequence'] } }),
    )
  })

  it('marks history ONCE for the record and every connection together', () => {
    pageShapes = [
      { id: 'shape:1', type: CONNECTION_SHAPE_TYPE, props: { kinds: ['data'] } },
      { id: 'shape:2', type: CONNECTION_SHAPE_TYPE, props: { kinds: ['data'] } },
    ]
    rename('data', 'flows')
    // Two connections and one record, one undo. A mark per write would unwind
    // the rename one line at a time.
    expect(markHistoryStoppingPoint).toHaveBeenCalledTimes(1)
    expect(updateShape).toHaveBeenCalledTimes(2)
  })

  it('writes a CREATED kind’s record at a prefixed id too', () => {
    /*
     * THE HALF OF THE ID SPACE EVERY OTHER TEST HERE MISSED.
     *
     * Every rename and recolour case in this file and in the e2e spec edits a
     * SEED. `KindEntry.id` is the bare id -- the overlay strips the prefix --
     * so a created kind's entry id is `k…` and a seed's is `data`, and a
     * version of `save` that branched on the shape of the id put the created
     * kind's record at an UNPREFIXED id, which `idValidator` refuses. Every
     * test passed, because none of them ever opened the edit form on a kind
     * the user had made. The tests were not vacuous; they were unpopulated.
     */
    vocabulary = [...vocabulary, { id: 'kabc', label: 'enriches', colour: 'violet', dash: '12 5' }]
    render(<KindField editor={editor} id={'shape:c' as never} />)
    fireEvent.click(screen.getByTestId('kind-edit-enriches'))
    fireEvent.change(screen.getByTestId('kind-form-label'), { target: { value: 'derives' } })
    fireEvent.click(screen.getByTestId('kind-form-save'))
    const record = put.mock.calls[0]![0]![0] as { id: string; label: string }
    expect(record.id).toBe(`${KIND_RECORD_TYPE}:kabc`)
    expect(record.label).toBe('derives')
  })

  it('rewrites connections carrying a CREATED kind’s label', () => {
    vocabulary = [...vocabulary, { id: 'kabc', label: 'enriches', colour: 'violet', dash: '12 5' }]
    pageShapes = [{ id: 'shape:1', type: CONNECTION_SHAPE_TYPE, props: { kinds: ['enriches'] } }]
    render(<KindField editor={editor} id={'shape:c' as never} />)
    fireEvent.click(screen.getByTestId('kind-edit-enriches'))
    fireEvent.change(screen.getByTestId('kind-form-label'), { target: { value: 'derives' } })
    fireEvent.click(screen.getByTestId('kind-form-save'))
    expect(updateShape).toHaveBeenCalledWith(
      expect.objectContaining({ props: { kinds: ['derives'] } }),
    )
  })

  it('refuses a rename onto another kind and rewrites NOTHING', () => {
    pageShapes = [
      { id: 'shape:1', type: CONNECTION_SHAPE_TYPE, props: { kinds: ['data', 'sequence'] } },
    ]
    rename('data', 'sequence')
    // The connection carrying BOTH is the case that would collapse two labels
    // into one and lose a strand.
    expect(put).not.toHaveBeenCalled()
    expect(updateShape).not.toHaveBeenCalled()
  })

  it('allows a case-only rename, and rewrites the connections', () => {
    pageShapes = [{ id: 'shape:1', type: CONNECTION_SHAPE_TYPE, props: { kinds: ['data'] } }]
    rename('data', 'Data')
    expect(put).toHaveBeenCalled()
    expect(updateShape).toHaveBeenCalledWith(
      expect.objectContaining({ props: { kinds: ['Data'] } }),
    )
  })

  it('recolours WITHOUT touching any connection record', () => {
    pageShapes = [{ id: 'shape:1', type: CONNECTION_SHAPE_TYPE, props: { kinds: ['data'] } }]
    mount()
    fireEvent.click(screen.getByTestId('kind-edit-data'))
    fireEvent.click(screen.getByTestId('kind-form-colour-teal'))
    fireEvent.click(screen.getByTestId('kind-form-save'))
    expect(put).toHaveBeenCalledWith([expect.objectContaining({ colour: 'teal', label: 'data' })])
    // The label did not change, so no connection says anything different.
    expect(updateShape).not.toHaveBeenCalled()
  })
})
