import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Editor } from 'tldraw'
import { DiagramIOPanel } from './DiagramIOPanel'
import { DOCUMENT_VERSION } from '@shared/shapes'

const exportDocument = vi.fn()
const importDocument = vi.fn()
const undocumentableShapeCount = vi.fn()

vi.mock('../documentIO', () => ({
  exportDocument: (...args: unknown[]) => exportDocument(...args) as unknown,
  importDocument: (...args: unknown[]) => importDocument(...args) as unknown,
  undocumentableShapeCount: (...args: unknown[]) => undocumentableShapeCount(...args) as unknown,
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
  exportDocument.mockReturnValue({ version: DOCUMENT_VERSION, nodes: [], connections: [] })
  undocumentableShapeCount.mockReturnValue(0)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DiagramIOPanel — FR-004', () => {
  it('shows the current diagram as JSON, with no clipboard API involved', () => {
    open()
    const box = screen.getByTestId('diagram-io-export') as HTMLTextAreaElement
    expect(JSON.parse(box.value)).toEqual({ version: DOCUMENT_VERSION, nodes: [], connections: [] })
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
    open()
    paste(JSON.stringify({ version: DOCUMENT_VERSION, nodes: [], connections: [], frames: [] }))
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    expect(screen.getByTestId('diagram-io-error')).toHaveTextContent('document.frames: unknown key')
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
    expect(dialog).toHaveAttribute('aria-modal', 'true')
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

  it('moves focus into the dialog and back to its trigger', () => {
    undocumentableShapeCount.mockReturnValue(2)
    open()
    paste(VALID)
    fireEvent.click(screen.getByTestId('diagram-io-import'))
    expect(document.activeElement).toBe(screen.getByTestId('diagram-io-confirm-yes'))

    fireEvent.click(screen.getByTestId('diagram-io-confirm-no'))
    expect(document.activeElement).toBe(screen.getByTestId('diagram-io-import'))
  })
})
