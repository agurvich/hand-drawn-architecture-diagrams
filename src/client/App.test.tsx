import { render, screen } from '@testing-library/react'
import { App } from './App'
import { isValidRoomId } from '@shared/room'

/**
 * App owns ROUTING. The canvas itself needs a live synced store, so it is
 * covered end to end (e2e/sync.spec.ts) rather than mocked here -- a mocked
 * sync store would assert against the mock, not against the room.
 */
function goTo(path: string) {
  window.history.replaceState(null, '', path)
}

describe('App routing — SPEC-002 FR-002', () => {
  it('shows the id error for a malformed room id, without opening a socket', () => {
    goTo('/short')
    render(<App />)
    expect(screen.getByTestId('room-error-id')).toBeInTheDocument()
    expect(screen.queryByTestId('room-loading')).not.toBeInTheDocument()
  })

  it('distinguishes a malformed id from no id at all', () => {
    // The reason RoomRoute is a discriminated union: `RoomId | null` would send
    // "/" and "/short" to the same branch, and they need opposite outcomes.
    goTo('/has space')
    render(<App />)
    expect(screen.getByTestId('room-error-id')).toBeInTheDocument()
  })

  it('generates a room id and redirects when the path carries none', () => {
    goTo('/')
    render(<App />)
    const id = window.location.pathname.slice(1)
    expect(isValidRoomId(id)).toBe(true)
    expect(screen.getByTestId('room-loading')).toBeInTheDocument()
  })

  it('does not remember the room id in client storage — the URL is the memory', () => {
    goTo('/')
    render(<App />)
    const stored = Object.keys(localStorage).filter((k) => k.toLowerCase().includes('room'))
    expect(stored).toEqual([])
  })

  it('connects for a well-formed id', () => {
    goTo('/abcd1234efgh')
    render(<App />)
    expect(screen.getByTestId('room-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('room-error-id')).not.toBeInTheDocument()
  })
})
