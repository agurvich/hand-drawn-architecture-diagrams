import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { recognise } from '../recognise'
import { loadCorpus, type Point } from './loadCorpus'
import { LINES, MARKS, NOTES, RECTANGLES } from './labels'

/**
 * THE EXTRACTOR. Not a test of anything -- a tool that promotes labelled strokes
 * out of `docs/corpus/` into `__fixtures__/strokes/`, where `recognise.test.ts`
 * already reads them.
 *
 * It exists because every fixture that predates SPEC-017 was drawn by an agent
 * through CDP-synthesised pen events. That harness keeps tldraw's own smoothing
 * and encoding, which no hand-written point array reproduces -- but it has no
 * hand jitter and no pressure, and jitter is precisely what the classifier was
 * getting wrong. A recogniser tuned only against strokes an agent drew is tuned
 * against the author's idea of a rectangle.
 *
 * A VITEST TOOL RATHER THAN A `scripts/*.ts`, so it is typechecked and
 * prettier-checked like everything else. A bare .ts under `scripts/` is in no
 * tsconfig here and is prettier-ignored, so a type error in it would be invisible
 * to every gate -- and it would not run at all on Node 22.12 to 22.17, which
 * package.json admits.
 *
 * Inert in a normal run. To rewrite the fixtures:
 *   EXTRACT_FIXTURES=1 npx vitest run src/shared/sketch/__corpus__/extract.tool.test.ts
 */

const OUT = resolve(process.cwd(), 'src/shared/sketch/__fixtures__/strokes')

/** Matching the existing fixtures, which carry 2dp. */
const PRECISION = 2

interface Fixture {
  name: string
  expect: 'box' | 'line' | 'none'
  why: string
  via: 'ipad-pencil'
  points: Point[]
}

const round = (p: Point): Point => ({
  x: Number(p.x.toFixed(PRECISION)),
  y: Number(p.y.toFixed(PRECISION)),
})

/**
 * The fixture name, which is load-bearing twice over.
 *
 * `recognise.test.ts` selects its rotation-stability suite with
 * `name.startsWith('box-')` -- on the JSON field, not on the filename. A
 * rectangle promoted under any other name is silently exempt from a guarantee
 * SPEC-010 shipped, which is the quiet way a gate stops guarding. The filename
 * matches so that the two never drift.
 */
export function fixtureName(index: number, expected: 'box' | 'line' | 'none'): string {
  const prefix = expected === 'box' ? 'box' : expected === 'line' ? 'line' : 'refuse'
  return `${prefix}-pencil-${String(index).padStart(3, '0')}`
}

/**
 * Build one fixture, or throw.
 *
 * The verdict check runs on the ROUNDED points, so a fixture always describes
 * the stroke actually written to the file rather than the one in memory.
 */
export function buildFixture(
  index: number,
  points: readonly Point[],
  expected: 'box' | 'line' | 'none',
  note: string | undefined,
): Fixture {
  if (!note) {
    throw new Error(
      `corpus#${index} has no note in labels.ts. Every fixture's "why" is authored: it is what a ` +
        `failing run tells you about the stroke, and a generated placeholder makes them all read alike.`,
    )
  }
  const rounded = points.map(round)
  const verdict = recognise(rounded)
  if (verdict.kind !== expected) {
    throw new Error(
      `corpus#${index} is labelled ${expected} but the recogniser says ${verdict.kind}` +
        `${verdict.kind === 'none' ? ` (${verdict.because})` : ''}. Writing this fixture would ` +
        `assert something untrue -- fix the label or the classifier, not this file.`,
    )
  }
  return {
    name: fixtureName(index, expected),
    expect: expected,
    why: note,
    via: 'ipad-pencil',
    points: rounded,
  }
}

/** Prettier's own JSON output, so `format:check` stays green and a re-run is byte-identical. */
export function serialise(fixture: Fixture): string {
  return JSON.stringify(fixture, null, 2) + '\n'
}

describe.skipIf(!process.env.EXTRACT_FIXTURES)('extract pencil fixtures', () => {
  it('writes them', () => {
    const strokes = loadCorpus()
    const groups = [
      [RECTANGLES, 'box'],
      [LINES, 'line'],
      [MARKS, 'none'],
    ] as const
    let written = 0
    for (const [indices, expected] of groups) {
      for (const index of indices) {
        const fixture = buildFixture(index, strokes[index]!.points, expected, NOTES[index])
        writeFileSync(resolve(OUT, `${fixture.name}.json`), serialise(fixture))
        written++
      }
    }
    expect(written).toBe(RECTANGLES.length + LINES.length + MARKS.length)
  })
})

/**
 * The extractor's refusals, which run in the NORMAL suite.
 *
 * A gate is not tested by running it on the thing it guards: the extraction
 * above passes because the labels happen to be right, and proves nothing about
 * whether a wrong one would be caught. These plant each way it can go wrong,
 * and one case that must stay silent.
 */
describe('the extractor refuses to write a fixture that asserts something untrue', () => {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 120 },
    { x: 0, y: 120 },
    { x: 0, y: 0 },
  ]

  it('throws when the label disagrees with the recogniser', () => {
    expect(() =>
      buildFixture(9, square, 'line', 'A square, deliberately mislabelled as a line.'),
    ).toThrow(/labelled line but the recogniser says box/)
  })

  it('throws when a promoted stroke has no authored note', () => {
    expect(() => buildFixture(9, square, 'box', undefined)).toThrow(/has no note in labels.ts/)
  })

  it('stays silent when the label is right', () => {
    const fixture = buildFixture(9, square, 'box', 'An ordinary rectangle, correctly labelled.')
    expect(fixture.name).toBe('box-pencil-009')
    expect(fixture.via).toBe('ipad-pencil')
    expect(serialise(fixture).endsWith('\n')).toBe(true)
  })

  it('checks the verdict against the ROUNDED points, not the originals', () => {
    // A fixture whose stored points classify differently from the ones checked
    // would assert something the file itself disproves.
    const fixture = buildFixture(9, square, 'box', 'An ordinary rectangle, correctly labelled.')
    expect(recognise(fixture.points).kind).toBe('box')
    expect(fixture.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })

  it('names a rectangle so the rotation suite selects it', () => {
    // `recognise.test.ts` filters that suite on `name.startsWith('box-')`. A
    // rectangle named anything else is silently exempt from a SPEC-010
    // guarantee, which is the quiet way a gate stops guarding.
    expect(fixtureName(55, 'box')).toBe('box-pencil-055')
    expect(fixtureName(36, 'line')).toBe('line-pencil-036')
    expect(fixtureName(3, 'none')).toBe('refuse-pencil-003')
  })
})
