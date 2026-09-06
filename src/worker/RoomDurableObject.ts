import { SCENE_RECORD_TYPE } from '../shared/scenes'
import { DurableObject } from 'cloudflare:workers'
import { InMemorySyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import { roomSchema } from './schema'

/**
 * One Durable Object per room: a single authoritative copy of the document,
 * held in memory and persisted to this object's own SQLite storage on change.
 *
 * The store is tldraw's own -- that is the whole architecture (decisions.md ->
 * Store-native domain state). Nothing about the diagram lives outside it, which
 * is what makes sync a property of the system rather than a later retrofit.
 */
export class RoomDurableObject extends DurableObject<Env> {
  private room: TLSocketRoom<any, void> | null = null
  private storage: InMemorySyncStorage<any> | null = null
  private roomPromise: Promise<TLSocketRoom<any, void>> | null = null

  /** Debounce persistence: a stroke produces many records in quick succession. */
  private static readonly PERSIST_DEBOUNCE_MS = 200
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  private async getRoom(): Promise<TLSocketRoom<any, void>> {
    if (this.room) return this.room
    // Concurrent upgrades must not each construct a room; share one promise.
    this.roomPromise ??= (async () => {
      const persisted = await this.ctx.storage.get<string>('snapshot')

      // `initialSnapshot` + `onDataChange` are BOTH deprecated in tldraw 5.4 in
      // favour of the `storage` option, and the deprecated onDataChange callback
      // never fires -- so nothing was ever written. The failure is silent and
      // survives a reload, because a Durable Object stays in memory between
      // clients: the room only comes back empty once the object is evicted.
      const storage = new InMemorySyncStorage<any>({
        snapshot: persisted ? JSON.parse(persisted) : undefined,
        onChange: () => this.schedulePersist(),
      })

      // The schema must be the SAME one the client builds its ShapeUtils from, or
      // records are rejected at the boundary. Both derive from src/shared/shapes.
      const room = new TLSocketRoom<any, void>({ schema: roomSchema, storage })
      this.storage = storage
      this.room = room
      return room
    })()
    return this.roomPromise
  }

  private schedulePersist() {
    console.log('[DO] onDataChange fired')
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      console.log('[DO] debounce timer fired')
      void this.persist()
    }, RoomDurableObject.PERSIST_DEBOUNCE_MS)
  }

  private async persist() {
    if (!this.storage) return
    await this.ctx.storage.put('snapshot', JSON.stringify(this.storage.getSnapshot()))
  }

  /**
   * DEV ONLY. Reports what is actually in durable storage, as opposed to what is
   * in memory. The distinction is the whole point: a Durable Object stays
   * resident between clients, so a room can appear to persist while nothing has
   * ever been written. Without this probe, the persistence test passes against
   * the bug it exists to catch.
   */
  async debugStoredSnapshot(label?: string): Promise<{
    present: boolean
    documents: number
    shape: { label: string; parentId: string; collapsed: boolean } | null
    shapeTypes: Record<string, number>
    bindings: Array<{ type: string; fromId: string; toId: string; terminal?: string }>
    scenes: Array<{ id: string; name: string; index: string }>
  }> {
    const raw = await this.ctx.storage.get<string>('snapshot')
    if (!raw) {
      return { present: false, documents: 0, shape: null, shapeTypes: {}, bindings: [], scenes: [] }
    }
    const parsed = JSON.parse(raw) as {
      documents?: Array<{ state?: Record<string, any> }>
    }
    const docs = parsed.documents ?? []

    // A document COUNT is identical whether or not parentId and collapsed were
    // written, so a count-only probe makes "nesting survives a reload" tick
    // vacuously. Report the fields being asserted.
    let shape: { label: string; parentId: string; collapsed: boolean } | null = null
    if (label) {
      const found = docs.find((d) => d.state?.props?.label === label)
      if (found?.state) {
        shape = {
          label,
          parentId: String(found.state.parentId ?? ''),
          collapsed: Boolean(found.state.props?.collapsed),
        }
      }
    }
    // Bindings have no `label`, so the shape lookup above cannot see them at all.
    // Reported separately, by content, so FR-006 does not degrade to a count.
    const bindings = docs
      .filter((d) => d.state?.typeName === 'binding')
      .map((d) => ({
        type: String(d.state!.type ?? ''),
        fromId: String(d.state!.fromId ?? ''),
        toId: String(d.state!.toId ?? ''),
        terminal: d.state!.props?.terminal as string | undefined,
      }))

    // Every stored shape by type. SPEC-006 derives its merged view rather than
    // writing it, and the only way to assert that against STORAGE -- rather than
    // against a client that could be hiding what it wrote -- is to see that no
    // shape type appeared that nobody drew.
    const shapeTypes: Record<string, number> = {}
    for (const d of docs) {
      if (d.state?.typeName !== 'shape') continue
      const type = String(d.state.type ?? '')
      shapeTypes[type] = (shapeTypes[type] ?? 0) + 1
    }

    // Scenes are custom RECORDS, not shapes -- neither the shape lookup nor the
    // binding filter can see them, so "a scene reached durable storage" would
    // otherwise degrade to a document count.
    const scenes = docs
      .filter((d) => d.state?.typeName === SCENE_RECORD_TYPE)
      .map((d) => ({
        id: String(d.state!.id ?? ''),
        name: String(d.state!.name ?? ''),
        index: String(d.state!.index ?? ''),
      }))

    return { present: true, documents: docs.length, shape, shapeTypes, bindings, scenes }
  }

  /**
   * DEV ONLY. Seed a room's durable storage with a snapshot taken at an OLDER
   * schema version, so the migration path can be exercised end to end.
   *
   * The cached room must be dropped as well as the storage written: `getRoom`
   * memoises both `room` and `roomPromise`, so writing storage alone would be
   * invisible to an already-constructed room.
   */
  async debugSeedSnapshot(snapshot: unknown): Promise<{ seeded: true }> {
    await this.ctx.storage.put('snapshot', JSON.stringify(snapshot))
    this.room = null
    this.storage = null
    this.roomPromise = null
    return { seeded: true }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 })
    }

    const sessionId = new URL(request.url).searchParams.get('sessionId')
    if (!sessionId) return new Response('sessionId is required', { status: 400 })

    const { 0: client, 1: server } = new WebSocketPair()
    server.accept()

    const room = await this.getRoom()
    room.handleSocketConnect({ sessionId, socket: server })

    return new Response(null, { status: 101, webSocket: client })
  }
}
