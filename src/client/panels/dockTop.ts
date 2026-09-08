/** Where the dock starts when the style panel is absent or unmeasurable. */
export const DOCK_TOP_FALLBACK = 58

/** The gap between the style panel's bottom edge and the dock's top. */
const GAP = 8

const STYLE_PANEL = '.tlui-style-panel'

/**
 * Keep `--dock-top` under tldraw's style panel.
 *
 * THE ONLY RUNTIME GEOMETRY IN THIS FEATURE, and the boundary is the point: one
 * element, one axis. What SPEC-016 deleted after three failed reviews was a
 * four-candidate placement search over a list of obstacles. A single
 * `getBoundingClientRect().bottom` is not that.
 *
 * It is needed because the style panel's height depends on the current tool.
 * With a `diagramNode` selected under the select tool it is 44px (y 6-50 in both
 * orientations, measured on `00c1e47`), because a node shares no style props
 * with tldraw's own shapes. Under a DRAWING tool it shows that tool's styles and
 * runs to roughly y 290 -- and the panel renders under a drawing tool, because
 * `recogniseOnDraw` selects a freshly recognised node without changing tool. A
 * constant derived from the short case would sit underneath the tall one.
 *
 * Returns a disposer.
 */
export function observeDockTop(host: HTMLElement): () => void {
  const apply = () => {
    const panel = document.querySelector(STYLE_PANEL)
    const bottom = panel?.getBoundingClientRect().bottom ?? 0
    // A detached or zero-size panel measures 0; fall back rather than docking
    // the panel at the very top of the viewport, over the menu zone.
    const top = bottom > 0 ? Math.round(bottom) + GAP : DOCK_TOP_FALLBACK
    host.style.setProperty('--dock-top', `${Math.max(top, DOCK_TOP_FALLBACK)}px`)
  }

  apply()

  // MEASURED, because the obvious guess is wrong: across select -> draw ->
  // eraser -> select the style panel is the SAME element, resized in place
  // (44 -> 284 -> absent -> 44). So the ResizeObserver below is what carries the
  // load, and the zone observers are redundancy for the case where tldraw does
  // replace or remount it. Recorded because a maintainer trimming one of these
  // would otherwise keep the wrong one.
  const observer = new ResizeObserver(apply)
  const panel = document.querySelector(STYLE_PANEL)
  if (panel) observer.observe(panel)
  const zone = document.querySelector('.tlui-layout__top__right')
  if (zone) observer.observe(zone)

  const mutation = new MutationObserver(apply)
  if (zone) mutation.observe(zone, { childList: true, subtree: true })

  window.addEventListener('resize', apply)
  return () => {
    observer.disconnect()
    mutation.disconnect()
    window.removeEventListener('resize', apply)
  }
}
