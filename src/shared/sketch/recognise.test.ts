import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  recognise,
  simplify,
  trimOvershoot,
  isPurposeful,
  CLOSE_FRACTION,
  type Point,
  type Verdict,
} from './recognise'

/**
 * Driven by RECORDED strokes, not by hand-written point lists.
 *
 * A hand-written rectangle is the author's idea of a rectangle, which is always
 * tidier than one a hand actually draws -- so a recogniser tuned against one is
 * tuned against nothing. Every fixture here went through tldraw's real draw
 * tool, its smoothing and its segment encoding, and came back out through the
 * same `decodePoints` the runtime uses. See `e2e/tools/capture-strokes.spec.ts`.
 */

const CORPUS = resolve(process.cwd(), 'src/shared/sketch/__fixtures__/strokes')

interface Stroke {
  name: string
  expect: 'box' | 'line' | 'none'
  why: string
  via: string
  points: Point[]
}

const STROKES: Stroke[] = readdirSync(CORPUS)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(resolve(CORPUS, f), 'utf8')) as Stroke)

describe('the stroke corpus', () => {
  it('exists, and covers refusals as well as successes', () => {
    // A corpus of only successes cannot see a FALSE POSITIVE, and a false
    // positive here eats somebody's annotation.
    expect(STROKES.length).toBeGreaterThanOrEqual(12)
    const kinds = STROKES.map((s) => s.expect)
    expect(kinds.filter((k) => k === 'none').length).toBeGreaterThanOrEqual(6)
    expect(kinds).toContain('box')
    expect(kinds).toContain('line')
  })

  it('records how each stroke was captured, rather than implying it was a pencil', () => {
    // The app renders blank on iPad (architecture.md, open defect), so these are
    // CDP-synthesised pen events. Said per file rather than assumed.
    for (const stroke of STROKES) expect(stroke.via).toBe('cdp-pen')
  })

  it('says WHY each stroke expects its verdict', () => {
    for (const stroke of STROKES) expect(stroke.why.length).toBeGreaterThan(20)
  })
})

describe('recognise — against the corpus', () => {
  for (const stroke of STROKES) {
    it(`${stroke.name}: ${stroke.expect} — ${stroke.why.slice(0, 60)}`, () => {
      const verdict = recognise(stroke.points)
      expect(
        verdict.kind,
        `${stroke.name} was ${verdict.kind}${verdict.kind === 'none' ? ` (${verdict.because})` : ''}`,
      ).toBe(stroke.expect)
    })
  }
})

describe('recognise — stability', () => {
  /** The same stroke drawn backwards must classify the same. */
  for (const stroke of STROKES) {
    it(`${stroke.name} classifies the same reversed`, () => {
      expect(recognise([...stroke.points].reverse()).kind).toBe(stroke.expect)
    })
  }

  /**
   * A closed stroke started from a different point must classify the same.
   *
   * Rotated as a CYCLE, closing the loop back to the new start -- rotating the
   * raw list would splice a jump from the old end to the old start into the
   * middle of the path, which is not a stroke any hand could draw and would be
   * testing an artefact rather than the recogniser.
   */
  // The `box-` fixtures, not every fixture whose VERDICT is box:
  // `line-routed-around-obstacle` is deliberately called a box by the pure
  // classifier while being a connection, and it is not a rectangle, so there is
  // no corner to have started at. Rotation stability is a claim about
  // rectangles.
  for (const stroke of STROKES.filter((s) => s.name.startsWith('box-'))) {
    it(`${stroke.name} classifies the same started elsewhere`, () => {
      // Rotate the LOOP, with any overshoot trimmed off first: you cannot
      // start a stroke halfway through your own overshoot, so rotating the raw
      // list of a stroke that has one produces a gesture no hand can make.
      const xs = stroke.points.map((p) => p.x)
      const ys = stroke.points.map((p) => p.y)
      const diagonal = Math.hypot(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      )
      const loop = [...trimOvershoot(stroke.points, diagonal * CLOSE_FRACTION)]
      const n = loop.length
      for (const offset of [Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)]) {
        const cycle = [...loop.slice(offset), ...loop.slice(0, offset)]
        cycle.push(cycle[0]!)
        expect(recognise(cycle).kind, `offset ${offset}`).toBe('box')
      }
    })
  }

  it('is translation-invariant in kind, and moves its bounds with the stroke', () => {
    const box = STROKES.find((s) => s.expect === 'box')!
    const moved = box.points.map((p) => ({ x: p.x + 1000, y: p.y - 500 }))
    const here = recognise(box.points)
    const there = recognise(moved)
    expect(there.kind).toBe('box')
    if (here.kind !== 'box' || there.kind !== 'box') throw new Error('not boxes')
    expect(there.min.x - here.min.x).toBeCloseTo(1000, 6)
    expect(there.min.y - here.min.y).toBeCloseTo(-500, 6)
  })
})

describe('recognise — the verdict is total', () => {
  it('returns none for an empty stroke rather than throwing', () => {
    expect(recognise([]).kind).toBe('none')
  })

  it('returns none for a single point', () => {
    expect(recognise([{ x: 5, y: 5 }]).kind).toBe('none')
  })

  it('returns none for two identical points', () => {
    expect(
      recognise([
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ]).kind,
    ).toBe('none')
  })

  it('always says why it refused', () => {
    const verdict: Verdict = recognise([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ])
    if (verdict.kind !== 'none') throw new Error('expected a refusal')
    expect(verdict.because.length).toBeGreaterThan(0)
  })
})

describe('simplify', () => {
  it('keeps the first and last point', () => {
    const points = Array.from({ length: 40 }, (_, i) => ({ x: i * 10, y: 0 }))
    const out = simplify(points)
    expect(out[0]).toEqual(points[0])
    expect(out.at(-1)).toEqual(points.at(-1))
  })

  it('reduces a straight run to its two ends', () => {
    expect(simplify(Array.from({ length: 40 }, (_, i) => ({ x: i * 10, y: 0 })))).toHaveLength(2)
  })

  it('keeps a real corner', () => {
    const points = [
      ...Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 0 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 190, y: i * 10 })),
    ]
    expect(simplify(points).length).toBeGreaterThanOrEqual(3)
  })

  it('does not blow the stack on a very long stroke', () => {
    // Iterative rather than recursive on purpose: a pointer held down for a
    // long time carries thousands of points, and this runs inside a handler.
    const points = Array.from({ length: 60_000 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 50) * 400,
    }))
    expect(() => simplify(points)).not.toThrow()
  })
})

describe('isPurposeful — what lets a node-pair override a refusal', () => {
  /**
   * A different question from `recognise`'s. The classifier asks what shape a
   * stroke is; this asks whether it went from one end to the other. The client
   * needs the second when both ends land in two different nodes, so that a
   * connection routed around an obstacle can outweigh a refusal -- without a
   * scribble across the same two nodes doing the same.
   */
  it('accepts a connection routed around an obstacle', () => {
    const routed = [
      [240, 310],
      [330, 311],
      [420, 309],
      [422, 400],
      [420, 480],
      [520, 482],
      [620, 479],
      [700, 400],
      [720, 320],
      [730, 310],
    ].map(([x, y]) => ({ x: x!, y: y! }))
    // The classifier refuses it, which is correct -- it cannot see the nodes.
    expect(recognise(routed).kind).toBe('none')
    expect(isPurposeful(routed)).toBe(true)
  })

  it('REFUSES A BRACKET drawn round two things', () => {
    // The reviewer's counterexample, and the one that matters: a bracket's arms
    // are short and its spine long, so its total length is barely more than the
    // straight run between its ends. It passes the ratio comfortably. What it
    // does not do is set off towards where it ends up -- both arms point
    // outward, perpendicular to that line.
    const bracket = STROKES.find((s) => s.name === 'bracket-round-two-things')!
    expect(recognise(bracket.points).kind).toBe('none')
    expect(isPurposeful(bracket.points)).toBe(false)
  })

  it('refuses the corpus scribble', () => {
    const scribble = STROKES.find((s) => s.name === 'refuse-scribble')!
    expect(isPurposeful(scribble.points)).toBe(false)
  })

  it('refuses a stroke that returns to where it started', () => {
    const box = STROKES.find((s) => s.name === 'box-clockwise')!
    expect(isPurposeful(box.points)).toBe(false)
  })

  it('refuses a stroke too short to have gone anywhere', () => {
    expect(
      isPurposeful([
        { x: 0, y: 0 },
        { x: 3, y: 3 },
      ]),
    ).toBe(false)
  })

  it('accepts a routed connection whose FIRST move is towards the target', () => {
    // Deliberately NOT the `line-routed-around-obstacle` fixture: that one is a
    // C that comes back on itself, so its two ends are ~12 units apart and it
    // genuinely goes nowhere. `isPurposeful` refuses it, correctly. The real
    // routed case travels from one node to another around something in between.
    const routed = [
      [240, 310],
      [330, 311],
      [420, 309],
      [422, 400],
      [420, 480],
      [520, 482],
      [620, 479],
      [700, 400],
      [730, 310],
    ].map(([x, y]) => ({ x: x!, y: y! }))
    expect(isPurposeful(routed)).toBe(true)
  })

  it('refuses a C that comes back on itself, however direct its path', () => {
    const c = STROKES.find((s) => s.name === 'line-routed-around-obstacle')!
    expect(isPurposeful(c.points)).toBe(false)
  })

  it('accepts a plain straight line', () => {
    const line = STROKES.find((s) => s.name === 'line-straight')!
    expect(isPurposeful(line.points)).toBe(true)
  })
})
