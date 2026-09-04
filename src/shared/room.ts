/**
 * Room addressing — imported by BOTH the client (to build a socket URI and to
 * route) and the worker (to validate an incoming request). Two copies of this
 * rule would drift, and the drift would only show up as a rejected connection.
 *
 * Runtime-agnostic by construction: no DOM, no worker globals.
 */

export type RoomId = string

/** 8-32 chars of [A-Za-z0-9_-]. Stated so "malformed id is rejected" is binary. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

export function isValidRoomId(value: string): boolean {
  return ROOM_ID_PATTERN.test(value)
}

export function generateRoomId(): RoomId {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/**
 * `RoomId | null` cannot express the difference between "/" and "/short", and
 * those two go to OPPOSITE outcomes: generate-and-redirect vs an error state.
 */
export type RoomRoute =
  { kind: 'none' } | { kind: 'invalid'; raw: string } | { kind: 'valid'; id: RoomId }

export function roomRouteFromPath(pathname: string): RoomRoute {
  const raw = pathname.replace(/^\/+|\/+$/g, '')
  if (raw === '') return { kind: 'none' }
  if (!isValidRoomId(raw)) return { kind: 'invalid', raw }
  return { kind: 'valid', id: raw }
}

/** The socket URI for a room, given the page origin. Single origin in dev and prod. */
export function syncUri(origin: string, id: RoomId): string {
  return `${origin.replace(/^http/, 'ws')}/api/connect/${id}`
}
