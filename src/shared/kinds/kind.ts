import { createCustomRecordMigrationSequence, idValidator } from '@tldraw/tlschema'
import type { BaseRecord, RecordId } from '@tldraw/store'
import { T } from '@tldraw/validate'
import { KIND_RECORD_TYPE } from './kindType'
import { KIND_DASHES, KIND_PALETTE, SEED_KINDS } from './palette'

export { KIND_RECORD_TYPE, KIND_ID_PREFIX } from './kindType'

/**
 * WHAT A LINE CAN MEAN, as a vocabulary the diagram carries.
 *
 * SPEC-018 shipped three kinds in code and called the vocabulary closed. They
 * were read off ONE drawing, and the next design the project owner brought to
 * the tool needed four different words -- defines, enriches, signals, derives.
 * One drawing is not a vocabulary. See `decisions.md` -> *A kind is identified
 * by its word*.
 *
 * A record OVERRIDES a seed of the same id, or adds an entry. Seeds are never
 * written; `palette.ts` records why.
 *
 * A kind is not a shape: it has no geometry and nothing hit-tests it. Same
 * custom-record pattern as `scenes/scene.ts`, and the same rules -- one
 * declaration, neither runtime writing the type string, a migration for every
 * field change.
 */
export interface DiagramKind extends BaseRecord<typeof KIND_RECORD_TYPE, RecordId<DiagramKind>> {
  /**
   * The word on the edge, and the IDENTITY: a connection stores this string,
   * not this record's id.
   *
   * That costs a rewrite of every connection on rename, and buys two things
   * outright -- no migration on the connection shape, and the survival of an
   * unknown label that `shapes/connection.ts` already promises. It also keeps a
   * document readable when the format carries kinds (`kinds: ["enriches"]`, not
   * `kinds: ["diagramKind:k7"]`), which is the third reason and not the
   * argument, since that spec is not written.
   *
   * Trimmed and non-empty. UNIQUENESS IS NOT HERE: a validator sees one record
   * and cannot see the set, so it is enforced at the write sites.
   */
  label: string
  /** A key of `KIND_PALETTE`, never a raw colour. */
  colour: string
  /** A key of `KIND_DASHES`. */
  dash: string
}

/**
 * The read model: what a renderer, the panel and the pen all consume.
 *
 * A seed and a record collapse to this, so nothing downstream has to know which
 * it is looking at -- which is the whole point of the overlay.
 */
export interface KindEntry {
  id: string
  label: string
  colour: string
  dash: string | undefined
}

/**
 * REQUIRED, and easy to miss -- the trap `scenes/scene.ts` and `shapes/node.ts`
 * both name. `TLRecord` is derived from this augmented map, so without it the
 * store's `put`/`get` never accept this type.
 */
declare module '@tldraw/tlschema' {
  interface TLGlobalRecordPropsMap {
    [KIND_RECORD_TYPE]: DiagramKind
  }
}

/**
 * A label with no surrounding whitespace and something left after it.
 *
 * Written as a refinement rather than a regex so the failure message says which
 * rule broke; a record rejected at the room boundary is read by whoever is
 * debugging a desync, not by whoever wrote it.
 */
const labelValidator = T.string.check((value) => {
  if (value.trim() !== value) throw new Error('kind label must be trimmed')
  if (value.length === 0) throw new Error('kind label must not be empty')
})

const keyOf = (table: Readonly<Record<string, unknown>>, what: string) =>
  T.string.check((value) => {
    // `Object.hasOwn`, not `in`: `in` finds inherited keys, so `'constructor'`
    // would validate as a palette colour and then resolve to a function.
    if (!Object.hasOwn(table, value)) throw new Error(`unknown kind ${what}: ${value}`)
  })

/** Validators cover the WHOLE record, `id` and `typeName` included. */
export const kindRecordValidator = T.object<DiagramKind>({
  typeName: T.literal(KIND_RECORD_TYPE),
  id: idValidator<RecordId<DiagramKind>>(KIND_RECORD_TYPE),
  label: labelValidator,
  colour: keyOf(KIND_PALETTE, 'colour'),
  dash: keyOf(KIND_DASHES, 'dash'),
})

/**
 * tldraw asserts the sequence id is exactly `com.tldraw.<typeName>` and throws a
 * mismatch otherwise, so this is not a free choice.
 */
export const kindRecordMigrations = createCustomRecordMigrationSequence({ sequence: [] })

/**
 * The vocabulary: seeds OVERLAID by records, matched on id.
 *
 * Ordered by label, by the same total order `normaliseKinds` uses -- NOT
 * `localeCompare`, which disagrees with `<` on mixed case. Two clients must
 * render one list with no coordination, and store order is exactly what differs
 * between them.
 *
 * A record whose id matches no seed adds an entry; a record whose id matches one
 * replaces its label, colour and dash. Nothing here writes.
 */
export function overlayVocabulary(records: readonly DiagramKind[]): KindEntry[] {
  const byId = new Map<string, KindEntry>()
  for (const seed of SEED_KINDS) {
    byId.set(seed.id, { ...seed, dash: KIND_DASHES[seed.dash] })
  }
  for (const record of records) {
    // The id carries the record-type prefix; a seed's does not. Stripping it is
    // what lets a record claim a seed's id -- see `seedRecordId` below, which is
    // the only thing that mints one.
    const id = record.id.slice(record.id.indexOf(':') + 1)
    byId.set(id, {
      id,
      label: record.label,
      colour: record.colour,
      dash: KIND_DASHES[record.dash],
    })
  }
  return [...byId.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
}

/**
 * The entry a label would collide with, or null.
 *
 * CASE-INSENSITIVE after trimming, because two kinds called `data` and `Data`
 * are one kind to a reader and two strands on a line.
 *
 * `exceptId` excludes the entry being edited, and excluding it BY ID is the
 * whole point: without that, renaming `data` to `Data` -- capitalising a label
 * for display, which is exactly what SPEC-018's `KIND_LABELS` map did in code --
 * collides with itself and is refused with a message naming itself.
 */
export function labelCollision(
  label: string,
  entries: readonly KindEntry[],
  exceptId?: string,
): KindEntry | null {
  const wanted = label.trim().toLowerCase()
  return entries.find((e) => e.id !== exceptId && e.label.toLowerCase() === wanted) ?? null
}

/**
 * The entry a colour-and-dash pair would collide with, or null.
 *
 * Two kinds identical in both channels are indistinguishable on the canvas, and
 * the person who caused it cannot see that they did -- which is why this is
 * refused rather than warned about. Sharing a colour is fine if the dashes
 * differ, and sharing a dash is fine if the colours do.
 */
export function pairCollision(
  colour: string,
  dash: string,
  entries: readonly KindEntry[],
  exceptId?: string,
): KindEntry | null {
  const resolved = KIND_DASHES[dash]
  return (
    entries.find((e) => e.id !== exceptId && e.colour === colour && e.dash === resolved) ?? null
  )
}
