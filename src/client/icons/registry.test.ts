import { describe, it, expect } from 'vitest'
import {
  AWS_ICON_KEYS,
  DRAWABLE_ICON_KEYS,
  GENERAL_ICON_KEYS,
  awsIconSvg,
  generalIcon,
  hasIcon,
} from './registry'
import { ICON_MATCH_RULES, FALLBACK_ICON_KEY, isAwsIconKey } from '@shared/shapes'

/**
 * THE RULE TABLE AND THE ARTWORK CANNOT DRIFT.
 *
 * A rule pointing at a missing icon renders nothing and looks exactly like the
 * matcher failing; an icon nothing can select is dead weight that survives every
 * refactor. Both directions, asserted by iterating rather than by inspection.
 */
describe('the icon registry', () => {
  const ruleKeys = [...new Set(ICON_MATCH_RULES.map((rule) => rule.iconKey)), FALLBACK_ICON_KEY]

  it('draws every key the rules can produce', () => {
    const missing = ruleKeys.filter((key) => !hasIcon(key))
    expect(missing, `rules point at icons that do not exist: ${missing.join(', ')}`).toEqual([])
    // AND through the LIST, not only through `hasIcon`. `hasIcon` reads the two
    // maps directly, so truncating `DRAWABLE_ICON_KEYS` -- the list the picker
    // renders from -- left this green and needed an e2e to catch it.
    expect([...DRAWABLE_ICON_KEYS].sort()).toEqual([...new Set(ruleKeys)].sort())
  })

  it('has no icon nothing can select', () => {
    const unreachable = DRAWABLE_ICON_KEYS.filter((key) => !ruleKeys.includes(key))
    expect(unreachable, `icons no rule reaches: ${unreachable.join(', ')}`).toEqual([])
  })

  it('keeps the two sets in separate namespaces', () => {
    // The REAL question: is any key in both maps? The earlier version of this
    // test re-partitioned one combined list by the `aws:` prefix and asserted
    // the halves did not overlap, which is true by construction -- planting
    // `'aws:s3'` in the general set left the whole suite green while the picker
    // drew it twice.
    const both = GENERAL_ICON_KEYS.filter((key) => AWS_ICON_KEYS.includes(key))
    expect(both, `keys defined in both sets: ${both.join(', ')}`).toEqual([])
    expect(AWS_ICON_KEYS.length).toBeGreaterThanOrEqual(20)
    expect(GENERAL_ICON_KEYS.length).toBeGreaterThanOrEqual(50)
    // And the namespace is what keeps them apart, so it is asserted directly.
    expect(AWS_ICON_KEYS.every(isAwsIconKey)).toBe(true)
    expect(GENERAL_ICON_KEYS.some(isAwsIconKey)).toBe(false)
    // No key is listed twice, in one set or across them.
    expect(new Set(DRAWABLE_ICON_KEYS).size).toBe(DRAWABLE_ICON_KEYS.length)
  })

  it('draws NOTHING for a key that is only on Object.prototype', () => {
    // `icon` is a plain `T.string`, so a peer in a sync room can write
    // `toString`. A bare `AWS[key]` finds the method and hands it to
    // `dangerouslySetInnerHTML`.
    for (const key of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(hasIcon(key), key).toBe(false)
      expect(awsIconSvg(key), key).toBeUndefined()
      expect(generalIcon(key), key).toBeUndefined()
    }
  })

  it('carries the REAL AWS icons, not stand-ins', () => {
    // A diagram of an AWS system drawn with generic glyphs is a diagram of a
    // different system.
    for (const key of ['aws:s3', 'aws:lambda', 'aws:iam', 'aws:dynamodb']) {
      expect(hasIcon(key), key).toBe(true)
    }
  })
})
