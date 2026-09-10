import { describe, it, expect } from 'vitest'
import { strandsFor, accessibleKinds } from './ConnectionShapeUtil'
import {
  overlayVocabulary,
  KIND_PALETTE,
  KIND_UNRESOLVED,
  SEED_KINDS,
  type KindEntry,
} from '@shared/kinds'

/**
 * SPEC-019 FR-004, the half that is a pure function.
 *
 * What a strand LOOKS like on screen is settled in e2e; what is decided here is
 * which strands exist, in what order, where they sit relative to the geometry,
 * and which palette entry each resolves to -- none of which needs a browser.
 *
 * The SPEC-018 version of this file also checked that every kind had a matching
 * `--edge-kind-*` custom property in `index.css`. That check retires with the
 * custom properties: the colour now comes from `KIND_PALETTE`, so "a kind with
 * no colour" is a type error rather than an invisible strand, and
 * `kinds/palette.test.ts` holds the palette's own properties.
 */

const A = { x: 0, y: 0 }
const B = { x: 100, y: 0 }

/** The vocabulary a room with no kind records reads. */
const seeds = new Map(overlayVocabulary([]).map((e) => [e.label, e]))
const SEED_LABELS = SEED_KINDS.map((s) => s.label)

/** A vocabulary with one user-created kind in it. */
const withEnriches: ReadonlyMap<string, KindEntry> = new Map([
  ...seeds,
  ['enriches', { id: 'k1', label: 'enriches', colour: 'violet', dash: '12 5' }],
])

describe('strandsFor — no kinds is the OLD rendering, exactly', () => {
  it('draws one strand in currentColor, on the line itself', () => {
    const { kinds, strands } = strandsFor([], seeds, A, B)
    expect(kinds).toEqual([])
    expect(strands).toHaveLength(1)
    expect(strands[0]).toMatchObject({ colour: 'currentColor', dx: 0, dy: 0, kind: undefined })
  })

  it('takes the same path as a kinded line rather than a legacy branch', () => {
    // One code path, so "a diagram that never used this feature looks as it
    // did" is a property of the code and not a promise about it.
    expect(strandsFor([], seeds, A, B).strands).toHaveLength(1)
    expect(strandsFor(['data'], seeds, A, B).strands).toHaveLength(1)
  })
})

describe('strandsFor — one strand per kind, resolved through the vocabulary', () => {
  it('paints each strand its palette hex, not a custom property', () => {
    const { strands } = strandsFor(['data', 'permission'], seeds, A, B)
    expect(strands.map((s) => s.kind)).toEqual(['data', 'permission'])
    expect(strands.map((s) => s.colour)).toEqual([
      KIND_PALETTE.orange!.hex,
      KIND_PALETTE.green!.hex,
    ])
  })

  it('paints a USER-CREATED kind from the vocabulary, with no code change', () => {
    // The whole point of SPEC-019: a word that exists in no constant anywhere.
    const { strands } = strandsFor(['enriches'], withEnriches, A, B)
    expect(strands[0]).toMatchObject({
      colour: KIND_PALETTE.violet!.hex,
      dash: '12 5',
      resolved: true,
    })
  })

  it('follows a RECOLOUR without the connection changing', () => {
    // FR-003/FR-004: recolouring writes no connection record, so the same
    // labels through a different vocabulary must paint differently.
    const recoloured = new Map(seeds)
    recoloured.set('data', { id: 'data', label: 'data', colour: 'teal', dash: undefined })
    expect(strandsFor(['data'], recoloured, A, B).strands[0]!.colour).toBe(KIND_PALETTE.teal!.hex)
    expect(strandsFor(['data'], seeds, A, B).strands[0]!.colour).toBe(KIND_PALETTE.orange!.hex)
  })

  it('gives each seed a DISTINCT dash, so colour is not the only channel', () => {
    /*
     * Orange and green is exactly the pair a red-green colour-blind reader
     * cannot separate, and `aria-label` serves a screen reader rather than them.
     * PAIRWISE distinct, including `data`'s solid line, which is `undefined`
     * rather than a pattern.
     */
    const dashes = strandsFor(SEED_LABELS, seeds, A, B).strands.map((s) => s.dash ?? 'solid')
    expect(new Set(dashes).size).toBe(SEED_LABELS.length)
  })

  it('leaves the commonest kind SOLID, so the default line is the cheapest to read', () => {
    expect(strandsFor(['data'], seeds, A, B).strands[0]!.dash).toBeUndefined()
    expect(strandsFor(['permission'], seeds, A, B).strands[0]!.dash).toBeDefined()
  })

  it('draws ONE strand for a kind repeated, rather than two on one path', () => {
    // Two strands for one kind would share a React key AND a `<marker>` id, and
    // would push the pair off the centre this function documents itself as
    // holding.
    const { kinds, strands } = strandsFor(['data', 'data'], seeds, A, B)
    expect(kinds).toEqual(['data'])
    expect(strands).toHaveLength(1)
    expect(strands[0]).toMatchObject({ dx: 0, dy: 0 })
  })

  it('gives each strand a DISTINCT marker key, or they share one arrowhead', () => {
    const keys = strandsFor(SEED_LABELS, seeds, A, B).strands.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('strandsFor — a label the vocabulary does not list', () => {
  it('DRAWS it, unresolved, rather than dropping it', () => {
    /*
     * SPEC-018 dropped an unknown kind, on the grounds that its custom property
     * resolved to nothing. With a vocabulary the user writes, the commonest
     * source of an unlisted label is a concurrent rename -- and a label that is
     * stored, invisible and unremovable is worse than one drawn in a colour
     * that says "not a kind here".
     *
     * STRAND COUNT EQUALS LABEL COUNT is the assertion that fails if filtering
     * comes back.
     */
    const { kinds, strands } = strandsFor(['enriches', 'data'], seeds, A, B)
    expect(kinds).toEqual(['enriches', 'data'])
    expect(strands).toHaveLength(2)
    expect(strands[0]).toMatchObject({ colour: KIND_UNRESOLVED.hex, resolved: false })
    expect(strands[1]).toMatchObject({ colour: KIND_PALETTE.orange!.hex, resolved: true })
  })

  it('never paints an unresolved strand in currentColor', () => {
    /*
     * The specific failure: `index.css` sets `color` to the scene accent on a
     * highlighted connection, and the halo is drawn in `currentColor` BEHIND
     * the strands -- so a `currentColor` strand on a highlighted line is the
     * accent painted over the accent, and vanishes into its own highlight. The
     * palette excludes the accent for the same reason; this is the other door.
     */
    const { strands } = strandsFor(['enriches'], seeds, A, B)
    expect(strands[0]!.colour).not.toBe('currentColor')
    expect(strands[0]!.colour).not.toBe('#1a5fb4')
  })

  it('still centres the set on the line', () => {
    const three = strandsFor(['enriches', 'data', 'permission'], seeds, A, B).strands
    expect(three[1]!.dy).toBeCloseTo(0, 10)
    expect(three[0]!.dy).toBeCloseTo(-three[2]!.dy, 10)
  })
})

describe('strandsFor — offsets are centred on the geometry', () => {
  it('puts a single strand on the line, so the line you click is the line you see', () => {
    expect(strandsFor(['data'], seeds, A, B).strands[0]).toMatchObject({ dx: 0, dy: 0 })
  })

  it('straddles the line with two, and centres the middle one of three', () => {
    const two = strandsFor(['data', 'permission'], seeds, A, B).strands
    expect(two[0]!.dy).toBe(-two[1]!.dy)
    expect(two[0]!.dy).not.toBe(0)

    const three = strandsFor(SEED_LABELS, seeds, A, B).strands
    expect(three[1]!.dx).toBeCloseTo(0, 10)
    expect(three[1]!.dy).toBeCloseTo(0, 10)
    expect(three[0]!.dy).toBeCloseTo(-three[2]!.dy, 10)
  })

  it('offsets PERPENDICULAR to the line, whatever direction it runs', () => {
    const vertical = strandsFor(['data', 'permission'], seeds, { x: 0, y: 0 }, { x: 0, y: 100 })
    expect(Math.abs(vertical.strands[0]!.dx)).toBeGreaterThan(0)
    expect(vertical.strands[0]!.dy).toBeCloseTo(0, 10)
  })

  it('does not divide by zero on a line with no length', () => {
    // Both terminals at one point is reachable: two bound nodes sitting exactly
    // on top of each other.
    const { strands } = strandsFor(['data', 'permission'], seeds, A, A)
    for (const strand of strands) {
      expect(Number.isFinite(strand.dx)).toBe(true)
      expect(Number.isFinite(strand.dy)).toBe(true)
    }
  })
})

describe('the accessible name', () => {
  it('is silent on a line with no kinds', () => {
    expect(accessibleKinds(strandsFor([], seeds, A, B).strands)).toBeUndefined()
  })

  it('lists the kinds a line carries', () => {
    expect(accessibleKinds(strandsFor(['data', 'permission'], seeds, A, B).strands)).toBe(
      'Kinds: data, permission',
    )
  })

  it('NAMES an unlisted label as unlisted rather than listing it as a kind', () => {
    // A reader who cannot see the strand's colour has no other way to learn
    // that the word is one this room's vocabulary does not define.
    expect(accessibleKinds(strandsFor(['enriches', 'data'], seeds, A, B).strands)).toBe(
      'Kinds: enriches (not in the vocabulary), data',
    )
  })
})
