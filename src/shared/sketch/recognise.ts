/**
 * SKETCH RECOGNITION: a stroke in, one of three verdicts out.
 *
 * Pure, and it imports nothing. That is not tidiness -- it is the only way a
 * recogniser gets TUNED rather than guessed at, because it lets the whole thing
 * run against a corpus of recorded strokes in a unit test. It is also
 * NODE-BLIND: it never asks what is on the canvas. The client adapter is what
 * knows about nodes, and FR-003 has it override a box verdict when a stroke's
 * two ends land in two different nodes.
 *
 * "Nothing" is the DEFAULT, not the error path. This app deliberately keeps
 * hand-drawn work, and a false positive here silently eats an annotation -- so
 * the bar for converting is "unambiguous", not "most likely".
 */

export interface Point {
  x: number
  y: number
}

export type Verdict =
  | { kind: 'box'; min: Point; max: Point }
  | { kind: 'line'; from: Point; to: Point }
  | { kind: 'none'; because: string }

/**
 * Ramer-Douglas-Peucker tolerance, in shape-local units.
 *
 * Measured against the corpus: tldraw's own smoothing already resamples a
 * stroke down to ~5-15 points, so this is removing the wobble it left, not
 * doing the heavy lifting. Raise it and a real corner rounds away; lower it and
 * a shaky edge grows a phantom one.
 */
export const SIMPLIFY_EPSILON = 8

/**
 * Below this extent in BOTH axes, a stroke is a dot or a tap.
 *
 * Deliberately not the same threshold as MIN_BOX_EXTENT: a scribble 30px across
 * is a real mark that should stay a mark, whereas a 30px box is a node nobody
 * can see. Two different questions, two constants.
 */
export const MIN_STROKE_EXTENT = 12

/**
 * A stroke smaller than this in either axis is refused as a BOX even though it
 * is a real mark. The default node is 200x120; a box this small produces a node
 * that cannot be read, selected on a touch target, or usefully nested.
 */
export const MIN_BOX_EXTENT = 40

/**
 * A path whose endpoints are within this fraction of its diagonal is CLOSED.
 *
 * Generous on purpose -- a hand lifts early far more often than it overshoots,
 * and the corners test below is what actually rejects non-boxes.
 */
export const CLOSE_FRACTION = 0.28

/**
 * How far a simplified corner count may stray from four and still be a box.
 *
 * One, not two. At two a triangle (3) and a pentagon-ish scribble (6) both pass
 * the count, and the corpus's `refuse-triangle` is exactly that miss.
 */
export const CORNER_TOLERANCE = 1

/**
 * How square a box's corners must be, on average, in degrees away from 90.
 *
 * What this actually refuses, measured by relaxing it one constant at a time:
 * `refuse-spiral` and `refuse-triangle`. (An earlier comment here credited it
 * with `refuse-bad-box`, which is in fact refused on its corner COUNT -- the
 * sort of claim that is only ever checked by relaxing the number and seeing
 * what moves.)
 */
export const MAX_MEAN_CORNER_ERROR = 22

/**
 * How much of its own bounding box a closed stroke must fill to be a rectangle.
 *
 * This is the test that knows a rectangle from any other quadrilateral-ish
 * closed shape, and the corner count and squareness tests cannot do it: a
 * regular PENTAGON turns 72 degrees at each corner, which is 18 away from
 * square and inside MAX_MEAN_CORNER_ERROR, and CORNER_TOLERANCE admits five
 * corners because real hand-drawn boxes sometimes simplify to five. So a
 * pentagon -- a house, an arrow head, a cloud outline -- passed every other
 * test and became a node.
 *
 * A rectangle fills its bounding box completely; a pentagon fills about 0.73 of
 * it, a triangle about 0.5. 0.82 leaves room for a hand-drawn box with bowed
 * edges and rounded corners without admitting a shape that is a different shape.
 */
export const MIN_BOX_FILL = 0.82

/**
 * How straight a line must be: the greatest distance any point strays from the
 * straight run between the ends, as a fraction of that run's length.
 *
 * Measured: relaxing this frees `refuse-bowed-line` and nothing else. (An
 * earlier comment credited it with `refuse-squiggly-underline`, which is in fact
 * refused for doubling back -- MAX_LINE_BACKTRACK_FRACTION's pin, not this
 * one's.)
 */
export const MAX_LINE_DEVIATION_FRACTION = 0.12

/** How much of its own length a line may double back over and still be a line. */
export const MAX_LINE_BACKTRACK_FRACTION = 0.25

/**
 * How far round a stroke must already have travelled before a return to its
 * start counts as CLOSING it rather than as an early wobble near the origin.
 *
 * A hand does not stop dead on the corner it started at -- it carries past. The
 * corpus's `box-overshot-corner` ends 55 units beyond its own start, and that
 * tail reads as two extra corners unless it is trimmed off.
 */
export const CLOSING_TRAVEL_FRACTION = 0.6

/**
 * How much longer than the straight run between its ends a path may be and
 * still count as PURPOSEFUL -- a stroke that set out from one place and arrived
 * at another, rather than one that wandered.
 *
 * Generous, because a connection routed around an obstacle genuinely detours:
 * right, down, right measures about 1.5x its own span. A scribble over the same
 * two points measures three to five times it, and crosses itself doing so.
 *
 * This exists for the CLIENT's override, not for classification: `isPurposeful`
 * is what lets "both ends landed in two different nodes" outweigh a refusal,
 * without letting a scribble drawn across two nodes become a connection.
 */
export const MAX_PURPOSEFUL_PATH_FRACTION = 2.5

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Perpendicular distance from `p` to the infinite line through `a` and `b`. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return distance(p, a)
  // Clamped, so this is distance to the SEGMENT rather than to the infinite
  // line: an unclamped version reports a point beyond an endpoint as closer
  // than it is, which makes a hooked stroke look straight.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/**
 * Ramer-Douglas-Peucker. Iterative rather than recursive: a stroke held down
 * for a long time can carry thousands of points, and the recursive form is one
 * pathological input away from blowing the stack inside a pointer handler.
 */
export function simplify(points: readonly Point[], epsilon = SIMPLIFY_EPSILON): Point[] {
  if (points.length < 3) return [...points]

  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true

  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let furthest = -1
    let furthestDistance = 0
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i]!, points[first]!, points[last]!)
      if (d > furthestDistance) {
        furthestDistance = d
        furthest = i
      }
    }
    if (furthestDistance > epsilon && furthest > 0) {
      keep[furthest] = true
      stack.push([first, furthest], [furthest, last])
    }
  }

  return points.filter((_, i) => keep[i]!)
}

function bounds(points: readonly Point[]): { min: Point; max: Point } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}

/** The angle at `b`, in degrees, of the turn from a->b->c. 0 is straight on. */
function turnAngle(a: Point, b: Point, c: Point): number {
  const angle = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x)
  const degrees = Math.abs((angle * 180) / Math.PI)
  return degrees > 180 ? 360 - degrees : degrees
}

/**
 * Corners of a CLOSED path, treating it as a cycle so the start point is judged
 * like any other. Without that, a box started mid-edge reports a phantom corner
 * where the pen began -- which the corpus's `box-started-mid-edge` catches.
 */
function closedCorners(path: readonly Point[]): number[] {
  const n = path.length
  const angles: number[] = []
  for (let i = 0; i < n; i++) {
    const a = path[(i - 1 + n) % n]!
    const b = path[i]!
    const c = path[(i + 1) % n]!
    angles.push(turnAngle(a, b, c))
  }
  return angles
}

/** Shoelace area of a closed polygon, always positive. */
function polygonArea(points: readonly Point[]): number {
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    twice += a.x * b.y - b.x * a.y
  }
  return Math.abs(twice) / 2
}

function pathLength(points: readonly Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!)
  return total
}

/**
 * Drop the overshoot: if the stroke comes back to its own start after going
 * most of the way round, everything after that is the hand carrying past.
 *
 * Without this a box whose pen ran on past the closing corner reports the tail
 * as two extra corners and is refused -- which is the commonest way a real
 * rectangle is drawn, not an exotic case.
 */
export function trimOvershoot(points: readonly Point[], closeDistance: number): readonly Point[] {
  const total = pathLength(points)
  if (total === 0) return points
  let travelled = 0
  for (let i = 1; i < points.length; i++) {
    travelled += distance(points[i - 1]!, points[i]!)
    if (
      travelled >= total * CLOSING_TRAVEL_FRACTION &&
      distance(points[i]!, points[0]!) <= closeDistance
    ) {
      return points.slice(0, i + 1)
    }
  }
  return points
}

/**
 * Classify a stroke.
 *
 * Order is box-then-line, and that is safe ONLY because the client adapter
 * overrides a box verdict when the stroke's two ends resolve to two different
 * nodes (FR-003). A pure order rule alone would call a connection routed around
 * an obstacle a box; the corpus pins that verdict deliberately, so the override
 * has something to override.
 */
export function recognise(points: readonly Point[]): Verdict {
  if (points.length < 3) return { kind: 'none', because: 'too few points' }

  const box = bounds(points)
  const width = box.max.x - box.min.x
  const height = box.max.y - box.min.y
  if (width < MIN_STROKE_EXTENT && height < MIN_STROKE_EXTENT) {
    return { kind: 'none', because: 'a dot, not a shape' }
  }

  const diagonal = Math.hypot(width, height)
  const closeDistance = diagonal * CLOSE_FRACTION
  const trimmed = trimOvershoot(points, closeDistance)
  const path = simplify(trimmed)
  const first = path[0]!
  const last = path[path.length - 1]!
  const closed = distance(first, last) <= closeDistance

  if (closed) {
    // Drop a duplicated closing point so the cycle is not judged twice.
    const cycle = distance(first, last) < SIMPLIFY_EPSILON ? path.slice(0, -1) : path
    const angles = closedCorners(cycle)
    // A "corner" is a turn of more than 45 degrees. Below that a hand-drawn
    // edge is bending, not turning.
    const corners = angles.filter((a) => a > 45)
    if (Math.abs(corners.length - 4) > CORNER_TOLERANCE) {
      return { kind: 'none', because: `closed, but ${corners.length} corners` }
    }
    if (corners.length === 4) {
      const meanError = corners.reduce((sum, a) => sum + Math.abs(a - 90), 0) / corners.length
      if (meanError > MAX_MEAN_CORNER_ERROR) {
        return { kind: 'none', because: 'closed with four corners, but not square enough' }
      }
    } else {
      // 3 or 5 corners: admitted by the tolerance, so hold them to the same
      // squareness bar rather than waving them through on the count alone.
      const meanError = angles
        .filter((a) => a > 45)
        .reduce((sum, a, _, all) => sum + Math.abs(a - 90) / all.length, 0)
      if (meanError > MAX_MEAN_CORNER_ERROR) {
        return { kind: 'none', because: 'closed, but not a rectangle' }
      }
    }
    // FILLS ITS BOUNDING BOX. The corner tests above admit any closed shape with
    // roughly four square-ish turns, and a pentagon clears both of them.
    const fill = polygonArea(cycle) / Math.max(width * height, 1)
    if (fill < MIN_BOX_FILL) {
      return { kind: 'none', because: 'closed and square-ish, but not a rectangle' }
    }
    if (width < MIN_BOX_EXTENT || height < MIN_BOX_EXTENT) {
      return { kind: 'none', because: 'too small to be a usable node' }
    }
    return { kind: 'box', min: box.min, max: box.max }
  }

  // Open: a line if the path barely strays from the straight run between its
  // ends, and does not double back over itself.
  const span = distance(first, last)
  if (span < MIN_STROKE_EXTENT) return { kind: 'none', because: 'open but goes nowhere' }

  let deviation = 0
  for (const p of points) {
    const d = distanceToSegment(p, first, last)
    if (d > deviation) deviation = d
  }
  if (deviation > span * MAX_LINE_DEVIATION_FRACTION) {
    return { kind: 'none', because: 'open, but not straight enough' }
  }
  if (pathLength(points) > span * (1 + MAX_LINE_BACKTRACK_FRACTION)) {
    return { kind: 'none', because: 'open and straight, but doubles back' }
  }

  return { kind: 'line', from: first, to: last }
}

/**
 * Did this stroke go somewhere, or did it wander?
 *
 * Node-blind like everything else here, and deliberately NOT part of
 * `recognise`: it answers a different question. The classifier asks "what shape
 * is this"; this asks "was this a journey from one end to the other". The client
 * needs the second when it can see that a stroke's two ends landed in two
 * different nodes -- that is unambiguous connection evidence, and it has to be
 * able to outweigh a refusal without also promoting a scribble.
 */
export function isPurposeful(points: readonly Point[]): boolean {
  if (points.length < 2) return false
  const span = distance(points[0]!, points[points.length - 1]!)
  if (span < MIN_STROKE_EXTENT) return false
  return pathLength(points) <= span * MAX_PURPOSEFUL_PATH_FRACTION
}
