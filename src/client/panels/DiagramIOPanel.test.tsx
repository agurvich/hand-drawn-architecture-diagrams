import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Editor } from 'tldraw'
import { DiagramIOPanel } from './DiagramIOPanel'
import { DOCUMENT_VERSION } from '@shared/shapes'

const exportDocument = vi.fn()
const importDocument = vi.fn()
const undocumentableShapeCount = vi.fn()
const replacedSceneCount = vi.fn()

vi.mock('../documentIO', () => ({
  exportDocument: (...args: unknown[]) => exportDocument(...args) as unknown,
  importDocument: (...args: unknown[]) => importDocument(...args) as unknown,
  undocumentableShapeCount: (...args: unknown[]) => undocumentableShapeCount(...args) as unknown,
  replacedSceneCount: (...args: unknown[]) => replacedSceneCount(...args) as unknown,
}))

const editor = {} as Editor

const VALID = JSON.stringify({
  version: DOCUMENT_VERSION,
  nodes: [{ id: 'a', label: 'A', x: 0, y: 0, w: 100, h: 60 }],
  connections: [],
})

function open() {
  render(<DiagramIOPanel editor={editor} />)
  fireEvent.click(screen.getByTestId('diagram-io-open'))
}

function paste(text: string) {
  fireEvent.change(screen.getByTestId('diagram-io-paste'), { target: { value: text } })
}

beforeEach(() => {
  exportDocument.mockReturnValue({
    version: DOCUMENT_VERSION,
    nodes: [],
    connections: [],
    scenes: [],
  })
  undocumentableShapeCount.mockReturnValue(0)
  replacedSceneCount.mockReturnValue(0)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DiagramIOPanel — FR-004', () => {
  it('shows the current diagram as JSON, with no clipboard API involved', () => {
    open()
    const box = screen.getByTestId('diagram-io-export') as HTMLTextAreaElement
    expect(JSON.parse(box.value)).toEqual({
      version: DOCUMENT_VERSION,
      nodes: [],
      connections: [],
      scenes: [],
    })
    expect(box.readOnly).toBe(true)
  })

  it('every control carries a visible label or text, and the boxes are labelled', () => {
    open()
    expect(screen.getByLabelText('This diagram')).toBeInTheDocument()
    expect(screen.getByLabelText('Paste a diagram to import')).toBeInTheDocument()
  })

  it('says so when the browser withholds the clipboard, rather than appearing to work', () => {
    // The iPad reaches this app over plain http, where navigator.clipboard does
    // not exist at all. Silently doing nothing is the failure to avoid.
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    open()
    fireEvent.click(screen.getByTestId('diagram-io-copy'))
    expect(screen.getByTestId('diagram-io-status')).toHaveTextContent(/select the text/i)
    if (original) Object.defineProperty(navigator, 'clipboard', original)
  })

  it('reports a rejected import in the panel and KEEPS the pasted text', () => {
    open()
    paste('{ not json')
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    expect(screen.getByTestId('diagram-io-error')).toHaveTextContent(/not valid JSON/)
    expect((screen.getByTestId('diagram-io-paste') as HTMLTextAreaElement).value).toBe('{ not json')
    expect(importDocument).not.toHaveBeenCalled()
  })

  it('names the offending path, so a big document can be corrected', () => {
    // `scenes` was this test's made-up key until SPEC-009 made it a real one.
    // The path-naming behaviour is what is being checked, so the key just has
    // to be one the schema does not have -- and stay that way.
    open()
    paste(JSON.stringify({ version: DOCUMENT_VERSION, nodes: [], connections: [], edgeSets: [] }))
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    expect(screen.getByTestId('diagram-io-error')).toHaveTextContent(
      'document.edgeSets: unknown key',
    )
  })

  it('warns beside the JSON when the page holds shapes the document cannot carry', () => {
    undocumentableShapeCount.mockReturnValue(3)
    open()
    expect(screen.getByTestId('diagram-io-undocumentable')).toHaveTextContent(/3 shapes/)
  })

  it('shows no warning when everything on the page is documentable', () => {
    open()
    expect(screen.queryByTestId('diagram-io-undocumentable')).not.toBeInTheDocument()
  })
})

describe('DiagramIOPanel — FR-003, the confirmation gate', () => {
  it('imports with NO confirmation when nothing would be lost', () => {
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    expect(screen.queryByTestId('diagram-io-confirm')).not.toBeInTheDocument()
    expect(importDocument).toHaveBeenCalledTimes(1)
  })

  it('confirms first when undocumentable shapes would be deleted, naming how many', () => {
    undocumentableShapeCount.mockReturnValue(9)
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))

    const dialog = screen.getByTestId('diagram-io-confirm')
    expect(dialog).toHaveAttribute('role', 'dialog')
    // Deliberately NOT aria-modal: that tells assistive tech the rest of the
    // page is inert, while Tab still walks straight out into the panel and the
    // canvas. Claiming containment we do not enforce is worse than not claiming it.
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(dialog).toHaveTextContent(/9 shapes/)
    expect(importDocument).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('diagram-io-confirm-yes'))
    expect(importDocument).toHaveBeenCalledTimes(1)
  })

  it('dismissing the confirmation imports NOTHING and keeps the pasted text', () => {
    undocumentableShapeCount.mockReturnValue(2)
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    fireEvent.click(screen.getByTestId('diagram-io-confirm-no'))

    expect(importDocument).not.toHaveBeenCalled()
    expect(screen.queryByTestId('diagram-io-confirm')).not.toBeInTheDocument()
    expect((screen.getByTestId('diagram-io-paste') as HTMLTextAreaElement).value).toBe(VALID)
  })

  it('Escape dismisses the confirmation before it closes the panel', () => {
    undocumentableShapeCount.mockReturnValue(2)
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('diagram-io-confirm')).not.toBeInTheDocument()
    expect(screen.getByTestId('diagram-io')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('diagram-io')).not.toBeInTheDocument()
    expect(importDocument).not.toHaveBeenCalled()
  })

  it('moves focus into the panel on open and back to the launcher on close', () => {
    // Opening unmounts the launch button under the user's focus; closing
    // unmounts the panel under it. Both used to drop focus on <body>, leaving a
    // keyboard user to tab through the whole canvas UI to get back.
    render(<DiagramIOPanel editor={editor} />)
    fireEvent.click(screen.getByTestId('diagram-io-open'))
    expect(document.activeElement).toBe(screen.getByTestId('diagram-io'))

    fireEvent.click(screen.getByTestId('diagram-io-close'))
    expect(document.activeElement).toBe(screen.getByTestId('diagram-io-open'))
  })

  it('returns focus to the launcher after a successful import too', () => {
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    expect(document.activeElement).toBe(screen.getByTestId('diagram-io-open'))
  })

  it('clears the error when the paste box is edited, so a retry re-announces', () => {
    open()
    paste('{ not json')
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    expect(screen.getByTestId('diagram-io-error')).toHaveTextContent(/not valid JSON/)
    paste('{ still not json')
    expect(screen.getByTestId('diagram-io-error')).toHaveTextContent('')
  })

  it('moves focus into the dialog and back to its trigger', () => {
    undocumentableShapeCount.mockReturnValue(2)
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    expect(document.activeElement).toBe(screen.getByTestId('diagram-io-confirm-yes'))

    fireEvent.click(screen.getByTestId('diagram-io-confirm-no'))
    expect(document.activeElement).toBe(screen.getByTestId('diagram-io-import'))
  })

  it('CONFIRMS when the room has scenes, even with nothing undocumentable', () => {
    // Scenes are not page shapes, so `undocumentableShapeCount` cannot see them.
    // Without its own count, a room of six hand-authored scenes was replaced in
    // silence -- the case a shape-only gate is structurally blind to.
    replacedSceneCount.mockReturnValue(6)
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    const confirm = screen.getByTestId('diagram-io-confirm')
    expect(confirm).toHaveTextContent(/6 scenes/)
    // Not "the whole page" when no page shape is at risk -- and no raw HTML
    // entity, which a string literal in JSX renders verbatim.
    expect(confirm.textContent).toContain('Importing replaces this room\u2019s scenes.')
    expect(confirm.textContent).not.toContain('&rsquo;')
    expect(importDocument).not.toHaveBeenCalled()
  })

  it('says how many of EACH would go when both are at risk', () => {
    undocumentableShapeCount.mockReturnValue(3)
    replacedSceneCount.mockReturnValue(1)
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    const confirm = screen.getByTestId('diagram-io-confirm')
    expect(confirm).toHaveTextContent(/3 shapes/)
    expect(confirm).toHaveTextContent(/1 scene /)
  })
})
