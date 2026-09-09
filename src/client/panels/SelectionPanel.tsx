import { useEffect, useRef, useState } from 'react'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { CONNECTION_SHAPE_TYPE } from '@shared/shapes'
import { selectionSubject, type SelectionSubject } from './selectionSubject'
import { observeDockTop } from './dockTop'
import { NameField } from './fields/NameField'
import { IconField } from './fields/IconField'
import { NodeStatus } from './fields/NodeStatus'
import { ActorField } from './fields/ActorField'
import { KindField } from './fields/KindField'

interface SelectionPanelProps {
  /** The mounted editor, or null before `onMount` has run. */
  editor: Editor | null
  /** True while `DiagramIOPanel` is expanded; the dock stands down. */
  ioOpen: boolean
}

function labelOf(editor: Editor, id: TLShapeId | null): string | null {
  if (!id) return null
  const shape = editor.getShape(id)
  if (!shape) return null
  return ((shape.props as { label?: string }).label ?? '').trim() || 'Untitled'
}

/**
 * The properties of whatever is selected, docked to the right of the canvas.
 *
 * DOCKED, NOT ANCHORED, and that is a decision with a history: an anchored panel
 * failed three independent reviews in three different ways, the last of which
 * built a conforming implementation that still covered the selected shape in
 * 75% of positions. The decisive reason is structural rather than a tuning
 * problem -- a connection's bounds spans both endpoints' CENTRES, so for a
 * diagonal edge it is a large, nearly empty box that "beside the shape" means
 * nothing relative to, and connections are half this panel's subjects. See
 * `docs/specs/SPEC-016-*.md` -> Out of Scope.
 *
 * @example
 * <SelectionPanel editor={editor} ioOpen={ioOpen} />
 */
export function SelectionPanel({ editor, ioOpen }: SelectionPanelProps) {
  /*
   * A CALLBACK REF, not `useRef`, and both effects below depend on it.
   *
   * Assigning `ref.current` schedules no render, so `panel.current` read during
   * render is `null` on the very render that mounts the div -- and this panel
   * renders `null` on its first commit anyway, because `Room` sets `editor` in
   * `onMount`. An effect keyed on `[panel.current]` therefore sees `null`, early
   * returns, and never re-runs: the observer attaches only if some unrelated
   * re-render happens to come along, and the focus cleanup never registers at
   * all. State makes the div's arrival and departure a render, which is what
   * both effects actually need.
   */
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null)
  const hadFocus = useRef(false)

  /*
   * ONE reactive scope for BOTH conditions.
   *
   * `getEditingShapeId()` changing does not change the selection, so a
   * subject-only computed with the edit check in the render body subscribes to
   * nothing: double-clicking a node to rename it would leave this panel mounted
   * beside the open textarea, with two live rename surfaces for one prop.
   */
  const state = useValue(
    'selection panel subject',
    () => {
      if (!editor) return null
      const subject = selectionSubject(editor)
      if (!subject) return null
      if (editor.getEditingShapeId() === subject.id) return null
      return { subject, header: headerFor(editor, subject) }
    },
    [editor],
  )

  useEffect(() => {
    if (!panelEl) return
    return observeDockTop(panelEl)
  }, [panelEl])

  /*
   * FOCUS HANDOFF, tracked by listener rather than captured in the effect body,
   * and keyed on the ELEMENT so cleanup runs when the div goes -- not when this
   * component unmounts, which only happens when the room tears down.
   *
   * Effect bodies run on commit and a focus move causes no render, so a value
   * read there is stale by the time cleanup runs: click the name field, tap the
   * canvas to deselect, and the panel unmounts having recorded `false`. By
   * cleanup time `document.activeElement` is already <body>, so it cannot be
   * asked either. A focusin/focusout pair is the only thing that knows.
   */
  useEffect(() => {
    const el = panelEl
    if (!el) return
    const onIn = () => (hadFocus.current = true)
    const onOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null
      /*
       * A NULL relatedTarget means focus went NOWHERE -- the focused control was
       * removed, or the browser dropped it to <body>. That is precisely the case
       * this handoff exists to recover, so it must not clear the flag. Clearing
       * on it made the whole mechanism dead: unmounting fires focusout with a
       * null relatedTarget before cleanup runs, so the flag was always false by
       * the time anyone looked.
       */
      if (next && !el.contains(next)) hadFocus.current = false
    }
    el.addEventListener('focusin', onIn)
    el.addEventListener('focusout', onOut)
    return () => {
      el.removeEventListener('focusin', onIn)
      el.removeEventListener('focusout', onOut)
      if (hadFocus.current) {
        hadFocus.current = false
        const canvas = document.querySelector<HTMLElement>('.tl-container')
        canvas?.focus()
      }
    }
  }, [panelEl])

  if (!editor || !state || ioOpen) return null

  return (
    <div ref={setPanelEl} className="selection-panel" data-testid="selection-panel">
      <h2 className="selection-panel__heading" data-testid="selection-heading">
        {state.header.title}
      </h2>
      {state.header.note !== null && (
        <p className="selection-panel__note" data-testid="selection-heading-note">
          {state.header.note}
        </p>
      )}
      {state.subject.kind === 'node' && (
        <>
          <NameField editor={editor} id={state.subject.id} />
          <IconField editor={editor} id={state.subject.id} />
          <NodeStatus editor={editor} id={state.subject.id} />
        </>
      )}
      {state.subject.kind === 'connection' && (
        <>
          <ActorField editor={editor} id={state.subject.id} />
          <KindField editor={editor} id={state.subject.id} />
        </>
      )}
    </div>
  )
}

/**
 * What the panel says it is acting on.
 *
 * The endpoints are read the way the CANVAS resolves them -- through
 * `nodeIdFor`, which returns the container a folded endpoint is drawn as -- and
 * not off the raw binding, which names the hidden child. That is the rule
 * `ActorControl` already follows for a reading, and taking the other one would
 * put the panel and the canvas in disagreement about one line, one row above
 * the control written to prevent exactly that.
 */
function headerFor(
  editor: Editor,
  subject: SelectionSubject,
): { title: string; note: string | null } {
  if (subject.kind === 'node') {
    return { title: labelOf(editor, subject.id) ?? 'Untitled', note: null }
  }
  const shape = editor.getShape(subject.id)
  if (!shape || shape.type !== CONNECTION_SHAPE_TYPE) return { title: 'Connection', note: null }
  const util = editor.getShapeUtil(CONNECTION_SHAPE_TYPE) as unknown as {
    nodeIdFor: (s: typeof shape, t: 'start' | 'end') => TLShapeId | null
    mergeCount: (s: typeof shape) => number
  }
  const start = labelOf(editor, util.nodeIdFor(shape, 'start'))
  const end = labelOf(editor, util.nodeIdFor(shape, 'end'))
  const count = util.mergeCount(shape)

  // A HALF-BOUND connection is a real state -- `addHalfConnection` exists to
  // make it -- so it gets a sentence rather than the word "undefined".
  const title =
    start === null && end === null
      ? 'Connection'
      : start === null
        ? `→ ${end}`
        : end === null
          ? `${start} →`
          : `${start} → ${end}`
  const unattached = start === null || end === null ? 'One end is not attached to anything.' : null
  const merged = count > 1 ? `This line stands for ${count} connections.` : null
  return {
    title,
    note: [unattached, merged].filter(Boolean).join(' ') || null,
  }
}
