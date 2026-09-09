import { describe, it, expect } from 'vitest'
import { recognise, isPurposeful, type Point } from '@shared/sketch'
import { loadCorpus } from '@shared/sketch/__corpus__/loadCorpus'
import { ARROWS, RECTANGLES } from '@shared/sketch/__corpus__/labels'
import { DefaultColorStyle } from 'tldraw'
import {
  shouldConnect,
  kindForStrokeColour,
  kindsForStrokeColour,
  MAPPED_STROKE_COLOURS,
  COLOUR_REACHABLE_KINDS,
} from './convertPolicy'

/**
 * THE REGRESSION THIS SPEC'S OWN SUCCESS CREATES.
 *
 * `convertStroke` turns a stroke into a connection when its two ends resolve to
 * two different nodes, whatever the classifier said about its shape. That rule
 * was inert for as long as recognition did not work: nothing on the iPad canvas
 * was a node, so it never fired. Recognising the twelve rectangles is what arms
 * it -- and 264 of the 276 strokes on that page are handwriting sitting inside
 * and between those very rectangles.
 *
 * So this replays the whole drawing against the nodes the drawing produces, and
 * asserts what converts. Measured, the answer is good: the three strokes that
 * convert are the two orange arrows and the green one, which `docs/corpus/
 * README.md` records as his own unprompted convention for a transfer and a
 * permission. Not one piece of handwriting is eaten.
 *
 * It passes today. It does not pass on `main`, where nothing is recognised and
 * nothing converts, and it will stop passing the moment somebody loosens
 * `isPurposeful`, the override, or the classifier in a way that reaches into the
 * handwriting. That is what it is for.
 */

interface Node {
  index: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  area: number
}

const strokes = loadCorpus()

const nodes: Node[] = RECTANGLES.map((index) => {
  const verdict = recognise(strokes[index]!.points)
  if (verdict.kind !== 'box') throw new Error(`corpus#${index} is not recognised as a box`)
  const { min, max } = verdict
  return {
    index,
    minX: min.x,
    minY: min.y,
    maxX: max.x,
    maxY: max.y,
    area: (max.x - min.x) * (max.y - min.y),
  }
})

/**
 * Which node is under a point.
 *
 * A STAND-IN, and the difference is worth naming. The runtime's `nodeAtPoint`
 * is `getShapeAtPoint({ hitInside: true })`, which returns the TOPMOST shape;
 * this returns the innermost containing one. They agree except where node
 * rectangles overlap without nesting. Driving the real one needs a live tldraw
 * `Editor`, which no unit test in this repo builds (see `App.test.tsx`) -- the
 * real hit test is covered end to end by SPEC-010's e2e.
 *
 * What is NOT a stand-in is the decision itself: `shouldConnect` below is the
 * same function `convertStroke` calls.
 */
function nodeAt(p: Point): Node | undefined {
  const hits = nodes.filter((n) => p.x >= n.minX && p.x <= n.maxX && p.y >= n.minY && p.y <= n.maxY)
  return hits.length ? hits.reduce((a, b) => (a.area <= b.area ? a : b)) : undefined
}

function converting(): number[] {
  const out: number[] = []
  for (const stroke of strokes) {
    if ((RECTANGLES as readonly number[]).includes(stroke.index)) continue
    const first = stroke.points[0]!
    const last = stroke.points[stroke.points.length - 1]!
    const decision = shouldConnect(
      recognise(stroke.points),
      isPurposeful(stroke.points),
      nodeAt(first)?.index.toString(),
      nodeAt(last)?.index.toString(),
    )
    if (decision.connect) out.push(stroke.index)
  }
  return out
}

describe('recognition does not eat the handwriting it is now surrounded by', () => {
  it('converts exactly the three strokes he drew as arrows', () => {
    // The SET, not the count: a different three would satisfy a count, and a
    // different three is precisely what a regression here would produce.
    expect(converting()).toEqual([...ARROWS])
  })

  it('and every one of them is a stroke he coloured', () => {
    // 269 of the 276 strokes are black. He reached for orange and light-green
    // unprompted, for movement and for permission. That the converting set is a
    // subset of the coloured one is not a coincidence to assert loosely -- it is
    // the evidence that the rule is finding intent rather than shape.
    for (const index of converting()) expect(strokes[index]!.colour).not.toBe('black')
  })

  it('and leaves every piece of handwriting exactly as drawn', () => {
    const converted = new Set(converting())
    const nodeSet = new Set<number>(RECTANGLES)
    const untouched = strokes.filter((s) => !converted.has(s.index) && !nodeSet.has(s.index))
    expect(untouched).toHaveLength(276 - RECTANGLES.length - ARROWS.length)
    expect(untouched.filter((s) => s.colour === 'black')).toHaveLength(
      strokes.filter((s) => s.colour === 'black').length - RECTANGLES.length,
    )
  })

  it('refuses a stroke that wandered across two nodes rather than crossing them', () => {
    // The annotation-eating failure in its own costume, planted rather than
    // waited for: a refused verdict only outweighs the classifier for a stroke
    // that actually went somewhere.
    const wander = recognise([
      { x: 0, y: 0 },
      { x: 5, y: 40 },
      { x: 0, y: 0 },
    ])
    expect(shouldConnect(wander, false, 'a', 'b').connect).toBe(false)
    expect(shouldConnect(wander, true, 'a', 'b').connect).toBe(true)
  })

  it('refuses when either end is over nothing, or both are over the same node', () => {
    const box = recognise(strokes[RECTANGLES[0]]!.points)
    expect(shouldConnect(box, true, undefined, 'b').connect).toBe(false)
    expect(shouldConnect(box, true, 'a', undefined).connect).toBe(false)
    expect(shouldConnect(box, true, 'a', 'a').connect).toBe(false)
  })
})

describe('SPEC-018 FR-004 — the colour he drew in picks the kind', () => {
  /** Every stroke that converts, with the kinds it would be created with. */
  function convertedKinds(): Record<number, string[]> {
    const out: Record<number, string[]> = {}
    for (const index of converting()) out[index] = kindsForStrokeColour(strokes[index]!.colour)
    return out
  }

  it('gives his three arrows the kinds his own colours name', () => {
    // MEASURED against the drawing, not against an invented example. Two orange
    // transfers between buckets and one light-green line from an IAM role to
    // the transfer it authorises -- which is SPEC-011's feature drawn by hand,
    // because he never found the dropdown.
    expect(convertedKinds()).toEqual({ 80: ['data'], 188: ['data'], 259: ['permission'] })
  })

  it('gives NOTHING a kind that does not become a connection', () => {
    // The failure this guards is a rule that reads colour before it reads
    // intent: 7 strokes are coloured and only 3 of them are connections, so a
    // kind appearing on a fourth means something started converting that
    // should not have.
    expect(Object.keys(convertedKinds())).toHaveLength(ARROWS.length)
  })

  it('does not change WHICH strokes convert', () => {
    // Colour is read after the decision, never as part of it. The assertion
    // above this describe block is the real check; this states the dependency
    // so a future rule that lets colour influence conversion reddens here too.
    expect(converting()).toEqual([...ARROWS])
  })

  it('leaves a converting stroke in an unmapped colour with no kinds', () => {
    // A CONSTRUCTED case, because the corpus cannot tick this one: every stroke
    // that converts there is coloured. Black is the interesting input -- it is
    // 269 of the 276 strokes and the default pen.
    expect(kindsForStrokeColour('black')).toEqual([])
    expect(kindsForStrokeColour('blue')).toEqual([])
    expect(kindsForStrokeColour(undefined)).toEqual([])
    expect(kindForStrokeColour('black')).toBeNull()
  })

  it('reads colours tldraw actually produces, so a typo cannot hide as a refusal', () => {
    // The criterion that bites. `lightgreen` for `light-green` answers "no kind"
    // exactly as a deliberate omission does, so no test of the map's own
    // behaviour can see it -- only checking the keys against tldraw's own list.
    for (const colour of MAPPED_STROKE_COLOURS) {
      expect(DefaultColorStyle.values as readonly string[]).toContain(colour)
    }
  })

  it('reaches data and permission from a colour, and sequence only from the panel', () => {
    // Stated so the asymmetry is deliberate rather than an oversight: he never
    // gave sequence a colour of its own -- he drew it in black, which is the
    // default pen and therefore not a choice.
    expect([...COLOUR_REACHABLE_KINDS]).toEqual(['data', 'permission'])
  })
})
