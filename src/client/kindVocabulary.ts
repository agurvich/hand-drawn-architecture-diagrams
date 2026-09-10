import { computed, type Computed, type Editor } from 'tldraw'
import {
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
   * UNRESOLVED covers two different absences, deliberately collapsed.
   *
   * No entry for the label, and an entry naming a palette colour THIS BUILD
   * DOES NOT HAVE -- reachable from a mismatched client build, and from the
   * `?unvalidated` dev schema, which by design skips the palette check the
   * record validator applies. The second one used to be `KIND_PALETTE[...]!`,
   * a non-null assertion that turns a stale colour key into a TypeError inside
   * `ShapeUtil.component()`: the whole canvas fails, not one strand.
   *
   * SPEC-018's version of this hazard was an INVISIBLE strand, guarded by a
   * test binding the vocabulary to the stylesheet. That test retired with the
   * custom properties on the grounds that a missing colour became a type error
   * -- true for code-defined kinds, and not true for records, where the colour
   * is runtime data. This is the fallback that replaces it.
   */
  const palette = entry ? KIND_PALETTE[entry.colour] : undefined
  if (!entry || !palette) {
    return { colour: KIND_UNRESOLVED.hex, dash: KIND_UNRESOLVED.dash, resolved: false }
  }
  return { colour: palette.hex, dash: entry.dash, resolved: true }
}
