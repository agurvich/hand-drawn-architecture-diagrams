import { describe, it, expect } from 'vitest'
import {
  overlayVocabulary,
  kindRecordId,
  newKindId,
  KIND_RECORD_TYPE,
  type DiagramKind,
} from './index'

/** A record as the store would hold it. */
function record(id: ReturnType<typeof kindRecordId>, over: Partial<DiagramKind> = {}): DiagramKind {
  return {
    typeName: KIND_RECORD_TYPE,
    id,
    label: 'flows',
    colour: 'violet',
    dash: 'long',
    ...over,
  }
}

describe('the vocabulary is seeds overlaid by records', () => {
  it('is the three seeds when there are no records', () => {
    expect(overlayVocabulary([]).map((e) => e.label)).toEqual(['data', 'permission', 'sequence'])
  })

  it('carries the dash KEY, not its SVG value', () => {
    /*
     * THIS EXPECTATION INVERTED, it was not updated.
     *
     * The overlay used to pre-resolve the dash while leaving the colour a key,
     * an asymmetry with no reason behind it. Both are keys now and `resolveKind`
     * resolves both, which is what lets one producer supply what the JSON
     * document has to write. A generic "update this file" sweep would have
     * edited the values and left a title that lies.
     */
    const data = overlayVocabulary([]).find((e) => e.id === 'data')!
    expect(data.dash).toBe('solid')
    expect(overlayVocabulary([]).find((e) => e.id === 'permission')!.dash).toBe('dashed')
  })

  it('carries a RECORD’s dash key through too, not just a seed’s', () => {
    /*
     * The record branch, asserted on a NON-SOLID dash deliberately. Reverting
     * it to `KIND_DASHES[record.dash]` killed exactly one unrelated test, and
     * only because that fixture's dash was `solid` -- `undefined`, which the
     * `hasOwn` check happens to reject. With any other dash nothing caught it.
     */
    const vocabulary = overlayVocabulary([record(newKindId('7'), { dash: 'dotted' })])
    expect(vocabulary.find((e) => e.id === 'k7')!.dash).toBe('dotted')
  })

  it('lets a record at a seed id REPLACE that seed, not add a fourth', () => {
    const vocabulary = overlayVocabulary([record(kindRecordId('data'))])
    expect(vocabulary).toHaveLength(3)
    expect(vocabulary.map((e) => e.label).sort()).toEqual(['flows', 'permission', 'sequence'])
    expect(vocabulary.find((e) => e.id === 'data')!.colour).toBe('violet')
  })

  it('lets a record at a NOVEL id add a fourth', () => {
    const vocabulary = overlayVocabulary([record(newKindId('7'), { label: 'enriches' })])
    expect(vocabulary).toHaveLength(4)
    expect(vocabulary.map((e) => e.label)).toContain('enriches')
  })

  it('does not overwrite a renamed seed when a kind reclaims its old label', () => {
    /*
     * The case that fails if created ids are derived from labels the way seed
     * ids are: rename `data` to `flows`, then create a new kind called `data`.
     * A derived id would land back on `diagramKind:data` and silently rename
     * `flows` to `data`, losing its colour.
     */
    const vocabulary = overlayVocabulary([
      record(kindRecordId('data'), { label: 'flows' }),
      record(newKindId('7'), { label: 'data', colour: 'teal' }),
    ])
    expect(vocabulary).toHaveLength(4)
    expect(vocabulary.find((e) => e.label === 'flows')).toBeDefined()
    expect(vocabulary.find((e) => e.label === 'data')!.colour).toBe('teal')
  })

  it('orders by label with plain `<`, not localeCompare', () => {
    // Two clients must render one list with no coordination, and store order is
    // exactly what differs between them. `localeCompare` disagrees with `<` on
    // mixed case, so a capitalised label is where the two orders part.
    const vocabulary = overlayVocabulary([
      record(newKindId('1'), { label: 'Zebra' }),
      record(newKindId('2'), { label: 'apple' }),
    ])
    expect(vocabulary.map((e) => e.label)).toEqual([
      'Zebra',
      'apple',
      'data',
      'permission',
      'sequence',
    ])
  })

  it('survives a label of `__proto__`', () => {
    // The prototype-pollution hazard SPEC-018 guarded on a plain object did not
    // disappear; it moved here. A `Map` is what makes this safe, and this test
    // is what stops a `Record<string, …>` creeping back in.
    const vocabulary = overlayVocabulary([record(newKindId('1'), { label: '__proto__' })])
    expect(vocabulary).toHaveLength(4)
    expect(vocabulary.find((e) => e.label === '__proto__')).toBeDefined()
  })
})
