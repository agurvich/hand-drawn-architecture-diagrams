import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { strandsFor } from './ConnectionShapeUtil'
import { EDGE_KINDS } from '@shared/shapes'

/**
 * SPEC-018 FR-002, the half that is a pure function.
 *
 * What a strand LOOKS like -- the resolved colour on screen -- is settled in
 * e2e, where `getComputedStyle` resolves a custom property and jsdom does not.
 * What is decided here is which strands exist, in what order, and where they
 * sit relative to the geometry, none of which needs a browser.
 */

const A = { x: 0, y: 0 }
const B = { x: 100, y: 0 }

describe('strandsFor — no kinds is the OLD rendering, exactly', () => {
  it('draws one strand in currentColor, on the line itself', () => {
    const { kinds, strands } = strandsFor([], A, B)
    expect(kinds).toEqual([])
    expect(strands).toHaveLength(1)
    expect(strands[0]).toMatchObject({ colour: 'currentColor', dx: 0, dy: 0, kind: undefined })
  })

  it('takes the same path as a kinded line rather than a legacy branch', () => {
    // One code path, so "a diagram that never used this feature looks as it
    // did" is a property of the code and not a promise about it.
    expect(strandsFor([], A, B).strands).toHaveLength(1)
    expect(strandsFor(['data'], A, B).strands).toHaveLength(1)
  })
})

describe('strandsFor — one strand per kind', () => {
  it('draws a strand per kind, each with its own custom property', () => {
    const { strands } = strandsFor(['data', 'permission'], A, B)
    expect(strands.map((s) => s.kind)).toEqual(['data', 'permission'])
    expect(strands.map((s) => s.colour)).toEqual([
      'var(--edge-kind-data)',
      'var(--edge-kind-permission)',
    ])
  })

  it('gives every declared kind a colour, so none renders invisible', () => {
    const { strands } = strandsFor([...EDGE_KINDS], A, B)
    expect(strands).toHaveLength(EDGE_KINDS.length)
    for (const strand of strands) expect(strand.colour).toMatch(/^var\(--edge-kind-[a-z]+\)$/)
  })

  it('gives each strand a DISTINCT marker key, or they share one arrowhead', () => {
    // The keys become marker ids. Two strands sharing a key would share a
    // marker, which is precisely the shared-arrowhead defect in another costume.
    const keys = strandsFor([...EDGE_KINDS], A, B).strands.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('strandsFor — offsets are centred on the geometry', () => {
  it('puts a single strand on the line, so the line you click is the line you see', () => {
    expect(strandsFor(['data'], A, B).strands[0]).toMatchObject({ dx: 0, dy: 0 })
  })

  it('straddles the line with two, and centres the middle one of three', () => {
    const two = strandsFor(['data', 'permission'], A, B).strands
    expect(two[0]!.dy).toBe(-two[1]!.dy)
    expect(two[0]!.dy).not.toBe(0)

    const three = strandsFor([...EDGE_KINDS], A, B).strands
    expect(three[1]!.dx).toBeCloseTo(0, 10)
    expect(three[1]!.dy).toBeCloseTo(0, 10)
    expect(three[0]!.dy).toBeCloseTo(-three[2]!.dy, 10)
  })

  it('offsets PERPENDICULAR to the line, whatever direction it runs', () => {
    // A vertical line offset in y would put both strands on top of each other.
    const vertical = strandsFor(['data', 'permission'], { x: 0, y: 0 }, { x: 0, y: 100 }).strands
    expect(Math.abs(vertical[0]!.dx)).toBeGreaterThan(0)
    expect(vertical[0]!.dy).toBeCloseTo(0, 10)
  })

  it('does not divide by zero on a line with no length', () => {
    // Both terminals at one point is reachable: a connection whose two bound
    // nodes sit exactly on top of each other. There is no direction to be
    // perpendicular to, so the strands land together rather than at NaN.
    const { strands } = strandsFor(['data', 'permission'], A, A)
    for (const strand of strands) {
      expect(Number.isFinite(strand.dx)).toBe(true)
      expect(Number.isFinite(strand.dy)).toBe(true)
    }
  })
})

describe('strandsFor — a kind this build does not know', () => {
  it('draws nothing for it, and does not shift the kinds it does know', () => {
    // The RECORD keeps it -- `normaliseKinds` deliberately preserves a newer
    // build's kind rather than deleting somebody's data. Drawing it would emit
    // `var(--edge-kind-nonsense)`, which resolves to nothing: an invisible
    // strand that still consumes an offset slot and pushes every real one off
    // the line it is meant to be centred on.
    const { kinds, strands } = strandsFor(['a-kind-from-2027', 'data'], A, B)
    expect(kinds).toEqual(['data'])
    expect(strands).toHaveLength(1)
    expect(strands[0]).toMatchObject({ dx: 0, dy: 0, colour: 'var(--edge-kind-data)' })
  })

  it('falls back to the plain line when NO kind is recognised', () => {
    // Not an empty `<defs>` and no strands at all, which would erase the
    // connection from the canvas entirely.
    const { kinds, strands } = strandsFor(['a-kind-from-2027'], A, B)
    expect(kinds).toEqual([])
    expect(strands).toHaveLength(1)
    expect(strands[0]!.colour).toBe('currentColor')
  })
})

describe('the vocabulary and the stylesheet cannot drift apart', () => {
  /*
   * A KIND WITH NO COLOUR DRAWS NOTHING, and nothing else would catch it.
   *
   * `strandsFor` emits `var(--edge-kind-<kind>)` for every entry of
   * `EDGE_KINDS`. A fourth kind added to the vocabulary without a matching
   * custom property resolves to an empty value, and the strand is drawn with no
   * stroke at all -- invisible, while still consuming an offset slot and
   * pushing every real strand off centre. `KIND_LABELS` in `KindField` is an
   * exhaustive `Record`, so TypeScript catches a missing LABEL; nothing catches
   * a missing colour, because CSS has no type system to fail in.
   */
  const css = readFileSync(resolve(process.cwd(), 'src/client/index.css'), 'utf8')

  for (const kind of EDGE_KINDS) {
    it(`--edge-kind-${kind} is defined in index.css`, () => {
      expect(css).toMatch(new RegExp(`--edge-kind-${kind}\\s*:\\s*#`))
    })
  }

  it('THE CHECK BITES on a kind with no custom property', () => {
    // A gate is not tested by running it on the thing it guards.
    expect(css).not.toMatch(/--edge-kind-a-kind-from-2027\s*:\s*#/)
  })

  it('every strand a known kind produces names a property that exists', () => {
    // The two halves joined: what the renderer emits, checked against what the
    // stylesheet defines, rather than each checked against the vocabulary
    // separately.
    for (const strand of strandsFor([...EDGE_KINDS], A, B).strands) {
      const name = strand.colour.replace(/^var\(|\)$/g, '')
      expect(css, `${strand.kind} draws with ${name}, which nothing defines`).toContain(`${name}:`)
    }
  })
})
