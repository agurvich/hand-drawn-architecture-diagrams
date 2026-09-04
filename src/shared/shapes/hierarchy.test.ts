import { describe, it, expect } from 'vitest'
import {
  collapsedAncestorOf,
  isHiddenByCollapse,
  wouldCreateCycle,
  descendantCount,
  descendantIds,
  type HierarchyShape,
} from './hierarchy'

/** A tiny fake store: id -> shape, plus a derived child index. */
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
  const getShape = (id: string) => shapes.get(id)
  const getChildIds = (parentId: string) =>
    [...shapes.values()].filter((s) => s.parentId === parentId).map((s) => s.id)
  return { getShape, getChildIds }
}

const PAGE = 'page:main'

describe('collapsedAncestorOf', () => {
  it('returns null when no ancestor is collapsed', () => {
    const { getShape } = world([
      { id: 'shape:a', parent: PAGE },
      { id: 'shape:b', parent: 'shape:a' },
    ])
    expect(collapsedAncestorOf(getShape('shape:b')!, getShape)).toBeNull()
  })

  it('finds a collapsed parent', () => {
    const { getShape } = world([
      { id: 'shape:a', parent: PAGE, collapsed: true },
      { id: 'shape:b', parent: 'shape:a' },
    ])
    expect(collapsedAncestorOf(getShape('shape:b')!, getShape)?.id).toBe('shape:a')
  })

  it('returns the NEAREST collapsed ancestor, not the outermost', () => {
    const { getShape } = world([
      { id: 'shape:outer', parent: PAGE, collapsed: true },
      { id: 'shape:mid', parent: 'shape:outer', collapsed: true },
      { id: 'shape:leaf', parent: 'shape:mid' },
    ])
    expect(collapsedAncestorOf(getShape('shape:leaf')!, getShape)?.id).toBe('shape:mid')
  })

  it('a collapsed container does NOT hide itself — that is the whole point', () => {
    const { getShape } = world([{ id: 'shape:a', parent: PAGE, collapsed: true }])
    expect(isHiddenByCollapse(getShape('shape:a')!, getShape)).toBe(false)
  })

  it('hides at any depth', () => {
    const { getShape } = world([
      { id: 'shape:a', parent: PAGE, collapsed: true },
      { id: 'shape:b', parent: 'shape:a' },
      { id: 'shape:c', parent: 'shape:b' },
      { id: 'shape:d', parent: 'shape:c' },
    ])
    expect(isHiddenByCollapse(getShape('shape:d')!, getShape)).toBe(true)
  })

  it('ignores a collapsed flag on a shape that is not a diagramNode', () => {
    const { getShape } = world([
      { id: 'shape:g', parent: PAGE, collapsed: true, type: 'geo' },
      { id: 'shape:b', parent: 'shape:g' },
    ])
    expect(isHiddenByCollapse(getShape('shape:b')!, getShape)).toBe(false)
  })

  it('terminates on a corrupt cycle instead of looping forever', () => {
    const { getShape } = world([
      { id: 'shape:a', parent: 'shape:b' },
      { id: 'shape:b', parent: 'shape:a' },
    ])
    expect(collapsedAncestorOf(getShape('shape:a')!, getShape)).toBeNull()
  })
})

describe('wouldCreateCycle', () => {
  const { getShape } = world([
    { id: 'shape:a', parent: PAGE },
    { id: 'shape:b', parent: 'shape:a' },
    { id: 'shape:c', parent: 'shape:b' },
    { id: 'shape:other', parent: PAGE },
  ])

  it('refuses parenting a shape to itself', () => {
    expect(wouldCreateCycle('shape:a', 'shape:a', getShape)).toBe(true)
  })

  it('refuses parenting a shape to its own child', () => {
    expect(wouldCreateCycle('shape:a', 'shape:b', getShape)).toBe(true)
  })

  it('refuses parenting a shape to a deep descendant', () => {
    expect(wouldCreateCycle('shape:a', 'shape:c', getShape)).toBe(true)
  })

  it('allows an unrelated parent', () => {
    expect(wouldCreateCycle('shape:a', 'shape:other', getShape)).toBe(false)
  })

  it('allows reparenting to the page', () => {
    expect(wouldCreateCycle('shape:c', PAGE, getShape)).toBe(false)
  })
})

describe('descendantIds / descendantCount', () => {
  const { getChildIds } = world([
    { id: 'shape:root', parent: PAGE },
    { id: 'shape:x', parent: 'shape:root' },
    { id: 'shape:y', parent: 'shape:root' },
    { id: 'shape:z', parent: 'shape:x' },
    { id: 'shape:elsewhere', parent: PAGE },
  ])

  it('counts every descendant at every depth, not just direct children', () => {
    expect(descendantCount('shape:root', getChildIds)).toBe(3)
    expect(descendantIds('shape:root', getChildIds).sort()).toEqual([
      'shape:x',
      'shape:y',
      'shape:z',
    ])
  })

  it('is zero for a leaf', () => {
    expect(descendantCount('shape:z', getChildIds)).toBe(0)
  })

  it('does not count unrelated shapes', () => {
    expect(descendantIds('shape:root', getChildIds)).not.toContain('shape:elsewhere')
  })

  it('terminates on a cycle', () => {
    const cyclic = world([
      { id: 'shape:p', parent: 'shape:q' },
      { id: 'shape:q', parent: 'shape:p' },
    ])
    expect(() => descendantCount('shape:p', cyclic.getChildIds)).not.toThrow()
  })
})
