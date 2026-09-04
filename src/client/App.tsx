import { useEffect, useState } from 'react'
import { generateRoomId, roomRouteFromPath, type RoomRoute } from '@shared/room'
import { Room } from './Room'

/**
 * The room id is the whole path, so a link is the unit of sharing.
 *
 * The route is resolved BEFORE connecting: a malformed id never opens a socket,
 * which is what makes SPEC-002 FR-001's "rejected rather than opening a
 * connection" true from the user's side. Deliberately NOT remembered in
 * localStorage -- a room is remembered by its URL, and a second home for that
 * state is what SPEC-001 fenced against.
 */
export function App() {
  const [route, setRoute] = useState<RoomRoute>(() => roomRouteFromPath(window.location.pathname))

  useEffect(() => {
    const onPop = () => setRoute(roomRouteFromPath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (route.kind !== 'none') return
    const id = generateRoomId()
    window.history.replaceState(null, '', `/${id}`)
    setRoute({ kind: 'valid', id })
  }, [route])

  if (route.kind === 'none') return null // replaced synchronously by the effect above

  if (route.kind === 'invalid') {
    return (
      <div className="centered" data-testid="room-error-id">
        <div>
          <h1>That doesn’t look like a room</h1>
          <p className="muted">
            <code>{route.raw}</code> isn’t a valid room id. Ids are 8–32 letters, numbers, hyphens
            or underscores.
          </p>
          <a href="/">Start a new room</a>
        </div>
      </div>
    )
  }

  return <Room roomId={route.id} />
}
