import { describe, it, expect } from 'vitest'
import {
  overlayVocabulary,
  labelCollision,
  pairCollision,
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

  it('resolves a seed dash to its SVG value, not its key', () => {
    const data = overlayVocabulary([]).find((e) => e.id === 'data')!
    expect(data.dash).toBeUndefined()
    expect(overlayVocabulary([]).find((e) => e.id === 'permission')!.dash).toBe('7 4')
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

describe('labelCollision', () => {
  const vocabulary = overlayVocabulary([])

  it('finds a duplicate ignoring case and surrounding space', () => {
    expect(labelCollision('  DATA ', vocabulary)?.id).toBe('data')
  })

  it('allows a genuinely new label', () => {
    expect(labelCollision('enriches', vocabulary)).toBeNull()
  })

  it('lets an entry be renamed to a different case OF ITSELF', () => {
    /*
     * `data` -> `Data`. Without an id exclusion, a case-insensitive comparison
     * refuses this and names the colliding entry -- which is the entry being
     * renamed. Capitalising a label for display is exactly what SPEC-018's
     * `KIND_LABELS` map did in code, and this spec deletes it.
     */
    expect(labelCollision('Data', vocabulary, 'data')).toBeNull()
  })

  it('still refuses a rename onto ANOTHER entry', () => {
    expect(labelCollision('sequence', vocabulary, 'data')?.id).toBe('sequence')
  })
})

describe('pairCollision', () => {
  const vocabulary = overlayVocabulary([])

  it('refuses a kind identical in both channels', () => {
    // Two kinds the same colour AND the same dash are one kind to a reader, and
    // the person who caused it cannot see that they did.
    expect(pairCollision('orange', 'solid', vocabulary)?.id).toBe('data')
  })

  it('allows a shared colour when the dash differs', () => {
    expect(pairCollision('orange', 'dotted', vocabulary)).toBeNull()
  })

  it('allows a shared dash when the colour differs', () => {
    expect(pairCollision('teal', 'solid', vocabulary)).toBeNull()
  })

  it('does not collide an entry with itself while it is being edited', () => {
    expect(pairCollision('orange', 'solid', vocabulary, 'data')).toBeNull()
  })
})
