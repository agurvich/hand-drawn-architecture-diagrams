import { isValidRoomId } from '../shared/room'
export { RoomDurableObject } from './RoomDurableObject'

/**
 * The Worker owns /api/* only. Everything else is the SPA, served by the asset
 * router -- see wrangler.toml's `run_worker_first`, which is what makes
 * GET /<roomId> serve index.html instead of falling through to here and 404ing.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/api\/connect\/([^/]+)$/)

    if (match) {
      const roomId = decodeURIComponent(match[1])
      // The client validates before connecting; the worker validates anyway,
      // because a client is not a trust boundary.
      if (!isValidRoomId(roomId)) {
        return new Response('invalid room id', { status: 400 })
      }
      // idFromName is what makes "same id -> same room, different id -> isolated"
      // true, rather than something the code has to arrange.
      const id = env.ROOMS.idFromName(roomId)
      return env.ROOMS.get(id).fetch(request)
    }

    // DEV ONLY: report what durable storage actually holds for a room. Guarded
    // so it cannot exist in a production bundle.
    if (import.meta.env.DEV) {
      if (url.pathname === '/api/dev/schema') {
        const { roomSchema } = await import('./schema')
        const ser = roomSchema.serialize()
        return Response.json({
          diagramNode: ser.sequences['com.tldraw.shape.diagramNode'] ?? null,
          shapeSequences: Object.keys(ser.sequences).filter((k) =>
            k.startsWith('com.tldraw.shape'),
          ),
        })
      }
      const dev = url.pathname.match(/^\/api\/dev\/snapshot\/([^/]+)$/)
      if (dev) {
        const roomId = decodeURIComponent(dev[1])
        if (!isValidRoomId(roomId)) return new Response('invalid room id', { status: 400 })
        const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId))
        return Response.json(await stub.debugStoredSnapshot())
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response('not found', { status: 404 })
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
