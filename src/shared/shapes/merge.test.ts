import { describe, it, expect } from 'vitest'
import {
  visibleStandInFor,
  computeMergeIndex,
  type ConnectionEndpoints,
  type MergeIndex,
} from './merge'
import type { HierarchyShape } from './hierarchy'

/** The same tiny fake store `hierarchy.test.ts` uses -- no Editor anywhere. */
function world(spec: Array<{ id: string; parent: string; collapsed?: boolean; type?: string }>) {
  const shapes = new Map<string, HierarchyShape>(
    spec.map((s) => [
      s.id,
      {
        id: s.id,
        type: s.type ?? 'diagramNode',
        parentId: s.parent,
        props: { collapsed: s.collapsed ?? false },
      },
    ]),
  )
  return (id: string) => shapes.get(id)
}

const PAGE = 'page:main'

function conn(id: string, start: string | null, end: string | null): ConnectionEndpoints {
  return { connectionId: id, startNodeId: start, endNodeId: end }
}

/** The visible line set, as a consumer sees it: id -> "start->end xN". */
function visible(index: MergeIndex): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, e] of index) {
    if (e.hidden) continue
    out[id] = `${e.startNodeId}->${e.endNodeId} x${e.count}`
  }
  return out
}

describe('visibleStandInFor', () => {
  it('returns the shape itself when nothing hides it', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE },
      { id: 'shape:x', parent: 'shape:p' },
    ])
    expect(visibleStandInFor(get('shape:x')!, get).id).toBe('shape:x')
  })

  it('returns the collapsed ancestor', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
    ])
    expect(visibleStandInFor(get('shape:x')!, get).id).toBe('shape:p')
  })

  it('returns the OUTERMOST collapsed ancestor, not the nearest', () => {
    // The criterion that separates this from collapsedAncestorOf. Resolving to
    // the nearest (q) draws a line to a shape that is itself hidden.
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:q', parent: 'shape:p', collapsed: true },
      { id: 'shape:x', parent: 'shape:q' },
    ])
    expect(visibleStandInFor(get('shape:x')!, get).id).toBe('shape:p')
  })

  it('skips an expanded container sandwiched between two collapsed ones', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:mid', parent: 'shape:p' },
      { id: 'shape:q', parent: 'shape:mid', collapsed: true },
      { id: 'shape:x', parent: 'shape:q' },
    ])
    expect(visibleStandInFor(get('shape:x')!, get).id).toBe('shape:p')
  })

  it('a collapsed container stands in for itself', () => {
    const get = world([{ id: 'shape:p', parent: PAGE, collapsed: true }])
    expect(visibleStandInFor(get('shape:p')!, get).id).toBe('shape:p')
  })

  it('resolves a collapsed container nested inside another collapsed one', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:q', parent: 'shape:p', collapsed: true },
    ])
    expect(visibleStandInFor(get('shape:q')!, get).id).toBe('shape:p')
  })

  it('refuses to loop on a parentId cycle, degrading to unresolved', () => {
    const get = world([
      { id: 'shape:a', parent: 'shape:b' },
      { id: 'shape:b', parent: 'shape:a', collapsed: true },
    ])
    expect(visibleStandInFor(get('shape:a')!, get).id).toBe('shape:a')
  })

  it('a collapsed non-node never stands in', () => {
    const get = world([
      { id: 'shape:frame', parent: PAGE, collapsed: true, type: 'frame' },
      { id: 'shape:x', parent: 'shape:frame' },
    ])
    expect(visibleStandInFor(get('shape:x')!, get).id).toBe('shape:x')
  })
})

describe('computeMergeIndex — rule 1, an unbound terminal', () => {
  it('is never hidden and never merged', () => {
    const get = world([{ id: 'shape:a', parent: PAGE }])
    const index = computeMergeIndex([conn('shape:c1', 'shape:a', null)], get)
    expect(index.get('shape:c1')).toEqual({
      hidden: false,
      startNodeId: 'shape:a',
      endNodeId: null,
      count: 1,
    })
  })

  it('still resolves the BOUND half, so a half-drawn line is not drawn into a closed container', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
    ])
    const index = computeMergeIndex([conn('shape:c1', 'shape:x', null)], get)
    expect(index.get('shape:c1')!.startNodeId).toBe('shape:p')
  })

  it('two half-drawn lines off the same collapsed container do not collide', () => {
    // Both would key on `p=>null` if rule 1 entered grouping, and one would be
    // hidden mid-drag.
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: 'shape:p' },
    ])
    const index = computeMergeIndex(
      [conn('shape:c1', 'shape:x', null), conn('shape:c2', 'shape:y', null)],
      get,
    )
    expect(index.get('shape:c1')!.hidden).toBe(false)
    expect(index.get('shape:c2')!.hidden).toBe(false)
  })
})

describe('computeMergeIndex — rule 2, a binding pointing at a shape that is gone', () => {
  it('hides, and keeps the raw id on the terminal that could not resolve', () => {
    const get = world([{ id: 'shape:a', parent: PAGE }])
    const index = computeMergeIndex([conn('shape:c1', 'shape:a', 'shape:gone')], get)
    expect(index.get('shape:c1')).toEqual({
      hidden: true,
      startNodeId: 'shape:a',
      endNodeId: 'shape:gone',
      count: 1,
    })
  })
})

describe('computeMergeIndex — rule 3, both ends resolve to the same shape', () => {
  it('hides a connection internal to a collapsed container', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: 'shape:p' },
    ])
    const index = computeMergeIndex([conn('shape:c1', 'shape:x', 'shape:y')], get)
    expect(index.get('shape:c1')!.hidden).toBe(true)
  })

  it('restores it when the container expands', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: false },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: 'shape:p' },
    ])
    const index = computeMergeIndex([conn('shape:c1', 'shape:x', 'shape:y')], get)
    expect(visible(index)).toEqual({ 'shape:c1': 'shape:x->shape:y x1' })
  })

  it('keeps a node -> its own EXPANDED ancestor visible', () => {
    // The predecessor skipped this for want of an anchor; SPEC-005 built one, so
    // the skip is not ported. After resolution an endpoint can only be a strict
    // ancestor of the other when that ancestor is expanded.
    const get = world([
      { id: 'shape:p', parent: PAGE },
      { id: 'shape:x', parent: 'shape:p' },
    ])
    const index = computeMergeIndex([conn('shape:c1', 'shape:x', 'shape:p')], get)
    expect(visible(index)).toEqual({ 'shape:c1': 'shape:x->shape:p x1' })
  })

  it('hides node -> ancestor when an ancestor ABOVE the pair is collapsed', () => {
    const get = world([
      { id: 'shape:r', parent: PAGE, collapsed: true },
      { id: 'shape:p', parent: 'shape:r' },
      { id: 'shape:x', parent: 'shape:p' },
    ])
    const index = computeMergeIndex([conn('shape:c1', 'shape:x', 'shape:p')], get)
    expect(index.get('shape:c1')!.hidden).toBe(true)
  })

  it('hides a self-connection at any collapse state', () => {
    const get = world([{ id: 'shape:a', parent: PAGE }])
    const index = computeMergeIndex([conn('shape:c1', 'shape:a', 'shape:a')], get)
    expect(index.get('shape:c1')!.hidden).toBe(true)
  })
})

describe('computeMergeIndex — rule 4, resolution and grouping', () => {
  it('draws a crossing connection against the collapsed container', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const index = computeMergeIndex([conn('shape:c1', 'shape:x', 'shape:y')], get)
    expect(visible(index)).toEqual({ 'shape:c1': 'shape:p->shape:y x1' })
  })

  it('draws one line between two DIFFERENT collapsed containers', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:r', parent: PAGE, collapsed: true },
      { id: 'shape:y', parent: 'shape:r' },
    ])
    const index = computeMergeIndex([conn('shape:c1', 'shape:x', 'shape:y')], get)
    expect(visible(index)).toEqual({ 'shape:c1': 'shape:p->shape:r x1' })
  })

  it('merges three connections from distinct children onto one line', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x1', parent: 'shape:p' },
      { id: 'shape:x2', parent: 'shape:p' },
      { id: 'shape:x3', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const index = computeMergeIndex(
      [
        conn('shape:c2', 'shape:x1', 'shape:y'),
        conn('shape:c3', 'shape:x2', 'shape:y'),
        conn('shape:c1', 'shape:x3', 'shape:y'),
      ],
      get,
    )
    expect(visible(index)).toEqual({ 'shape:c1': 'shape:p->shape:y x3' })
  })

  it('expanding restores all three, each against its own child', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: false },
      { id: 'shape:x1', parent: 'shape:p' },
      { id: 'shape:x2', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const index = computeMergeIndex(
      [conn('shape:c1', 'shape:x1', 'shape:y'), conn('shape:c2', 'shape:x2', 'shape:y')],
      get,
    )
    expect(visible(index)).toEqual({
      'shape:c1': 'shape:x1->shape:y x1',
      'shape:c2': 'shape:x2->shape:y x1',
    })
  })

  it('direction is part of the key: opposite directions stay two lines', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:z', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const index = computeMergeIndex(
      [conn('shape:c1', 'shape:x', 'shape:y'), conn('shape:c2', 'shape:y', 'shape:z')],
      get,
    )
    expect(visible(index)).toEqual({
      'shape:c1': 'shape:p->shape:y x1',
      'shape:c2': 'shape:y->shape:p x1',
    })
  })

  it('picks the smallest id under plain `<`, not localeCompare', () => {
    // localeCompare orders 'A' after 'a'; `<` does not. Both clients run the
    // same code, so what matters is that the rule is stated and stable.
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x1', parent: 'shape:p' },
      { id: 'shape:x2', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const index = computeMergeIndex(
      [conn('shape:aB3', 'shape:x1', 'shape:y'), conn('shape:Ab3', 'shape:x2', 'shape:y')],
      get,
    )
    expect(Object.keys(visible(index))).toEqual(['shape:Ab3'])
  })

  it('is order-independent: the representative does not depend on input order', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x1', parent: 'shape:p' },
      { id: 'shape:x2', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const a = computeMergeIndex(
      [conn('shape:c1', 'shape:x1', 'shape:y'), conn('shape:c2', 'shape:x2', 'shape:y')],
      get,
    )
    const b = computeMergeIndex(
      [conn('shape:c2', 'shape:x2', 'shape:y'), conn('shape:c1', 'shape:x1', 'shape:y')],
      get,
    )
    expect(Object.keys(visible(a))).toEqual(Object.keys(visible(b)))
  })
})

describe('computeMergeIndex — rule 5, the gate', () => {
  it('does NOT merge two connections between two visible nodes', () => {
    // Merging is a consequence of collapse. Without the gate an expanded diagram
    // loses a line and grows a count badge.
    const get = world([
      { id: 'shape:a', parent: PAGE },
      { id: 'shape:b', parent: PAGE },
    ])
    const index = computeMergeIndex(
      [conn('shape:c1', 'shape:a', 'shape:b'), conn('shape:c2', 'shape:a', 'shape:b')],
      get,
    )
    expect(visible(index)).toEqual({
      'shape:c1': 'shape:a->shape:b x1',
      'shape:c2': 'shape:a->shape:b x1',
    })
  })

  it('the mixed case: a resolved member pulls hand-drawn duplicates into the merge', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const index = computeMergeIndex(
      [conn('shape:c1', 'shape:x', 'shape:y'), conn('shape:c2', 'shape:p', 'shape:y')],
      get,
    )
    expect(visible(index)).toEqual({ 'shape:c1': 'shape:p->shape:y x2' })
  })

  it('expanding the mixed case returns two lines with no count', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: false },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const index = computeMergeIndex(
      [conn('shape:c1', 'shape:x', 'shape:y'), conn('shape:c2', 'shape:p', 'shape:y')],
      get,
    )
    expect(visible(index)).toEqual({
      'shape:c1': 'shape:x->shape:y x1',
      'shape:c2': 'shape:p->shape:y x1',
    })
  })

  it('the gate flips back OFF when the only resolved member is deleted', () => {
    // The count does NOT simply decrement: the derivation reruns, the group loses
    // its only resolved member, and the remainder return to separate uncounted
    // lines. "count drops by one" is the obvious wrong expectation here.
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const all = [
      conn('shape:c1', 'shape:x', 'shape:y'),
      conn('shape:c2', 'shape:p', 'shape:y'),
      conn('shape:c3', 'shape:p', 'shape:y'),
    ]
    expect(visible(computeMergeIndex(all, get))).toEqual({ 'shape:c1': 'shape:p->shape:y x3' })

    const afterDelete = all.filter((c) => c.connectionId !== 'shape:c1')
    expect(visible(computeMergeIndex(afterDelete, get))).toEqual({
      'shape:c2': 'shape:p->shape:y x1',
      'shape:c3': 'shape:p->shape:y x1',
    })
  })

  it('deleting the representative of a fully-resolved pair leaves one uncounted line', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: 'shape:p' },
      { id: 'shape:z', parent: PAGE },
    ])
    const all = [conn('shape:c1', 'shape:x', 'shape:z'), conn('shape:c2', 'shape:y', 'shape:z')]
    expect(visible(computeMergeIndex(all, get))).toEqual({ 'shape:c1': 'shape:p->shape:z x2' })

    const afterDelete = all.filter((c) => c.connectionId !== 'shape:c1')
    expect(visible(computeMergeIndex(afterDelete, get))).toEqual({
      'shape:c2': 'shape:p->shape:z x1',
    })
  })

  it('a group of one is unaffected by the gate either way', () => {
    const get = world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:x', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const resolved = computeMergeIndex([conn('shape:c1', 'shape:x', 'shape:y')], get)
    const unresolved = computeMergeIndex([conn('shape:c2', 'shape:p', 'shape:y')], get)
    expect(resolved.get('shape:c1')!.count).toBe(1)
    expect(resolved.get('shape:c1')!.hidden).toBe(false)
    expect(unresolved.get('shape:c2')!.count).toBe(1)
    expect(unresolved.get('shape:c2')!.hidden).toBe(false)
  })
})
