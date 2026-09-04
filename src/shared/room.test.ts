import { describe, it, expect } from 'vitest'
import { roomRouteFromPath, isValidRoomId, generateRoomId, syncUri } from './room'

describe('room id validation', () => {
  it('accepts 8-32 chars of the allowed alphabet', () => {
    expect(isValidRoomId('abcd1234')).toBe(true)
    expect(isValidRoomId('a'.repeat(32))).toBe(true)
    expect(isValidRoomId('A-b_c-9xyz')).toBe(true)
  })

  it('rejects too short, too long, and out-of-alphabet', () => {
    expect(isValidRoomId('short')).toBe(false)
    expect(isValidRoomId('a'.repeat(33))).toBe(false)
    expect(isValidRoomId('has space')).toBe(false)
    expect(isValidRoomId('has/slash')).toBe(false)
    expect(isValidRoomId('')).toBe(false)
  })
})

describe('roomRouteFromPath — the three outcomes must be distinguishable', () => {
  it('routes "/" to none, so the client can generate and redirect', () => {
    expect(roomRouteFromPath('/')).toEqual({ kind: 'none' })
    expect(roomRouteFromPath('')).toEqual({ kind: 'none' })
  })

  it('routes a malformed id to invalid, NOT to none', () => {
    // The whole reason RoomRoute exists: `RoomId | null` collapses these two.
    expect(roomRouteFromPath('/short')).toEqual({ kind: 'invalid', raw: 'short' })
    expect(roomRouteFromPath('/has space')).toEqual({ kind: 'invalid', raw: 'has space' })
  })

  it('routes a well-formed id to valid', () => {
    expect(roomRouteFromPath('/abcd1234')).toEqual({ kind: 'valid', id: 'abcd1234' })
    expect(roomRouteFromPath('/abcd1234/')).toEqual({ kind: 'valid', id: 'abcd1234' })
  })
})

describe('generateRoomId', () => {
  it('produces ids that its own validator accepts', () => {
    for (let i = 0; i < 50; i++) expect(isValidRoomId(generateRoomId())).toBe(true)
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 200 }, generateRoomId))
    expect(ids.size).toBe(200)
  })
})

describe('syncUri', () => {
  it('upgrades the scheme and namespaces under /api', () => {
    expect(syncUri('http://localhost:5173', 'abcd1234')).toBe(
      'ws://localhost:5173/api/connect/abcd1234',
    )
    expect(syncUri('https://example.com', 'abcd1234')).toBe(
      'wss://example.com/api/connect/abcd1234',
    )
  })
})
