import { describe, it, expect } from 'vitest'
import { chosenActorBinding } from './actor'

/**
 * `chosenActorBinding` is the whole of the two-bindings rule, and the rule is
 * about what two clients agree on without talking to each other. That makes it
 * worth testing away from an Editor, where the input order can be controlled.
 */
describe('chosenActorBinding', () => {
  it('returns undefined for no bindings', () => {
    expect(chosenActorBinding([])).toBeUndefined()
  })

  it('returns the only binding when there is one', () => {
    const only = { id: 'binding:m' }
    expect(chosenActorBinding([only])).toBe(only)
  })

  it('takes the SMALLEST id, whatever order they arrive in', () => {
    // Both orders, because "smallest" and "first" agree in one of them -- and an
    // implementation that just took the first would be store order, which is
    // exactly what need not match between two clients.
    const a = { id: 'binding:aaaa' }
    const z = { id: 'binding:zzzz' }
    expect(chosenActorBinding([a, z])).toBe(a)
    expect(chosenActorBinding([z, a])).toBe(a)
  })

  it('compares under plain <, not localeCompare', () => {
    // They disagree on the mixed-case ids tldraw generates, and merge.ts's
    // representative rule uses plain `<` for the same reason. Two clients must
    // sort identically with no coordination.
    const upper = { id: 'binding:Zebra' }
    const lower = { id: 'binding:apple' }
    expect(chosenActorBinding([lower, upper])).toBe(upper)
    expect('binding:Zebra' < 'binding:apple').toBe(true)
  })

  it('is stable across every permutation of three', () => {
    const bindings = [{ id: 'binding:b' }, { id: 'binding:a' }, { id: 'binding:c' }]
    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]
    for (const order of permutations) {
      expect(chosenActorBinding(order.map((i) => bindings[i]!))?.id).toBe('binding:a')
    }
  })
})
