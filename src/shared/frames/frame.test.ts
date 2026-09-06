import { describe, it, expect } from 'vitest'
import {
  effectiveCollapsed,
  withEffectiveCollapsed,
  isFrameStale,
  FRAME_RECORD_TYPE,
  type FrameRecord,
} from './frame'
import { isHiddenByCollapse, type HierarchyShape } from '../shapes/hierarchy'
import { computeMergeIndex, type ConnectionEndpoints } from '../shapes/merge'

const PAGE = 'page:main'

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

function frame(over: Partial<FrameRecord> = {}): FrameRecord {
  return {
    typeName: FRAME_RECORD_TYPE,
    id: 'diagramFrame:f1' as FrameRecord['id'],
    name: 'Frame',
    note: '',
    collapsed: {},
    highlighted: [],
    index: 'a1',
    ...over,
  }
}

const NONE: ReadonlySet<string> = new Set()

describe('effectiveCollapsed — the three-way order', () => {
  it('falls back to the own prop with no frame', () => {
    expect(effectiveCollapsed('shape:a', true, null, NONE)).toBe(true)
    expect(effectiveCollapsed('shape:a', false, null, NONE)).toBe(false)
  })

  it("uses the frame's value when the frame names it", () => {
    const f = frame({ collapsed: { 'shape:a': true } })
    expect(effectiveCollapsed('shape:a', false, f, NONE)).toBe(true)
  })

  it('a frame can force-EXPAND a node whose own prop is collapsed', () => {
    const f = frame({ collapsed: { 'shape:a': false } })
    expect(effectiveCollapsed('shape:a', true, f, NONE)).toBe(false)
  })

  it('falls back to the own prop for a node the frame does not name', () => {
    const f = frame({ collapsed: { 'shape:other': true } })
    expect(effectiveCollapsed('shape:a', false, f, NONE)).toBe(false)
  })

  it('off-frame beats the frame', () => {
    const f = frame({ collapsed: { 'shape:a': true } })
    expect(effectiveCollapsed('shape:a', false, f, new Set(['shape:a']))).toBe(false)
  })

  it('uses hasOwn, not `in` — `in` would answer for an inherited key', () => {
    const f = frame({ collapsed: {} })
    // `'toString' in {}` is true; hasOwn is false. Harmless for shape: ids, and
    // exactly the sort of thing two builders write differently.
    expect(effectiveCollapsed('toString', false, f, NONE)).toBe(false)
  })
})

describe('withEffectiveCollapsed', () => {
  it('returns the accessor UNCHANGED when nothing is in force', () => {
    // Otherwise every ancestor step of every visibility walk allocates, on a
    // canvas with no frame active.
    const get = world([{ id: 'shape:a', parent: PAGE }])
    expect(withEffectiveCollapsed(get, null, NONE)).toBe(get)
  })

  it('leaves non-node shapes alone', () => {
    const get = world([{ id: 'shape:c', parent: PAGE, type: 'diagramConnection' }])
    const wrapped = withEffectiveCollapsed(get, frame({ collapsed: { 'shape:c': true } }), NONE)
    expect(wrapped('shape:c')).toBe(get('shape:c'))
  })

  it('substitutes collapsed without disturbing anything else', () => {
    const get = world([{ id: 'shape:a', parent: PAGE }])
    const wrapped = withEffectiveCollapsed(get, frame({ collapsed: { 'shape:a': true } }), NONE)
    expect(wrapped('shape:a')).toEqual({
      id: 'shape:a',
      type: 'diagramNode',
      parentId: PAGE,
      props: { collapsed: true },
    })
    // And the original record is untouched: a frame never writes.
    expect(get('shape:a')!.props).toEqual({ collapsed: false })
  })
})

describe('the lens drives BOTH readers of collapse', () => {
  // The claim SPEC-008 rests on. Collapse is read in two places -- the
  // visibility walk and the merge derivation -- and both bottom out in the same
  // pure `isCollapsedContainer`. Overriding at the accessor they share is what
  // makes "merging follows the frame" true; overriding one call site would leave
  // connections drawn to shapes that are no longer on screen.

  const spec = [
    { id: 'shape:p', parent: PAGE },
    { id: 'shape:c1', parent: 'shape:p' },
    { id: 'shape:c2', parent: 'shape:p' },
    { id: 'shape:y', parent: PAGE },
  ]
  const connections: ConnectionEndpoints[] = [
    { connectionId: 'shape:k1', startNodeId: 'shape:c1', endNodeId: 'shape:y' },
    { connectionId: 'shape:k2', startNodeId: 'shape:c2', endNodeId: 'shape:y' },
  ]

  it('hides descendants through the visibility walk', () => {
    const get = world(spec)
    const lens = withEffectiveCollapsed(get, frame({ collapsed: { 'shape:p': true } }), NONE)
    expect(isHiddenByCollapse(get('shape:c1')!, get)).toBe(false)
    expect(isHiddenByCollapse(lens('shape:c1')!, lens)).toBe(true)
  })

  it('produces merge output DEEP-EQUAL to setting the prop for real', () => {
    const viaFrame = computeMergeIndex(
      connections,
      withEffectiveCollapsed(world(spec), frame({ collapsed: { 'shape:p': true } }), NONE),
    )
    const viaProp = computeMergeIndex(
      connections,
      world(spec.map((s) => (s.id === 'shape:p' ? { ...s, collapsed: true } : s))),
    )
    expect([...viaFrame]).toEqual([...viaProp])
    // And it really did merge, so the equality is not two no-ops agreeing.
    expect(viaFrame.get('shape:k1')).toMatchObject({ count: 2, startNodeId: 'shape:p' })
  })

  it('resolves to the OUTERMOST frame-folded ancestor', () => {
    const nested = [
      { id: 'shape:outer', parent: PAGE },
      { id: 'shape:inner', parent: 'shape:outer' },
      { id: 'shape:x', parent: 'shape:inner' },
      { id: 'shape:y', parent: PAGE },
    ]
    const lens = withEffectiveCollapsed(
      world(nested),
      frame({ collapsed: { 'shape:outer': true, 'shape:inner': true } }),
      NONE,
    )
    const index = computeMergeIndex(
      [{ connectionId: 'shape:k', startNodeId: 'shape:x', endNodeId: 'shape:y' }],
      lens,
    )
    expect(index.get('shape:k')).toMatchObject({ startNodeId: 'shape:outer' })
  })

  it('an off-frame node inside a frame-folded ancestor is still hidden by the ancestor', () => {
    // Off-frame is per NODE: taking the child off-frame does not rescue it from
    // its ancestor being folded.
    const get = world(spec)
    const lens = withEffectiveCollapsed(
      get,
      frame({ collapsed: { 'shape:p': true } }),
      new Set(['shape:c1']),
    )
    expect(isHiddenByCollapse(lens('shape:c1')!, lens)).toBe(true)
  })

  it('a frame naming a node that no longer exists is inert', () => {
    const get = world(spec)
    const lens = withEffectiveCollapsed(get, frame({ collapsed: { 'shape:gone': true } }), NONE)
    expect(isHiddenByCollapse(lens('shape:c1')!, lens)).toBe(false)
  })
})

describe('isFrameStale', () => {
  const get = world([{ id: 'shape:a', parent: PAGE }])

  it('a frame naming nothing is EMPTY, not stale', () => {
    expect(isFrameStale(frame(), get)).toBe(false)
  })

  it('a frame whose every named id is gone is stale', () => {
    expect(isFrameStale(frame({ collapsed: { 'shape:gone': true } }), get)).toBe(true)
    expect(isFrameStale(frame({ highlighted: ['shape:gone'] }), get)).toBe(true)
  })

  it('one surviving id is enough to be not-stale', () => {
    expect(isFrameStale(frame({ collapsed: { 'shape:gone': true, 'shape:a': true } }), get)).toBe(
      false,
    )
    expect(
      isFrameStale(frame({ collapsed: { 'shape:gone': true }, highlighted: ['shape:a'] }), get),
    ).toBe(false)
  })
})
