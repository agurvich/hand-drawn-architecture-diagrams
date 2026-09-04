import { DurableObject } from 'cloudflare:workers'
import { TLSocketRoom } from '@tldraw/sync-core'

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
  private roomPromise: Promise<TLSocketRoom<any, void>> | null = null

  /** Debounce persistence: a stroke produces many records in quick succession. */
  private static readonly PERSIST_DEBOUNCE_MS = 200
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  private async getRoom(): Promise<TLSocketRoom<any, void>> {
    if (this.room) return this.room
    // Concurrent upgrades must not each construct a room; share one promise.
    this.roomPromise ??= (async () => {
      const snapshot = await this.ctx.storage.get<string>('snapshot')
      const room = new TLSocketRoom<any, void>({
        initialSnapshot: snapshot ? JSON.parse(snapshot) : undefined,
        onDataChange: () => this.schedulePersist(),
      })
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
    if (!this.room) return
    const snapshot = this.room.getCurrentSnapshot()
    await this.ctx.storage.put('snapshot', JSON.stringify(snapshot))
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
