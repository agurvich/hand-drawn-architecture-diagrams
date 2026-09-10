import { describe, it, expect } from 'vitest'
import { CANVAS_BACKGROUND, KIND_DASHES, KIND_PALETTE, KIND_UNRESOLVED, SEED_KINDS } from './index'

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
