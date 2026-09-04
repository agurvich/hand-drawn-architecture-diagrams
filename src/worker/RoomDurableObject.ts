import { DurableObject } from 'cloudflare:workers'
import { InMemorySyncStorage, TLSocketRoom } from '@tldraw/sync-core'

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

      const room = new TLSocketRoom<any, void>({ storage })
      this.storage = storage
      this.room = room
      return room
    })()
    return this.roomPromise
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
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
  async debugStoredSnapshot(): Promise<{ present: boolean; documents: number }> {
    const raw = await this.ctx.storage.get<string>('snapshot')
    if (!raw) return { present: false, documents: 0 }
    const parsed = JSON.parse(raw) as { documents?: unknown[] }
    return { present: true, documents: parsed.documents?.length ?? 0 }
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
