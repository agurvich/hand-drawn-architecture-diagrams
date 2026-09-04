import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('mounts the canvas host', () => {
    render(<App />)
    expect(screen.getByTestId('canvas-host')).toBeInTheDocument()
  })

  it('does not configure persistence — SPEC-001 FR-002 requires the canvas to forget on reload', () => {
    render(<App />)
    const docKeys = Object.keys(localStorage).filter(
      (k) => k.includes('document') || k.includes('TLDRAW_DOCUMENT'),
    )
    expect(docKeys).toEqual([])
  })
})
