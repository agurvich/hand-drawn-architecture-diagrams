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

function conn(
  id: string,
  start: string | null,
  end: string | null,
  actorId: string | null = null,
  kinds: readonly string[] = [],
): ConnectionEndpoints {
  return { connectionId: id, startNodeId: start, endNodeId: end, actorId, kinds }
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
      actorIds: [],
      kinds: [],
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
      actorIds: [],
      kinds: [],
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

describe('computeMergeIndex — actors', () => {
  /**
   * A merged line cannot claim an actor its members do not agree on. The
   * predecessor was stricter -- it dropped the actor whenever more than one edge
   * contributed, agreement or not -- and this is deliberately more permissive:
   * a merged line whose members all name the same actor can honestly say so.
   */
  const folded = () =>
    world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:c1', parent: 'shape:p' },
      { id: 'shape:c2', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
      { id: 'shape:role', parent: PAGE },
      { id: 'shape:other', parent: PAGE },
    ])

  it('carries an unmerged line its own actor', () => {
    const get = world([
      { id: 'shape:a', parent: PAGE },
      { id: 'shape:b', parent: PAGE },
      { id: 'shape:role', parent: PAGE },
    ])
    const index = computeMergeIndex([conn('shape:c1', 'shape:a', 'shape:b', 'shape:role')], get)
    expect(index.get('shape:c1')?.actorIds).toEqual(['shape:role'])
  })

  it('a merged line whose members AGREE shows that actor', () => {
    const index = computeMergeIndex(
      [
        conn('shape:k1', 'shape:c1', 'shape:y', 'shape:role'),
        conn('shape:k2', 'shape:c2', 'shape:y', 'shape:role'),
      ],
      folded(),
    )
    const shown = [...index.entries()].filter(([, e]) => !e.hidden)
    expect(shown).toHaveLength(1)
    expect(shown[0]![1].count).toBe(2)
    expect(shown[0]![1].actorIds).toEqual(['shape:role'])
  })

  it('a merged line whose members DISAGREE shows ALL of them', () => {
    /*
     * REVERSED by SPEC-015 (2026-09-07). This used to expect no actor at all --
     * a defensible way to avoid claiming one of them, and the wrong outcome:
     * the whole point of folding a container is to see what crosses its
     * boundary, and who does the crossing is most of that.
     *
     * The case is kept and the expectation flipped, deliberately. Deleting it
     * would remove the only place the old behaviour is described.
     */
    const index = computeMergeIndex(
      [
        conn('shape:k1', 'shape:c1', 'shape:y', 'shape:role'),
        conn('shape:k2', 'shape:c2', 'shape:y', 'shape:other'),
      ],
      folded(),
    )
    const shown = [...index.entries()].filter(([, e]) => !e.hidden)
    expect(shown).toHaveLength(1)
    expect(shown[0]![1].actorIds).toEqual(['shape:other', 'shape:role'])
  })

  it('SOME ATTRIBUTED, SOME NOT yields the actors that exist', () => {
    // Also reversed. This used to expect none, on the reasoning that a partial
    // answer is a disagreement -- but "one of these two is performed by the
    // scheduler" is a true and useful thing to show.
    const index = computeMergeIndex(
      [
        conn('shape:k1', 'shape:c1', 'shape:y', 'shape:role'),
        conn('shape:k2', 'shape:c2', 'shape:y', null),
      ],
      folded(),
    )
    const shown = [...index.entries()].filter(([, e]) => !e.hidden)
    expect(shown[0]![1].actorIds).toEqual(['shape:role'])
  })

  it('the same set, whichever member is the representative', () => {
    // The representative is the smallest id. Reversing which member carries the
    // actor must not change the answer -- if it does, the rule is "the
    // representative's actor" wearing a disguise.
    const forward = computeMergeIndex(
      [
        conn('shape:k1', 'shape:c1', 'shape:y', 'shape:role'),
        conn('shape:k2', 'shape:c2', 'shape:y', null),
      ],
      folded(),
    )
    const backward = computeMergeIndex(
      [
        conn('shape:k1', 'shape:c1', 'shape:y', null),
        conn('shape:k2', 'shape:c2', 'shape:y', 'shape:role'),
      ],
      folded(),
    )
    const actorsOf = (i: MergeIndex) =>
      [...i.values()].filter((e) => !e.hidden).map((e) => e.actorIds)
    expect(actorsOf(forward)).toEqual([['shape:role']])
    expect(actorsOf(backward)).toEqual([['shape:role']])
  })

  it('expanding restores each line its own actor', () => {
    const expanded = world([
      { id: 'shape:p', parent: PAGE },
      { id: 'shape:c1', parent: 'shape:p' },
      { id: 'shape:c2', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
    ])
    const index = computeMergeIndex(
      [
        conn('shape:k1', 'shape:c1', 'shape:y', 'shape:role'),
        conn('shape:k2', 'shape:c2', 'shape:y', 'shape:other'),
      ],
      expanded,
    )
    expect(index.get('shape:k1')?.actorIds).toEqual(['shape:role'])
    expect(index.get('shape:k2')?.actorIds).toEqual(['shape:other'])
  })
})

describe('computeMergeIndex — the actor SET is deterministic', () => {
  const folded = () =>
    world([
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:c1', parent: 'shape:p' },
      { id: 'shape:c2', parent: 'shape:p' },
      { id: 'shape:c3', parent: 'shape:p' },
      { id: 'shape:y', parent: PAGE },
      // MIXED CASE, and that is the whole point: `localeCompare` and plain `<`
      // agree on lowercase ids and disagree on these, so an all-lowercase
      // fixture proves the actors are sorted and NOT which way. The
      // representative rule 275 lines up uses the same pair for the same reason.
      { id: 'shape:aB3', parent: PAGE },
      { id: 'shape:Ab3', parent: PAGE },
      { id: 'shape:mmm', parent: PAGE },
    ])

  const shownActors = (members: ConnectionEndpoints[]) => {
    const index = computeMergeIndex(members, folded())
    return [...index.values()].filter((e) => !e.hidden)[0]!.actorIds
  }

  it('SORTS by id, so two clients draw the same line without coordinating', () => {
    // `Set` iteration order is insertion order, which is store order, which is
    // exactly what differs between two clients. Every permutation must agree.
    const permutations = [
      ['shape:mmm', 'shape:aB3', 'shape:Ab3'],
      ['shape:aB3', 'shape:Ab3', 'shape:mmm'],
      ['shape:Ab3', 'shape:mmm', 'shape:aB3'],
    ]
    for (const order of permutations) {
      expect(
        shownActors([
          conn('shape:k1', 'shape:c1', 'shape:y', order[0]!),
          conn('shape:k2', 'shape:c2', 'shape:y', order[1]!),
          conn('shape:k3', 'shape:c3', 'shape:y', order[2]!),
        ]),
        // UTF-16 code-unit order: capitals before lowercase, so `Ab3` sorts
        // first. `localeCompare` puts `aB3` first, which is the mutation an
        // all-lowercase fixture cannot see.
      ).toEqual(['shape:Ab3', 'shape:aB3', 'shape:mmm'])
    }
  })

  it('is DISTINCT: two members naming the same actor contribute one entry', () => {
    expect(
      shownActors([
        conn('shape:k1', 'shape:c1', 'shape:y', 'shape:Ab3'),
        conn('shape:k2', 'shape:c2', 'shape:y', 'shape:Ab3'),
        conn('shape:k3', 'shape:c3', 'shape:y', 'shape:mmm'),
      ]),
    ).toEqual(['shape:Ab3', 'shape:mmm'])
  })

  it('an unattributed line has an EMPTY set, not a null', () => {
    // Same field for both cases, so nothing downstream needs a branch.
    const get = world([
      { id: 'shape:a', parent: PAGE },
      { id: 'shape:b', parent: PAGE },
    ])
    const index = computeMergeIndex([conn('shape:k', 'shape:a', 'shape:b')], get)
    expect(index.get('shape:k')?.actorIds).toEqual([])
  })
})

describe('computeMergeIndex — kinds, SPEC-018 FR-005', () => {
  /**
   * The same rule as actors, applied to a second field: *a folded view shows
   * every answer, never none*. A merged line that showed only the
   * representative's kinds would call a data transfer a permission edge because
   * the smallest id happened to be one.
   */
  const folded = [
    { id: 'shape:p', parent: PAGE, collapsed: true },
    { id: 'shape:c1', parent: 'shape:p' },
    { id: 'shape:c2', parent: 'shape:p' },
    { id: 'shape:c3', parent: 'shape:p' },
    { id: 'shape:y', parent: PAGE },
  ]

  /** The kinds on the line that is actually drawn. */
  function shownKinds(connections: ConnectionEndpoints[]): string[] {
    const index = computeMergeIndex(connections, world(folded))
    for (const entry of index.values()) if (!entry.hidden) return entry.kinds
    throw new Error('nothing visible')
  }

  it('carries EVERY kind its members name', () => {
    expect(
      shownKinds([
        conn('shape:k1', 'shape:c1', 'shape:y', null, ['data']),
        conn('shape:k2', 'shape:c2', 'shape:y', null, ['permission']),
      ]),
    ).toEqual(['data', 'permission'])
  })

  it('is DISTINCT: two members naming the same kind contribute one entry', () => {
    expect(
      shownKinds([
        conn('shape:k1', 'shape:c1', 'shape:y', null, ['data']),
        conn('shape:k2', 'shape:c2', 'shape:y', null, ['data', 'sequence']),
      ]),
    ).toEqual(['data', 'sequence'])
  })

  it('does not depend on the order the members arrive in', () => {
    // Store order is what differs between two clients, and two clients must
    // draw the same line without coordinating.
    const members: Array<readonly string[]> = [['sequence'], ['data'], ['permission']]
    const permutations = [
      [0, 1, 2],
      [2, 0, 1],
      [1, 2, 0],
    ]
    for (const order of permutations) {
      expect(
        shownKinds([
          conn('shape:k1', 'shape:c1', 'shape:y', null, members[order[0]!]!),
          conn('shape:k2', 'shape:c2', 'shape:y', null, members[order[1]!]!),
          conn('shape:k3', 'shape:c3', 'shape:y', null, members[order[2]!]!),
        ]),
      ).toEqual(['data', 'permission', 'sequence'])
    }
  })

  it('a HIDDEN member keeps its OWN kinds, so expanding restores each line', () => {
    // The members are not rewritten by the merge. Expanding the container drops
    // the group and every line reads its own entry again -- which is only true
    // if the hidden entries were never overwritten with the union.
    const index = computeMergeIndex(
      [
        conn('shape:k1', 'shape:c1', 'shape:y', null, ['data']),
        conn('shape:k2', 'shape:c2', 'shape:y', null, ['permission']),
      ],
      world(folded),
    )
    const hidden = [...index.entries()].find(([, e]) => e.hidden)!
    expect(hidden[1].kinds).toEqual(hidden[0] === 'shape:k1' ? ['data'] : ['permission'])

    const expanded = computeMergeIndex(
      [
        conn('shape:k1', 'shape:c1', 'shape:y', null, ['data']),
        conn('shape:k2', 'shape:c2', 'shape:y', null, ['permission']),
      ],
      world(folded.map((s) => (s.id === 'shape:p' ? { ...s, collapsed: false } : s))),
    )
    expect(expanded.get('shape:k1')?.kinds).toEqual(['data'])
    expect(expanded.get('shape:k2')?.kinds).toEqual(['permission'])
  })

  it('an unkinded line has an EMPTY set, not a null — one field, no branch', () => {
    const get = world([
      { id: 'shape:a', parent: PAGE },
      { id: 'shape:b', parent: PAGE },
    ])
    const index = computeMergeIndex([conn('shape:k', 'shape:a', 'shape:b')], get)
    expect(index.get('shape:k')?.kinds).toEqual([])
  })

  it('every exit path answers, including the ones that never reach a group', () => {
    // Five `out.set` calls, and a field missing from any of them is `undefined`
    // reaching a renderer that expects an array. Rule 1 (unbound terminal),
    // rule 2 (a shape that is gone) and rule 3 (both ends the same) are the
    // three that never see the grouping code at all.
    const get = world([
      { id: 'shape:a', parent: PAGE },
      { id: 'shape:p', parent: PAGE, collapsed: true },
      { id: 'shape:c1', parent: 'shape:p' },
      { id: 'shape:c2', parent: 'shape:p' },
    ])
    const index = computeMergeIndex(
      [
        conn('shape:half', 'shape:a', null, null, ['data']),
        conn('shape:gone', 'shape:a', 'shape:vanished', null, ['permission']),
        conn('shape:internal', 'shape:c1', 'shape:c2', null, ['sequence']),
      ],
      get,
    )
    expect(index.get('shape:half')?.kinds).toEqual(['data'])
    expect(index.get('shape:gone')?.kinds).toEqual(['permission'])
    expect(index.get('shape:internal')?.kinds).toEqual(['sequence'])
  })
})
