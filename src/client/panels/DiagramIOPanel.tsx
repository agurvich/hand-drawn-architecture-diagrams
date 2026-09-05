import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { parseDocument, type DiagramDocument } from '@shared/shapes'
import { exportDocument, importDocument, undocumentableShapeCount } from '../documentIO'

interface DiagramIOPanelProps {
  /** The mounted editor, or null before `onMount` has run. */
  editor: Editor | null
}

/**
 * Copy the diagram out as JSON, or paste one in.
 *
 * The text box is the primary surface and the clipboard is an enhancement on
 * top of it, not the reverse: `navigator.clipboard` needs a secure context, and
 * the iPad reaches this app over plain http on a LAN address, where it does not
 * exist. Selecting the text by hand is the only path that always works, so it is
 * the one the panel is built around.
 *
 * @example
 * <DiagramIOPanel editor={editor} />
 */
export function DiagramIOPanel({ editor }: DiagramIOPanelProps) {
  const [open, setOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<DiagramDocument | null>(null)
  const importButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const headingId = useId()
  const pasteId = useId()
  const exportId = useId()

  // Derived, not stored: useValue re-runs when the store changes, so the JSON
  // shown is always the current diagram without an effect keeping it in step.
  const exported = useValue(
    'exported document',
    () => (editor ? JSON.stringify(exportDocument(editor), null, 2) : ''),
    [editor],
  )
  const undocumentable = useValue(
    'undocumentable shapes',
    () => (editor ? undocumentableShapeCount(editor) : 0),
    [editor],
  )

  const close = useCallback(() => {
    setOpen(false)
    setPending(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (pending) setPending(null)
      else close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, pending, close])

  // Focus moves into the dialog when it appears and returns to its trigger when
  // it goes, so a keyboard user is never left focused on a hidden control.
  useEffect(() => {
    if (pending) confirmButton.current?.focus()
    else importButton.current?.focus()
  }, [pending])

  const runImport = (document: DiagramDocument) => {
    if (!editor) return
    importDocument(editor, document)
    setPending(null)
    setPasted('')
    setError(null)
    setNotice(null)
    // Closes on success: the whole point of pasting is to look at the diagram,
    // and the panel covers it.
    setOpen(false)
  }

  const onImportClick = () => {
    setNotice(null)
    const result = parseDocument(pasted)
    if (!result.ok) {
      // The pasted text is kept so it can be corrected rather than retyped.
      setError(result.error)
      return
    }
    setError(null)
    if (undocumentable > 0) setPending(result.document)
    else runImport(result.document)
  }

  const onCopyClick = async () => {
    setNotice(null)
    if (typeof navigator.clipboard?.writeText !== 'function') {
      setNotice(
        'This browser will not give the page clipboard access — select the text and copy it.',
      )
      return
    }
    try {
      await navigator.clipboard.writeText(exported)
      setNotice('Copied.')
    } catch {
      setNotice('The clipboard refused — select the text and copy it.')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="diagram-io__launch"
        data-testid="diagram-io-open"
        onClick={() => setOpen(true)}
      >
        JSON
      </button>
    )
  }

  return (
    <div className="diagram-io" role="region" aria-labelledby={headingId} data-testid="diagram-io">
      <div className="diagram-io__header">
        <h2 id={headingId} className="diagram-io__heading">
          Diagram JSON
        </h2>
        <button
          type="button"
          className="diagram-io__button"
          data-testid="diagram-io-close"
          onClick={close}
        >
          Close
        </button>
      </div>

      <label className="diagram-io__label" htmlFor={exportId}>
        This diagram
      </label>
      <textarea
        id={exportId}
        className="diagram-io__text"
        data-testid="diagram-io-export"
        readOnly
        value={exported}
        spellCheck={false}
      />
      {undocumentable > 0 && (
        <p className="diagram-io__warning" data-testid="diagram-io-undocumentable">
          {undocumentable} shape{undocumentable === 1 ? '' : 's'} on this page cannot be described
          by the JSON and {undocumentable === 1 ? 'is' : 'are'} not included.
        </p>
      )}
      <button
        type="button"
        className="diagram-io__button"
        data-testid="diagram-io-copy"
        onClick={() => void onCopyClick()}
      >
        Copy
      </button>

      <label className="diagram-io__label" htmlFor={pasteId}>
        Paste a diagram to import
      </label>
      <textarea
        id={pasteId}
        className="diagram-io__text"
        data-testid="diagram-io-paste"
        value={pasted}
        spellCheck={false}
        onChange={(event) => setPasted(event.target.value)}
      />
      <button
        type="button"
        ref={importButton}
        className="diagram-io__button"
        data-testid="diagram-io-import"
        onClick={onImportClick}
      >
        Import
      </button>

      <p className="diagram-io__status" role="status" data-testid="diagram-io-status">
        {notice}
      </p>
      <p className="diagram-io__error" role="alert" data-testid="diagram-io-error">
        {error}
      </p>

      {pending && (
        <div
          className="diagram-io__confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${headingId}-confirm`}
          data-testid="diagram-io-confirm"
        >
          <p id={`${headingId}-confirm`}>
            Importing replaces the whole page. {undocumentable} shape
            {undocumentable === 1 ? '' : 's'} — drawings, notes and anything else the JSON cannot
            describe — will be deleted. One undo brings {undocumentable === 1 ? 'it' : 'them'} back.
          </p>
          <button
            type="button"
            ref={confirmButton}
            className="diagram-io__button"
            data-testid="diagram-io-confirm-yes"
            onClick={() => runImport(pending)}
          >
            Import anyway
          </button>
          <button
            type="button"
            className="diagram-io__button"
            data-testid="diagram-io-confirm-no"
            onClick={() => setPending(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
