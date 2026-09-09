/**
 * THE CORPUS, decoded. Test-only, and never imported by anything that ships.
 *
 * `docs/corpus/` holds 276 strokes drawn on an iPad with a pencil. They are the
 * only evidence in this repo about how the classifier behaves on a real hand --
 * every fixture in `__fixtures__/strokes/` that predates SPEC-017 was drawn by
 * an agent through CDP-synthesised pen events, which is how a recogniser ends
 * up accepting only tidy rectangles.
 *
 * This module reads from `docs/` with `node:fs`, so it sits outside the
 * runtime-agnostic fence CLAUDE.md puts around `src/shared`. That fence is about
 * code that ships to the client and the worker; `corpus.test.ts` asserts that
 * nothing shipping reaches this file.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { b64Vecs } from '@tldraw/tlschema'

export interface Point {
  x: number
  y: number
}

export interface CorpusStroke {
  /**
   * Position in the room snapshot's `documents` array, filtered to draw shapes.
   *
   * NOT the order of the shapes' fractional `index` props, which disagrees at
   * every position. `labels.ts` indexes into this, so picking the other reading
   * silently relabels every stroke.
   */
  index: number
  points: Point[]
  colour: string
  bounds: { w: number; h: number }
}

export const CORPUS_FILE = 'docs/corpus/ipad-aws-2026-09-07.room.json'

interface RoomSnapshot {
  documents: Array<{
    state: {
      typeName: string
      type?: string
      x?: number
      y?: number
      props?: {
        segments?: Array<{ path: string }>
        color?: string
        scaleX?: number
        scaleY?: number
      }
    }
  }>
}

/**
 * Every `draw` shape in the snapshot, in PAGE space.
 *
 * Two conversions, both easy to get wrong and both taken from the runtime path
 * in `recogniseOnDraw.ts`. A segment has no `points` -- it has `path`,
 * delta-encoded base64. And the decoded points are SHAPE-LOCAL, so `scaleX`/
 * `scaleY` apply before the shape's own origin is added.
 */
export function loadCorpus(root = process.cwd()): CorpusStroke[] {
  const raw = JSON.parse(readFileSync(resolve(root, CORPUS_FILE), 'utf8')) as RoomSnapshot
  const out: CorpusStroke[] = []
  for (const { state } of raw.documents) {
    if (state.typeName !== 'shape' || state.type !== 'draw') continue
    const props = state.props ?? {}
    const scaleX = props.scaleX ?? 1
    const scaleY = props.scaleY ?? 1
    const originX = state.x ?? 0
    const originY = state.y ?? 0
    const points: Point[] = (props.segments ?? [])
      .flatMap((segment) => b64Vecs.decodePoints(segment.path))
      .map((p) => ({ x: p.x * scaleX + originX, y: p.y * scaleY + originY }))
    if (points.length === 0) continue
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    out.push({
      index: out.length,
      points,
      colour: props.color ?? 'black',
      bounds: { w: maxX - minX, h: maxY - minY },
    })
  }
  return out
}
