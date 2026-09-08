import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import {
  recognise,
  measure,
  trimOvershoot,
  CLOSE_FRACTION,
  MAX_MEAN_CORNER_ERROR,
  type Point,
} from '../recognise'
import { loadCorpus, CORPUS_FILE } from './loadCorpus'
import { RECTANGLES } from './labels'

/**
 * THE CORPUS AS A SCORED POPULATION.
 *
 * The 24 fixtures in `__fixtures__/strokes/` are the classifier's unit tests;
 * this is its measurement. A change that improves the fixtures while regressing
 * 276 real strokes is invisible to everything else in the repo, and that is
 * precisely the change this file exists to redden.
 *
 * PROVENANCE OF THE NUMBERS BELOW. They are a property of a pair -- the corpus
 * and the code -- and only one half of that pair can be named here: the corpus
 * is frozen at `docs/corpus/ipad-aws-2026-09-07.room.json`. A commit cannot name
 * its own sha, and each number is true only *after* the change that lands it, so
 * a parent sha would be wrong at every re-pin. `git log -p` on this file is the
 * record of when each number moved and why.
 */

const ROOT = process.cwd()

/**
 * The five ways the suite looks at one rectangle: as drawn, reversed, and
 * started from three other points on its own perimeter.
 *
 * The rotations match `recognise.test.ts`'s rotation suite exactly, including
 * trimming the overshoot before rotating -- you cannot start a stroke halfway
 * through your own overshoot, so rotating an untrimmed list produces a gesture
 * no hand can make.
 */
export function orientations(points: readonly Point[]): Point[][] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY)
  const loop = [...trimOvershoot(points, diagonal * CLOSE_FRACTION)]
  const n = loop.length
  const out: Point[][] = [[...points], [...points].reverse()]
  for (const offset of [Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)]) {
    const cycle = [...loop.slice(offset), ...loop.slice(0, offset)]
    cycle.push(cycle[0]!)
    out.push(cycle)
  }
  return out
}

/**
 * The report. Written to stdout directly: vitest's default reporter swallows
 * `console.log` from a PASSING test, and a report only visible under
 * `--reporter=verbose` is a report nobody reads.
 *
 * Fill is emitted in all five orientations with the minimum, not just as
 * drawn. `MIN_BOX_FILL`'s margin is set by the lowest value a rectangle reaches
 * in ANY orientation, and that number does not appear in a forward-only pass --
 * so a forward-only column would let the threshold's justification be ticked
 * while the figure justifying it is absent.
 *
 * The rows are the ones that DECIDE the margin: the twelve rectangles, which
 * set the upper edge, and every stroke the fill test itself refuses, which sets
 * the lower one. Both margins are re-derivable from them. The other ~250 rows
 * are refused before fill is consulted and would bury the report in every test
 * run -- `CORPUS_REPORT=full` prints them when the question is about something
 * else.
 */
function emitReport(): void {
  const strokes = loadCorpus()
  const reasons = new Map<string, number>()
  const lines: string[] = []
  const full = process.env.CORPUS_REPORT === 'full'
  for (const stroke of strokes) {
    const verdict = recognise(stroke.points)
    const key = verdict.kind === 'none' ? verdict.because : verdict.kind
    reasons.set(key, (reasons.get(key) ?? 0) + 1)
    const decidesMargin =
      (RECTANGLES as readonly number[]).includes(stroke.index) ||
      key === 'closed and square-ish, but not a rectangle'
    if (!full && !decidesMargin) continue
    const fills = orientations(stroke.points).map((o) => measure(o)?.fill)
    const reached = fills.filter((f): f is number => f !== undefined)
    if (reached.length === 0) continue
    lines.push(
      `  ${String(stroke.index).padStart(3)} ` +
        `${fills.map((f) => (f === undefined ? '  open' : f.toFixed(4))).join(' ')}` +
        `  min=${Math.min(...reached).toFixed(4)}  ${key}`,
    )
  }
  const out = [
    '',
    `corpus report — ${CORPUS_FILE}`,
    '  verdicts:',
    ...[...reasons]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `    ${String(n).padStart(4)} ${k}`),
    `  fill by orientation (as drawn, reversed, +n/4, +n/2, +3n/4) — ${
      full ? 'every stroke reaching the fill test' : 'the rows that decide the margin'
    }:`,
    ...lines,
    '',
  ].join('\n')
  process.stdout.write(out)
}

describe('the recorded corpus', () => {
  it('decodes 276 strokes from the room snapshot', () => {
    const strokes = loadCorpus()
    expect(strokes).toHaveLength(276)
    expect(CORPUS_FILE).toBe('docs/corpus/ipad-aws-2026-09-07.room.json')
    // Page space, not shape-local: the drawing spans thousands of units and
    // does not start at the origin. A loader that forgot `shape.x`/`shape.y`
    // would put every stroke near (0,0) and still decode 276 of them.
    const xs = strokes.flatMap((s) => s.points.map((p) => p.x))
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1000)
  })

  it('classifies every stroke, and the tally is exactly this', () => {
    const tally = { box: 0, line: 0, none: 0 }
    for (const stroke of loadCorpus()) tally[recognise(stroke.points).kind]++
    expect(tally).toEqual({ box: 12, line: 82, none: 182 })
  })

  it('emits the report the tuning numbers are read off', () => {
    emitReport()
    // The report is evidence, not an assertion; this pins that it runs and that
    // every stroke reaching the fill test is measurable in all five orientations
    // -- the property FR-002's margin is computed over.
    const measurable = loadCorpus().filter((s) => measure(s.points) !== undefined)
    expect(measurable.length).toBeGreaterThan(0)
    for (const index of RECTANGLES) {
      const stroke = loadCorpus()[index]!
      for (const o of orientations(stroke.points)) expect(measure(o)).toBeDefined()
    }
  })

  it('recognises exactly the strokes that are rectangles', () => {
    const found = loadCorpus()
      .filter((s) => recognise(s.points).kind === 'box')
      .map((s) => s.index)
    // The SET, not the count: a different twelve would satisfy a count.
    // The SET, not the count. A different twelve would satisfy a count, and
    // "twelve boxes" is exactly what a recogniser that had started eating
    // handwriting would also report.
    expect(found).toEqual([...RECTANGLES])
  })
})

describe('the corners of a hand-drawn rectangle', () => {
  const strokes = loadCorpus()

  it('every rectangle has exactly four of them', () => {
    for (const index of RECTANGLES) {
      const m = measure(strokes[index]!.points)
      expect(m, `corpus#${index} is not closed`).toBeDefined()
      expect(m!.corners, `corpus#${index}`).toBe(4)
    }
  })

  it('and every one is square, by the bar the classifier already used', () => {
    // The count was never the problem: it is 4 on the current code too. What
    // was wrong is the ANGLE, inflated by summing tremor as magnitude. Measured
    // before the fix: 16.2 to 81.3 degrees away from square, ten of the twelve
    // over the 22 the classifier allows.
    for (const index of RECTANGLES) {
      expect(measure(strokes[index]!.points)!.meanCornerError, `corpus#${index}`).toBeLessThan(
        MAX_MEAN_CORNER_ERROR,
      )
    }
  })

  it('is a box from every direction and every starting corner', () => {
    /*
     * SPEC-010 FR-001: a verdict is stable under reversal and rotation. This is
     * that guarantee against real pencil strokes rather than mouse-drawn ones,
     * and it is the ONLY thing in the suite that pins `trimBothEnds` -- the
     * whole-corpus tally above is identical with overshoot trimmed forward-only,
     * and so are the 24 fixtures.
     *
     * Both ways it can fail were live during this spec: forward-only trimming
     * loses 84, 98 and 162 reversed, and a head trim capped short enough to eat
     * an edge loses 55 rotated.
     */
    for (const index of RECTANGLES) {
      for (const [i, o] of orientations(strokes[index]!.points).entries()) {
        expect(recognise(o).kind, `corpus#${index} orientation ${i}`).toBe('box')
      }
    }
  })

  it('and measures the same square whichever way the stroke was drawn', () => {
    // SPEC-010 FR-001's stability guarantee, at the level of the number rather
    // than the verdict: a rectangle drawn backwards is the same rectangle.
    for (const index of RECTANGLES) {
      const forward = measure(strokes[index]!.points)!.meanCornerError
      const backward = measure([...strokes[index]!.points].reverse())!.meanCornerError
      expect(Math.abs(forward - backward), `corpus#${index}`).toBeLessThanOrEqual(10)
    }
  })
})

/**
 * THE FENCE AROUND THIS FOLDER.
 *
 * `loadCorpus` reads `docs/` with `node:fs`. Nothing that ships may reach it --
 * not because the import would fail, but because `src/shared` is imported by the
 * Worker, where `docs/` does not exist and `node:fs` is not the same module.
 *
 * `shared-imports.test.ts` exempts this directory from the import fence; this is
 * the narrower guard that pays for the exemption.
 */
const CORPUS_DIR = resolve(ROOT, 'src/shared/sketch/__corpus__')

function shippingFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!['.ts', '.tsx'].includes(extname(full))) continue
      if (/\.test\.tsx?$/.test(full)) continue // tests may read the corpus
      if (full.startsWith(CORPUS_DIR)) continue // the folder itself
      out.push(full)
    }
  }
  for (const root of ['src/client', 'src/worker', 'src/shared']) walk(resolve(ROOT, root))
  return out
}

/**
 * The check as a function, so the fixture below can plant a violation against
 * it. A gate is not tested by running it on the thing it guards -- run over the
 * repo it proves the repo is clean, and says nothing about whether it still
 * fires.
 */
function filesImportingCorpus(files: { path: string; text: string }[]): string[] {
  return files
    .filter(({ text }) => /from\s+'[^']*__corpus__[^']*'/.test(text))
    .map(({ path }) => path)
}

describe('nothing that ships imports the corpus', () => {
  it('holds across the repo', () => {
    const files = shippingFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    expect(filesImportingCorpus(files)).toEqual([])
  })

  it('bites a shipping file that imports it', () => {
    const planted = [
      {
        path: 'src/client/Bad.ts',
        text: "import { loadCorpus } from '@shared/sketch/__corpus__/loadCorpus'\n",
      },
      {
        path: 'src/worker/Bad.ts',
        text: "import { RECTANGLES } from '../shared/sketch/__corpus__/labels'\n",
      },
    ]
    expect(filesImportingCorpus(planted)).toEqual(['src/client/Bad.ts', 'src/worker/Bad.ts'])
  })

  it('stays silent on what is allowed', () => {
    // A corpus of only-failures cannot see a false positive, and a false
    // positive here would forbid the tests that are the point of the folder.
    const clean = [
      {
        path: 'src/client/Fine.ts',
        text: "import { recognise } from '@shared/sketch/recognise'\n",
      },
      { path: 'src/shared/sketch/mode.ts', text: "import { x } from './corpus-shaped-name'\n" },
      { path: 'src/client/Words.ts', text: 'const note = "see __corpus__ for the strokes"\n' },
    ]
    expect(filesImportingCorpus(clean)).toEqual([])
  })

  it('the walk actually reaches the shipping code it claims to cover', () => {
    // Without this the guard above passes vacuously if `shippingFiles` returns
    // nothing -- the failure mode a gate cannot report about itself.
    const files = shippingFiles()
    expect(files.length).toBeGreaterThan(30)
    expect(files.some((f) => f.endsWith('recogniseOnDraw.ts'))).toBe(true)
    expect(files.some((f) => f.includes('__corpus__'))).toBe(false)
    expect(files.some((f) => /\.test\.tsx?$/.test(f))).toBe(false)
  })
})
