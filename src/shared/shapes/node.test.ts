import { describe, it, expect } from 'vitest'
import { nodeShapeMigrations, nodeVersions, nodeShapeDefaultProps } from './node'

/**
 * FR-004. Rooms persist, so a prop added or renamed without a migration corrupts
 * documents that already exist -- quietly. Exercised here on a shape with
 * nothing to lose, rather than discovered later on one that matters.
 */
/**
 * `up`/`down` are typed as `((props) => void) | 'none' | 'retired'`, so they are
 * narrowed rather than asserted -- an assertion here would hide the case where a
 * migration is later marked 'retired' and these tests silently stop testing it.
 */
function migrationFns(id: string) {
  const found = nodeShapeMigrations.sequence.find((m) => 'id' in m && m.id === id)
  if (!found || !('up' in found)) throw new Error(`no migration with id ${id}`)
  const { up, down } = found as { up: unknown; down?: unknown }
  if (typeof up !== 'function') throw new Error(`migration ${id} has no callable up()`)
  return {
    up: up as (props: Record<string, unknown>) => void,
    down: typeof down === 'function' ? (down as (props: Record<string, unknown>) => void) : null,
  }
}

describe('AddCollapsed migration (v2 -> v3)', () => {
  it('adds collapsed:false to a v2 record — expanded, so children never look lost', () => {
    const v2Props = { w: 200, h: 120, label: 'Existing', color: 'red' } as Record<string, unknown>
    migrationFns(nodeVersions.AddCollapsed).up(v2Props)
    expect(v2Props).toEqual({ w: 200, h: 120, label: 'Existing', color: 'red', collapsed: false })
  })

  it('down() removes collapsed, so a v2 peer can read a v3 record', () => {
    const v3Props = { ...nodeShapeDefaultProps, collapsed: true } as Record<string, unknown>
    const { down } = migrationFns(nodeVersions.AddCollapsed)
    if (!down) throw new Error('AddCollapsed has no down()')
    down(v3Props)
    expect('collapsed' in v3Props).toBe(false)
    expect(v3Props.color).toBe(nodeShapeDefaultProps.color)
  })

  it('runs after AddColor, so a v1 record reaches v3 with both defaults', () => {
    const v1Props = { w: 100, h: 80, label: 'Ancient' } as Record<string, unknown>
    migrationFns(nodeVersions.AddColor).up(v1Props)
    migrationFns(nodeVersions.AddCollapsed).up(v1Props)
    expect(v1Props).toEqual({ w: 100, h: 80, label: 'Ancient', color: 'black', collapsed: false })
  })
})

describe('AddColor migration (v1 -> v2)', () => {
  it('adds color with the documented default to a v1 record', () => {
    const v1Props = { w: 200, h: 120, label: 'Legacy Node' } as Record<string, unknown>
    migrationFns(nodeVersions.AddColor).up(v1Props)
    expect(v1Props).toEqual({ w: 200, h: 120, label: 'Legacy Node', color: 'black' })
  })

  it('leaves a record that already carries color untouched apart from the field it owns', () => {
    const current = { ...nodeShapeDefaultProps, label: 'Current', color: 'red' } as Record<
      string,
      unknown
    >
    migrationFns(nodeVersions.AddColor).up(current)
    // `up` is idempotent in shape only: it overwrites with the default. What
    // matters for a current-version record is that the migration is never run
    // against it -- the sequence version guards that. This asserts the other
    // props are not disturbed.
    expect(current.w).toBe(nodeShapeDefaultProps.w)
    expect(current.label).toBe('Current')
  })

  it('down() removes color, so a v2 record can be read by a v1 peer', () => {
    const v2Props = { ...nodeShapeDefaultProps, color: 'blue' } as Record<string, unknown>
    const { down } = migrationFns(nodeVersions.AddColor)
    if (!down) throw new Error('AddColor has no down() — a v1 peer could not read a v2 record')
    down(v2Props)
    expect('color' in v2Props).toBe(false)
    expect(v2Props.label).toBe(nodeShapeDefaultProps.label)
  })

  it('the sequence is registered under the shape s own id', () => {
    expect(nodeVersions.AddColor).toContain('diagramNode')
  })
})
