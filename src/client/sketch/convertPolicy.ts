import type { Verdict } from '@shared/sketch'

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
