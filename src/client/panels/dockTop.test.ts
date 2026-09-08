import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { observeDockTop, DOCK_TOP_FALLBACK } from './dockTop'

/*
 * jsdom gives every element a zero rect, which is exactly the "absent or
 * unmeasurable" case this module has a fallback for -- so that is what these
 * assert. The measured case is proved end-to-end in
 * `e2e/selection-panel.spec.ts`, where a real style panel has a real height and
 * changes it with the current tool; a jsdom test could only assert against a
 * stub of the number it is meant to be discovering.
 */
describe('observeDockTop', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('falls back rather than docking at the top of the viewport', () => {
    const dispose = observeDockTop(host)
    expect(host.style.getPropertyValue('--dock-top')).toBe(`${DOCK_TOP_FALLBACK}px`)
    dispose()
  })

  it('never returns a value above the fallback', () => {
    // A style panel measuring 0 must not put the dock at 8px, over the menu
    // zone -- `Math.max` against the fallback is what stops that.
    const panel = document.createElement('div')
    panel.className = 'tlui-style-panel'
    document.body.appendChild(panel)
    const dispose = observeDockTop(host)
    const value = Number.parseInt(host.style.getPropertyValue('--dock-top'), 10)
    expect(value).toBeGreaterThanOrEqual(DOCK_TOP_FALLBACK)
    dispose()
  })

  it('disposes its observers and listener', () => {
    const dispose = observeDockTop(host)
    expect(() => dispose()).not.toThrow()
    // A second call must be safe: React runs cleanup on unmount and again on a
    // dependency change in StrictMode.
    expect(() => dispose()).not.toThrow()
  })
})
