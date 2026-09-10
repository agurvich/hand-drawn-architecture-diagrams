import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTLStore, type Editor } from 'tldraw'
import { syncSchemaOptions } from './shapes/registry'
import { getVocabulary, sameVocabulary, resolveKind } from './kindVocabulary'
import {
  KIND_RECORD_TYPE,
  KIND_UNRESOLVED,
  KIND_PALETTE,
  kindRecordId,
  newKindId,
  type DiagramKind,
  type KindEntry,
} from '@shared/kinds'

/**
 * The read side, and the two things about it that fail SILENTLY.
 *
 * One: a seed write reintroduced here would be invisible to
 * `kinds/overlay.test.ts`, because `overlayVocabulary` is a pure function over
 * an array and no implementation of it could write a store. The seat of that
 * bug is this file, so the assertion lives here.
 *
 * Two: `sameVocabulary` is the `isEqual` of a `computed`; a field it ignores is
 * a field whose changes never repaint, with every overlay test still green.
 */

function fakeEditor(store: ReturnType<typeof createTLStore>): Editor {
  return { store } as unknown as Editor
}

let store: ReturnType<typeof createTLStore>
beforeEach(() => {
  store = createTLStore(syncSchemaOptions)
})
afterEach(() => {
  store.dispose()
})

function kind(id: DiagramKind['id'], over: Partial<DiagramKind> = {}): DiagramKind {
  return { typeName: KIND_RECORD_TYPE, id, label: 'flows', colour: 'violet', dash: 'long', ...over }
}

describe('reading the vocabulary writes nothing', () => {
  it('leaves a fresh store with no kind records at all', () => {
    /*
     * THE ASSERTION THAT FAILS IF SEEDING COMES BACK.
     *
     * SPEC-019's first review rejected seed-on-empty: undo, import and
     * hydration each reach an empty vocabulary, and each would re-seed `data`
     * behind a user who had renamed it. The design that replaced it has no
     * write, and this is what holds it to that.
     */
    const before = store.allRecords().length
    const vocabulary = getVocabulary(fakeEditor(store))
    expect([...vocabulary.keys()]).toEqual(['data', 'permission', 'sequence'])
    expect(store.allRecords().length).toBe(before)
    expect(store.allRecords().filter((r) => r.typeName === KIND_RECORD_TYPE)).toEqual([])
  })

  it('reads a renamed seed from the store without writing the other two', () => {
    // The hydration shape in miniature: records arrive, and the seeds they do
    // not name stay code-only.
    store.put([kind(kindRecordId('data'), { label: 'flows' })])
    const vocabulary = getVocabulary(fakeEditor(store))
    expect([...vocabulary.keys()].sort()).toEqual(['flows', 'permission', 'sequence'])
    expect(store.allRecords().filter((r) => r.typeName === KIND_RECORD_TYPE)).toHaveLength(1)
  })

  it('memoises per editor rather than per call', () => {
    // A `computed` rebuilt per call reverts to recomputing on every store
    // change, with no symptom. Identity across two calls is what shows it.
    const editor = fakeEditor(store)
    expect(getVocabulary(editor)).toBe(getVocabulary(editor))
  })

  it('recomputes when a kind record changes', () => {
    const editor = fakeEditor(store)
    expect(getVocabulary(editor).get('data')!.colour).toBe('orange')
    store.put([kind(kindRecordId('data'), { label: 'data', colour: 'teal', dash: 'solid' })])
    expect(getVocabulary(editor).get('data')!.colour).toBe('teal')
  })
})

describe('sameVocabulary — every field the derivation produces is compared', () => {
  const base: KindEntry = { id: 'data', label: 'data', colour: 'orange', dash: undefined }
  const map = (over: Partial<KindEntry> = {}) =>
    new Map([[over.label ?? base.label, { ...base, ...over }]])

  it('says two identical vocabularies are the same', () => {
    // A comparator answering false always would pass every case below and make
    // the memo useless instead of wrong. This is what catches that.
    expect(sameVocabulary(map(), map())).toBe(true)
  })

  it('sees a size change', () => {
    expect(sameVocabulary(map(), new Map())).toBe(false)
  })

  it('covers every key of KindEntry, so a field added later is not forgotten', () => {
    /*
     * The mechanical half, as `mergeIndex.test.ts` does it: each key paired with
     * a differing value, and the test fails if a key has no pair -- so a fifth
     * field on `KindEntry` reddens this until somebody decides whether the
     * comparator should see it.
     */
    const mutations: { [K in keyof KindEntry]: KindEntry[K] } = {
      id: 'other',
      label: 'other',
      colour: 'teal',
      dash: '7 4',
    }
    for (const [key, value] of Object.entries(mutations)) {
      const changed = map({ [key]: value } as Partial<KindEntry>)
      // Compared under the ORIGINAL key, so a label change is seen as a change
      // rather than as a different map.
      const keyed = new Map([[base.label, [...changed.values()][0]!]])
      expect(
        sameVocabulary(map(), keyed),
        `sameVocabulary ignores '${key}': a change to it would never repaint`,
      ).toBe(false)
    }
    expect(Object.keys(mutations).sort()).toEqual(Object.keys(base).sort())
  })
})

describe('resolveKind', () => {
  it('resolves a listed label to its palette hex and dash', () => {
    const vocabulary = getVocabulary(fakeEditor(store))
    expect(resolveKind(vocabulary, 'data')).toEqual({
      colour: KIND_PALETTE.orange!.hex,
      dash: undefined,
      resolved: true,
    })
  })

  it('gives an unlisted label the unresolved look rather than dropping it', () => {
    // SPEC-018's renderer filtered an unknown kind out, so a label from a newer
    // build or a concurrent rename was stored, invisible and unremovable.
    const vocabulary = getVocabulary(fakeEditor(store))
    expect(resolveKind(vocabulary, 'enriches')).toEqual({
      colour: KIND_UNRESOLVED.hex,
      dash: KIND_UNRESOLVED.dash,
      resolved: false,
    })
  })

  it('treats `__proto__` as a label, not as a prototype lookup', () => {
    store.put([kind(newKindId('1'), { label: '__proto__', colour: 'teal', dash: 'solid' })])
    const vocabulary = getVocabulary(fakeEditor(store))
    expect(resolveKind(vocabulary, '__proto__').resolved).toBe(true)
    expect(resolveKind(vocabulary, 'constructor').resolved).toBe(false)
  })
})
