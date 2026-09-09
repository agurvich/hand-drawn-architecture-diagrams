import { describe, it, expect } from 'vitest'
import { sameEntry } from './mergeIndex'
import type { MergeEntry } from '@shared/shapes'

/**
 * The memo comparator, tested directly — because the failure it causes is
 * SILENT.
 *
 * `sameEntry` is the `isEqual` of the `computed` in `mergeIndex.ts`. A field the
 * derivation produces and this function ignores is a field whose changes never
 * reach a renderer: the memo reports the index unchanged, nothing invalidates,
 * nothing repaints, and there is no error and no warning. Every
 * `computeMergeIndex` unit test still passes, because those test the DERIVATION.
 *
 * This file exists because that is not a hypothetical: the comparator's own
 * docblock records it happening once, for `actorIds`.
 */

function entry(over: Partial<MergeEntry> = {}): MergeEntry {
  return {
    hidden: false,
    startNodeId: 'shape:a',
    endNodeId: 'shape:b',
    count: 1,
    actorIds: [],
    kinds: [],
    ...over,
  }
}

describe('sameEntry — every field the derivation produces is compared', () => {
  it('says two identical entries are the same', () => {
    // A comparator that always answered false would pass every test below and
    // make the memo useless instead of wrong. This is the case that catches it.
    expect(sameEntry(entry(), entry())).toBe(true)
  })

  it('sees a KIND being added', () => {
    expect(sameEntry(entry({ kinds: [] }), entry({ kinds: ['data'] }))).toBe(false)
  })

  it('sees a kind being removed', () => {
    expect(sameEntry(entry({ kinds: ['data'] }), entry({ kinds: [] }))).toBe(false)
  })

  it('sees one kind SWAPPED for another at the same length', () => {
    // A length-only comparison passes this. Toggling `data` off and `permission`
    // on is one panel interaction, and it is exactly this shape.
    expect(sameEntry(entry({ kinds: ['data'] }), entry({ kinds: ['permission'] }))).toBe(false)
  })

  it('compares kinds BY CONTENT, not by array identity', () => {
    // The derivation rebuilds the array every run, so an identity comparison
    // would report every entry changed on every store change -- the churn the
    // memo exists to prevent, in the other direction.
    expect(sameEntry(entry({ kinds: ['data'] }), entry({ kinds: ['data'] }))).toBe(true)
  })

  it('still sees every field it saw before kinds existed', () => {
    // A guard against the fix for one field quietly breaking another.
    expect(sameEntry(entry(), entry({ hidden: true }))).toBe(false)
    expect(sameEntry(entry(), entry({ count: 2 }))).toBe(false)
    expect(sameEntry(entry(), entry({ startNodeId: 'shape:z' }))).toBe(false)
    expect(sameEntry(entry(), entry({ endNodeId: 'shape:z' }))).toBe(false)
    expect(sameEntry(entry(), entry({ actorIds: ['shape:r'] }))).toBe(false)
  })

  it('covers every key of MergeEntry, so a field added later is not forgotten', () => {
    /*
     * The mechanical half. Each entry below is a key of `MergeEntry` paired with
     * a value that differs from `entry()`'s -- and the test fails if any key has
     * no pair, so adding a seventh field to `MergeEntry` reddens this until
     * somebody decides whether the comparator should see it.
     *
     * This is the rule, not the instance: the last two times a field was added
     * here the comparator was updated by hand and nothing checked that it had
     * been.
     */
    const mutations: { [K in keyof MergeEntry]: MergeEntry[K] } = {
      hidden: true,
      startNodeId: 'shape:other',
      endNodeId: 'shape:other',
      count: 3,
      actorIds: ['shape:actor'],
      kinds: ['sequence'],
    }
    const base = entry()
    for (const [key, value] of Object.entries(mutations)) {
      expect(
        sameEntry(base, entry({ [key]: value } as Partial<MergeEntry>)),
        `sameEntry ignores '${key}': a change to it would never reach the canvas`,
      ).toBe(false)
    }
    expect(Object.keys(mutations).sort()).toEqual(Object.keys(base).sort())
  })
})
