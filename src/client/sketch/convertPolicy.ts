import type { Verdict } from '@shared/sketch'
import { EDGE_KINDS, type EdgeKind } from '@shared/shapes'

/**
 * WHEN A STROKE BECOMES A CONNECTION, as a decision on its own.
 *
 * Lifted out of `convertStroke` so it can be replayed against the recorded
 * corpus without a live editor. That is not a testing convenience: this rule is
 * the one that can eat somebody's handwriting, and until sketch recognition
 * worked it was unreachable -- nothing on the canvas was a node, so the override
 * never fired and no test could tell whether it was safe. Recognising boxes is
 * what arms it.
 *
 * The rule itself is SPEC-010 FR-003's: a stroke whose two ends resolve to two
 * DIFFERENT nodes is a connection, whatever the classifier said about its shape.
 * A connection routed around an obstacle is either a closed rectangle-ish path
 * or an open one too bent to be a line, and the node-blind classifier is right
 * about the shape and wrong about the intent both times. `purposeful` is what
 * stops that outweighing a refusal for a stroke that merely wandered across two
 * nodes.
 */
export type ConnectionDecision<Id extends string = string> =
  { connect: true; fromId: Id; toId: Id } | { connect: false }

/**
 * A discriminated result rather than a boolean.
 *
 * "No node under that end" is the COMMON case and the main reason this returns
 * false, so the ids are optional going in. A bare boolean would leave the caller
 * to narrow them again afterwards, which is half of this rule restated at the
 * call site -- and a type predicate cannot do it either, since a predicate
 * narrows one parameter and this decision is about two.
 *
 * Generic over the id, so the caller's branded `TLShapeId` survives the round
 * trip. Widening to `string` here would push a cast back to the call site, which
 * is the same leak in a different shape.
 */
export function shouldConnect<Id extends string>(
  verdict: Verdict,
  purposeful: boolean,
  fromId: Id | undefined,
  toId: Id | undefined,
): ConnectionDecision<Id> {
  if (!fromId || !toId || fromId === toId) return { connect: false }
  if (verdict.kind === 'none' && !purposeful) return { connect: false }
  return { connect: true, fromId, toId }
}

/**
 * WHAT COLOUR MEANS, when a stroke becomes a connection.
 *
 * Drawing the first real diagram on the iPad, the project owner typed his edges
 * with colour without being asked to: orange for data movement, light-green for
 * permission. Both are in `docs/corpus/` -- four orange strokes and three
 * light-green ones among 276 -- and the three of them that become connections
 * are exactly the three coloured strokes the recogniser converts.
 *
 * BLACK IS NOT IN THE MAP, and that is the one place this departs from what he
 * said ("black for structure and sequence"). Black is the default pen, so a
 * black stroke records no decision; if it meant `sequence`, every connection
 * ever sketched would claim to be a step in a sequence and the drawing path
 * would have no way to make one that claims nothing. `sequence` is set in the
 * panel instead. This is the spec's call rather than his -- see `decisions.md`
 * -> *An edge carries a set of kinds* -- and it is one line to reverse.
 *
 * Keyed by tldraw's own colour names. `kindForStrokeColour.test.ts` checks each
 * key against `DefaultColorStyle.values`, because a typo here -- `lightgreen`
 * for `light-green` -- answers "no kind" exactly as a deliberate omission does.
 */
const KIND_BY_COLOUR: Readonly<Record<string, EdgeKind>> = {
  orange: 'data',
  'light-green': 'permission',
}

/** The kind a stroke's colour asks for, or null -- which includes black. */
export function kindForStrokeColour(colour: string | undefined): EdgeKind | null {
  return (colour !== undefined && KIND_BY_COLOUR[colour]) || null
}

/**
 * The kinds to create a converted connection with.
 *
 * A list rather than the kind itself, because that is what the prop holds and
 * because a future rule that reads more than colour has somewhere to put its
 * answer. Exported for the corpus replay.
 */
export function kindsForStrokeColour(colour: string | undefined): EdgeKind[] {
  const kind = kindForStrokeColour(colour)
  return kind === null ? [] : [kind]
}

/** The colours this build reads, for the test that checks them against tldraw's. */
export const MAPPED_STROKE_COLOURS = Object.keys(KIND_BY_COLOUR)

/** Every kind reachable from a colour; the rest are panel-only. */
export const COLOUR_REACHABLE_KINDS: readonly EdgeKind[] = EDGE_KINDS.filter((kind) =>
  Object.values(KIND_BY_COLOUR).includes(kind),
)
