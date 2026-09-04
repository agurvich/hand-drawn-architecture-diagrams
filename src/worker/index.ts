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

    if (url.pathname.startsWith('/api/')) {
      return new Response('not found', { status: 404 })
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
