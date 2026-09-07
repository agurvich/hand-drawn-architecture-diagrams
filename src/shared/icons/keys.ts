import { FALLBACK_ICON_KEY, ICON_MATCH_RULES } from './rules'

/**
 * Every icon key this app knows, DERIVED FROM THE RULES rather than listed.
 *
 * The rule table defines the vocabulary; the artwork has to cover it. A
 * hand-written second list here would be a second home for the same fact, and
 * the two would drift the first time a rule was added — which is exactly the
 * failure the client's registry test exists to catch, and it can only catch it
 * if this side is derived.
 *
 * Shared because BOTH halves name these: the matcher produces them and the
 * document carries them. The artwork itself stays in `src/client/`.
 */
export const ICON_KEYS: readonly string[] = [
  ...new Set([...ICON_MATCH_RULES.map((rule) => rule.iconKey), FALLBACK_ICON_KEY]),
]

/** An icon key names one of the two sets, and they cannot collide. */
export function isAwsIconKey(key: string): boolean {
  return key.startsWith('aws:')
}
