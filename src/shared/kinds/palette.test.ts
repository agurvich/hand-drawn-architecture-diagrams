import { describe, it, expect } from 'vitest'
import {
  CANVAS_BACKGROUND,
  freePair,
  KIND_DASHES,
  KIND_PALETTE,
  KIND_UNRESOLVED,
  labelCollision,
  overlayVocabulary,
  pairCollision,
  SEED_KINDS,
} from './index'

/**
 * The palette's accessibility properties, asserted rather than commented.
 *
 * SPEC-018 shipped these colours as `--edge-kind-*` custom properties with the
 * measurements in a comment, which is a claim nothing checks. Moving them into
 * a constant is what makes them testable, and this file is the reason that
 * trade was worth making.
 */

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** CIE Lab, D65. Perceptual distance is what separates hues at one lightness. */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

const entries = Object.entries(KIND_PALETTE)

describe('the kind palette', () => {
  it.each(entries)('%s clears 3:1 against the canvas', (_name, { hex }) => {
    // WCAG 1.4.11: a strand IS the information, not decoration.
    expect(contrast(hex, CANVAS_BACKGROUND)).toBeGreaterThanOrEqual(3)
  })

  it('separates every pair by at least dE 20', () => {
    /*
     * PERCEPTUAL distance, not contrast. Pairwise 3:1 luminance contrast caps a
     * palette at TWO colours -- see `palette.ts` for the arithmetic -- and is
     * the wrong question anyway, since two strands are separated by a gap of
     * background. dE is what separates hues at similar lightness.
     *
     * The floor BINDS: the closest pair ships at 20.6.
     */
    for (const [an, a] of entries) {
      for (const [bn, b] of entries) {
        if (an >= bn) continue
        expect(deltaE(a.hex, b.hex), `${an} and ${bn} are too close to tell apart`).toBeGreaterThan(
          20,
        )
      }
    }
  })

  it('excludes the scene-highlight accent', () => {
    // A kind painted in the accent is indistinguishable from a highlighted line.
    // `index.css` uses #1a5fb4 at five sites.
    expect(entries.map(([, v]) => v.hex.toLowerCase())).not.toContain('#1a5fb4')
  })

  it('reaches no kind from the black pen', () => {
    // Black is the default pen and records no decision, so a black stroke means
    // NO KIND. That stays true whatever the user creates only because nothing
    // here can claim black.
    expect(entries.map(([, v]) => v.pen)).not.toContain('black')
  })

  it('maps each palette colour to at most one pen', () => {
    // Two colours claiming one pen would make the stroke's kind depend on
    // iteration order, which differs between clients.
    const pens = entries.map(([, v]) => v.pen).filter((p): p is string => p !== null)
    expect(new Set(pens).size).toBe(pens.length)
  })
})

describe('the unresolved look', () => {
  it('is in no palette entry', () => {
    expect(entries.map(([, v]) => v.hex.toLowerCase())).not.toContain(KIND_UNRESOLVED.hex)
  })

  it('clears 3:1 against the canvas and dE 20 against every kind', () => {
    expect(contrast(KIND_UNRESOLVED.hex, CANVAS_BACKGROUND)).toBeGreaterThanOrEqual(3)
    for (const [name, { hex }] of entries) {
      expect(deltaE(KIND_UNRESOLVED.hex, hex), `unresolved reads as ${name}`).toBeGreaterThan(20)
    }
  })

  it('is not currentColor by any other name', () => {
    /*
     * The failure this guards is specific: `index.css` sets `color` to the
     * accent on a highlighted connection and the halo is drawn in
     * `currentColor` behind the strands, so an unresolved strand in the accent
     * vanishes into its own highlight.
     */
    expect(KIND_UNRESOLVED.hex.toLowerCase()).not.toBe('#1a5fb4')
  })

  it('is dashed, so it is not just a dark line', () => {
    expect(KIND_UNRESOLVED.dash).toBeTruthy()
  })
})

describe('the seeds', () => {
  it('are the three SPEC-018 kinds, so no existing diagram changes appearance', () => {
    expect(SEED_KINDS.map((s) => s.label)).toEqual(['data', 'permission', 'sequence'])
    expect(SEED_KINDS.map((s) => KIND_PALETTE[s.colour]!.hex)).toEqual([
      '#b35c00',
      '#2f8a2f',
      '#5b6270',
    ])
    expect(SEED_KINDS.map((s) => KIND_DASHES[s.dash])).toEqual([undefined, '7 4', '1.5 4'])
  })

  it('name a real palette colour and a real dash', () => {
    for (const seed of SEED_KINDS) {
      expect(Object.hasOwn(KIND_PALETTE, seed.colour)).toBe(true)
      expect(Object.hasOwn(KIND_DASHES, seed.dash)).toBe(true)
    }
  })

  it('are distinguishable from each other in colour AND dash', () => {
    // The write-side rule applied to the set that ships by default: two kinds
    // identical in both channels are one kind to a reader.
    const pairs = SEED_KINDS.map((s) => `${s.colour}/${s.dash}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })
})

/*
 * `labelCollision` and `pairCollision` moved here from `kind.ts` with the
 * functions themselves (SPEC-020 FR-003): both are pure over `VocabularyEntry`,
 * neither needs tldraw, and `freePair` -- which document export calls -- is a
 * loop over `pairCollision`, so leaving them behind would have meant a module
 * cycle, a second copy of the rule, or tldraw reaching `document.ts`.
 */
describe('labelCollision', () => {
  const vocabulary = overlayVocabulary([])

  it('finds a duplicate ignoring case and surrounding space', () => {
    expect(labelCollision('  DATA ', vocabulary)?.id).toBe('data')
  })

  it('allows a genuinely new label', () => {
    expect(labelCollision('enriches', vocabulary)).toBeNull()
  })

  it('lets an entry be renamed to a different case OF ITSELF', () => {
    /*
     * `data` -> `Data`. Without an id exclusion, a case-insensitive comparison
     * refuses this and names the colliding entry -- which is the entry being
     * renamed. Capitalising a label for display is exactly what SPEC-018's
     * `KIND_LABELS` map did in code, and this spec deletes it.
     */
    expect(labelCollision('Data', vocabulary, 'data')).toBeNull()
  })

  it('still refuses a rename onto ANOTHER entry', () => {
    expect(labelCollision('sequence', vocabulary, 'data')?.id).toBe('sequence')
  })
})

describe('pairCollision — the rule, and the way it retired silently', () => {
  /*
   * THE RULE THAT RETIRED SILENTLY.
   *
   * `pairCollision` used to resolve its `dash` argument through `KIND_DASHES`
   * and compare the result against a pre-resolved `entry.dash`. Once entries
   * hold keys that comparison is key-versus-SVG-value -- `'solid' === undefined`,
   * `'dashed' === '7 4'` -- so it returned `null` for every real query. Nothing
   * threw. What stopped working was the WCAG 1.4.1 refusal this function IS:
   * `refuseKindWrite` would have let two kinds be identical in both channels,
   * and `freePair` would have handed every new kind `data`'s own pair.
   *
   * Proved by execution during review rather than reasoned about, which is why
   * it has its own describe block and its own named mutation: revert the
   * comparison in `palette.ts` to `e.dash === KIND_DASHES[dash]` and these go
   * red.
   */
  const seeds = overlayVocabulary([])

  it('refuses a pair identical in BOTH channels', () => {
    expect(pairCollision('orange', 'solid', seeds)?.id).toBe('data')
  })

  it('allows a shared colour when the dash differs, and the reverse', () => {
    expect(pairCollision('orange', 'dotted', seeds)).toBeNull()
    expect(pairCollision('teal', 'solid', seeds)).toBeNull()
  })

  it('does not collide an entry with itself while it is being edited', () => {
    expect(pairCollision('orange', 'solid', seeds, 'data')).toBeNull()
  })

  it('refuses every seed pair, so the comparison is not accidentally one-sided', () => {
    // The key-vs-value bug passed the first case above for `data` only by
    // luck of `undefined`; asserting all three is what makes it unambiguous.
    for (const seed of SEED_KINDS) {
      expect(pairCollision(seed.colour, seed.dash, seeds)?.id, seed.label).toBe(seed.id)
    }
  })
})

describe('freePair', () => {
  it('finds a pair nothing is using', () => {
    const pair = freePair(overlayVocabulary([]))
    expect(pair).not.toBeNull()
    expect(pairCollision(pair!.colour, pair!.dash, overlayVocabulary([]))).toBeNull()
  })

  it('does not hand out a seed’s pair', () => {
    // The symptom of the retired rule: every new kind opening on orange/solid,
    // which IS `data`, so creating one was refused for a collision the user had
    // not made.
    const pair = freePair(overlayVocabulary([]))
    expect(`${pair!.colour}/${pair!.dash}`).not.toBe('orange/solid')
  })

  it('returns NULL when all 40 pairs are taken, rather than a colliding fallback', () => {
    /*
     * `null` rather than a silent first-pair fallback, because the two callers
     * want different things from exhaustion: the panel offers a colliding pair
     * and lets the save refuse with a message, and document export drops the
     * word. Picking one here would be wrong for the other.
     */
    const every: ReturnType<typeof overlayVocabulary> = []
    let n = 0
    for (const dash of Object.keys(KIND_DASHES)) {
      for (const colour of Object.keys(KIND_PALETTE)) {
        every.push({ id: `k${n}`, label: `k${n}`, colour, dash })
        n++
      }
    }
    expect(n).toBe(Object.keys(KIND_DASHES).length * Object.keys(KIND_PALETTE).length)
    expect(freePair(every)).toBeNull()
    // One short of full still finds the last one.
    expect(freePair(every.slice(0, -1))).not.toBeNull()
  })
})
