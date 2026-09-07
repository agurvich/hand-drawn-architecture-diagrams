import { describe, it, expect } from 'vitest'
import { DRAWABLE_ICON_KEYS, hasIcon } from './registry'
import { ICON_MATCH_RULES, FALLBACK_ICON_KEY } from '@shared/shapes'

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
  })

  it('has no icon nothing can select', () => {
    const unreachable = DRAWABLE_ICON_KEYS.filter((key) => !ruleKeys.includes(key))
    expect(unreachable, `icons no rule reaches: ${unreachable.join(', ')}`).toEqual([])
  })

  it('keeps the two sets in separate namespaces', () => {
    // `aws:s3` against `database` -- an un-namespaced key would make the sets one
    // flat space that silently fights over `lambda`.
    const aws = DRAWABLE_ICON_KEYS.filter((key) => key.startsWith('aws:'))
    const general = DRAWABLE_ICON_KEYS.filter((key) => !key.startsWith('aws:'))
    expect(aws.length).toBeGreaterThanOrEqual(20)
    expect(general.length).toBeGreaterThanOrEqual(50)
    expect(aws.some((key) => general.includes(key))).toBe(false)
  })

  it('carries the REAL AWS icons, not stand-ins', () => {
    // A diagram of an AWS system drawn with generic glyphs is a diagram of a
    // different system.
    for (const key of ['aws:s3', 'aws:lambda', 'aws:iam', 'aws:dynamodb']) {
      expect(hasIcon(key), key).toBe(true)
    }
  })
})
