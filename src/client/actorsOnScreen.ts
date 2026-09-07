import { type Editor } from 'tldraw'
import { resolveNodeIcon, visibleStandInFor } from '@shared/shapes'
import { getMergeIndex } from './mergeIndex'
import { sceneAwareGetShape } from './sceneView'

/**
 * WHO PERFORMS THIS LINE, answered once for everyone who asks.
 *
 * There are three consumers and they must not answer differently: the line
 * draws them, the "Performed by" panel names them, and the canvas rings the
 * nodes while the line is selected. Each one of them has, at some point, been
 * the one that disagreed -- the panel read the representative's own binding and
 * named one actor while the line drew two; the ring still read it after the
 * panel was fixed, so a merged line drew two icons and exactly one node lit up.
 * A shared function is the only version of this that cannot drift, because
 * "re-implement it identically in three places" has now failed twice.
 *
 * The pipeline, in order, and every step earns its place:
 *
 * 1. THE MERGE INDEX, not the bindings. A folded edge stands for several
 *    connections and the index is where that set already lives.
 * 2. `visibleStandInFor` through the SCENE-AWARE accessor. An actor inside a
 *    folded box is not on screen, and naming it would be naming something
 *    invisible; a scene folds just as thoroughly as the prop, and the natural
 *    implementation gets only the first.
 * 3. DEDUPE AFTER resolution. Two actors in one folded container both stand in
 *    as that container, and counting it twice would say two things cross the
 *    boundary when one does.
 *
 * A node with no name is KEPT. It crosses the boundary whether or not anyone has
 * named it, and the icon exists regardless -- dropping it made a merged edge
 * with three actors show two icons and no `+N more`, which is the line
 * under-reporting what crosses it.
 */
export interface OnScreenActor {
  /** The shape actually on screen -- the actor, or the container hiding it. */
  id: string
  /** Its name, or `Untitled`, the same convention the panel uses. */
  label: string
  /** Its raw `icon` prop, for `resolveNodeIcon`. */
  icon: string
  /** False when this actor is pinned to no icon, so there is nothing to draw. */
  hasGlyph: boolean
}

export function actorsOnScreen(editor: Editor, connectionId: string): OnScreenActor[] {
  const ids = getMergeIndex(editor).get(connectionId)?.actorIds ?? []
  if (ids.length === 0) return []
  const get = sceneAwareGetShape(editor)
  const out: OnScreenActor[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const actor = get(id)
    if (!actor) continue
    const onScreen = visibleStandInFor(actor, get)
    if (seen.has(onScreen.id)) continue
    seen.add(onScreen.id)
    const props = onScreen.props as { label?: unknown; icon?: unknown }
    const label = typeof props.label === 'string' ? props.label.trim() : ''
    const icon = typeof props.icon === 'string' ? props.icon : ''
    out.push({
      id: onScreen.id,
      label: label || 'Untitled',
      icon,
      hasGlyph: resolveNodeIcon(icon, label) !== null,
    })
  }
  return out
}
