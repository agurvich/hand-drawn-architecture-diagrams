import { FALLBACK_ICON_KEY, ICON_MATCH_RULES } from './rules'

/**
 * Guessing a node's icon from its label, and resolving the three states.
 *
 * Pure, imports nothing but the rules, and runs on both halves. The matching
 * algorithm is the predecessor's, kept because it is right and because changing
 * it would invalidate the table that was tuned against it.
 */

/** A whole-word match, with plural handling in BOTH directions. */
function wordMatches(alternative: string, word: string): boolean {
  return alternative === word || `${alternative}s` === word || `${word}s` === alternative
}

/**
 * A single-word alternative matches as a whole word, so a short keyword like
 * "car" cannot false-positive inside "carpet". A multi-word alternative matches
 * as a plain substring -- a real phrase is not at meaningful risk of hiding
 * inside another word, and requiring word-by-word matching would miss
 * "load balancer" inside "application load balancer".
 *
 * The lowered text and its word set are passed IN, not derived here: this runs
 * once per rule per pass -- 216 times for one label against the current table --
 * and splitting the same string 216 times was a third of the call's cost.
 */
function patternMatches(
  pattern: string,
  lowered: string,
  words: ReadonlySet<string>,
  exactOnly: boolean,
): boolean {
  for (const alternative of pattern.split('|')) {
    if (alternative.includes(' ')) {
      if (lowered.includes(alternative)) return true
    } else if (
      exactOnly ? words.has(alternative) : [...words].some((word) => wordMatches(alternative, word))
    ) {
      return true
    }
  }
  return false
}

/**
 * The first matching rule's key, or the fallback. FIRST, not best -- order decides.
 *
 * TWO PASSES, which is the one place this improves on the port rather than
 * copying it. Plural handling runs in both directions, so `user` and `users` are
 * indistinguishable to a single pass and whichever rule sits first wins both --
 * the predecessor put `users` first deliberately, which meant a node called
 * "User" got the plural icon forever. An exact-word pass first gives each the
 * rule that actually names it, and the fuzzy pass still catches "buckets"
 * against a `bucket` rule.
 */
export function guessIconKey(label: string): string {
  const lowered = label.toLowerCase()
  const words = new Set(lowered.split(/[^a-z0-9]+/).filter(Boolean))
  for (const exactOnly of [true, false]) {
    for (const rule of ICON_MATCH_RULES) {
      if (patternMatches(rule.pattern, lowered, words, exactOnly)) return rule.iconKey
    }
  }
  return FALLBACK_ICON_KEY
}

/** A node's icon is deliberately absent. */
export const ICON_NONE = 'none'

/**
 * THE ONE RULE, and every renderer goes through it: the node, the picker's
 * current swatch, and the merged edge.
 *
 * Three states, and the third is the interesting one:
 *
 *   a key   -> pinned. This icon, whatever the label says.
 *   'none'  -> pinned to nothing. No icon here, deliberately.
 *   ''      -> automatic. Guessed live, so renaming the node updates it.
 *
 * Automatic is the ABSENCE of a decision, not a value written once at creation.
 * A node called "DB" renamed to "Queue" changes icon; one whose icon was chosen
 * by hand does not. Writing the guess into the record at creation would look
 * identical on day one and lose that behaviour forever.
 *
 * The empty string is the sentinel because a tldraw shape prop cannot be
 * `undefined` -- it is validated and persisted, and an optional prop on a
 * required record is a different thing from an absent one.
 */
export function resolveNodeIcon(icon: string, label: string): string | null {
  if (icon === ICON_NONE) return null
  if (icon !== '') return icon
  return guessIconKey(label)
}
