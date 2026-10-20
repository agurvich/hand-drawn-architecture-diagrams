import { computed, type Computed, type Editor } from 'tldraw'
import {
  KIND_DASHES,
  KIND_RECORD_TYPE,
  KIND_UNRESOLVED,
  KIND_PALETTE,
  overlayVocabulary,
  type DiagramKind,
  type KindEntry,
} from '@shared/kinds'

/**
 * The vocabulary this room uses, derived once per store change.
 *
 * READING WRITES NOTHING. There is no seeding step: `SEED_KINDS` lives in code
 * and a record only ever overrides one, which is what makes the three kinds
 * exist in a room nobody has touched without any moment at which they are
 * created. `kindVocabulary.test.ts` asserts the store is unchanged after a read,
 * because this is the file a reintroduced seed write would land in.
 *
 * Keyed by LABEL, because a connection stores the word. See
 * `kinds/kind.ts` for why the word is the identity and what that costs.
 */
const vocabularies = new WeakMap<Editor, Computed<ReadonlyMap<string, KindEntry>>>()

export function getVocabulary(editor: Editor): ReadonlyMap<string, KindEntry> {
  let vocabulary = vocabularies.get(editor)
  if (!vocabulary) {
    // Built once and kept, for the reason `mergeIndex.ts` records: a `computed`
    // built per call reverts to recomputing per caller per store change, with
    // no symptom.
    vocabulary = computed('kindVocabulary', () => deriveVocabulary(editor), {
      isEqual: sameVocabulary,
    })
    vocabularies.set(editor, vocabulary)
  }
  return vocabulary.get()
}

/** The vocabulary as a list, in the order the panel and the pen both read. */
export function vocabularyEntries(editor: Editor): KindEntry[] {
  return [...getVocabulary(editor).values()]
}

function deriveVocabulary(editor: Editor): ReadonlyMap<string, KindEntry> {
  const records: DiagramKind[] = []
  for (const record of editor.store.allRecords()) {
    if (record.typeName === KIND_RECORD_TYPE) records.push(record as DiagramKind)
  }
  // A `Map`, not a `Record<string, …>`. The prototype-pollution hazard SPEC-018
  // guarded on `KIND_BY_COLOUR` did not go away when that object did -- it moved
  // to labels, which the user now types. `__proto__` is a legal label.
  return new Map(overlayVocabulary(records).map((entry) => [entry.label, entry]))
}

/**
 * EXPORTED for its own test, for the same reason `sameEntry` is.
 *
 * This is the `isEqual` of the `computed` above, so a field the derivation
 * produces and this ignores is a field whose changes never reach the canvas --
 * silently, with every overlay unit test still green. That is not hypothetical:
 * `mergeIndex.ts` records it happening once for `actorIds`.
 */
export function sameVocabulary(
  a: ReadonlyMap<string, KindEntry>,
  b: ReadonlyMap<string, KindEntry>,
): boolean {
  if (a.size !== b.size) return false
  for (const [label, entry] of a) {
    const other = b.get(label)
    if (!other) return false
    if (
      other.id !== entry.id ||
      other.label !== entry.label ||
      other.colour !== entry.colour ||
      other.dash !== entry.dash
    ) {
      return false
    }
  }
  return true
}

/** What a label is drawn as: a palette colour and dash, or the unresolved look. */
export interface ResolvedKind {
  colour: string
  dash: string | undefined
  resolved: boolean
}

/**
 * How one label paints.
 *
 * A label the vocabulary does not list is UNRESOLVED, not dropped. SPEC-018's
 * renderer filtered an unknown kind out, which made a label arriving from a
 * newer build or a concurrent rename invisible while still being stored -- the
 * user could neither see it nor turn it off.
 */
export function resolveKind(
  vocabulary: ReadonlyMap<string, KindEntry>,
  label: string,
): ResolvedKind {
  const entry = vocabulary.get(label)
  /*
   * UNRESOLVED covers three absences, deliberately collapsed: no entry for the
   * label, an entry naming a palette colour this build does not have, and an
   * entry naming a dash this build does not have. The last two are reachable
   * from a MISMATCHED BUILD -- a record arriving over sync from a peer whose
   * palette has an entry this one lacks.
   *
   * NOT from `?unvalidated`, which an earlier version of this comment claimed:
   * `devOnly.ts` loosens `diagramNode`'s props only and passes
   * `customRecordSchemas` through untouched, so `kindRecordValidator` and its
   * `keyOf` checks still reject an unknown colour or dash on that path. Tested,
   * and corrected here because a reachability claim in a docstring has nothing
   * downstream to catch it.
   *
   * `Object.hasOwn` FOR THE DASH, not a truthiness or `=== undefined` test:
   * `KIND_DASHES.solid` is legitimately `undefined`, so either of those makes
   * EVERY SOLID KIND -- the built-in `data` among them -- render unresolved.
   * `keyOf` in `kind.ts` guards the same trap the same way.
   */
  if (!entry) return { colour: KIND_UNRESOLVED.hex, dash: KIND_UNRESOLVED.dash, resolved: false }
  /*
   * `Object.hasOwn` FOR THE COLOUR TOO, not a truthy bracket read.
   * `KIND_PALETTE['constructor']` is the `Object` function -- truthy, with
   * `.hex` undefined -- so such an entry resolved as `resolved: true` with no
   * colour, which paints black, which per SPEC-018 means "no kind". Silently
   * invisible: the exact hazard this fallback exists to replace, one line above
   * the dash check that guards it deliberately.
   */
  if (!Object.hasOwn(KIND_PALETTE, entry.colour) || !Object.hasOwn(KIND_DASHES, entry.dash)) {
    return { colour: KIND_UNRESOLVED.hex, dash: KIND_UNRESOLVED.dash, resolved: false }
  }
  return { colour: KIND_PALETTE[entry.colour]!.hex, dash: KIND_DASHES[entry.dash], resolved: true }
}
