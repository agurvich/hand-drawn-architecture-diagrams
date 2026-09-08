import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { effectiveCollapsed } from '@shared/scenes'
import { connectionsPerformedBy } from '../../actors'
import { sceneState, viewScene } from '../../sceneView'

/**
 * What this node already IS, as two read-only lines.
 *
 * Each appears only when it has something true to say. The scene line in
 * particular is silent far more often than it speaks, and that is the point:
 * a scene records a collapsed value only for nodes that HAD CHILDREN when it was
 * captured (`captureCollapsedMap`), so it has no opinion about anything else,
 * and a "following the scene" line on a leaf node the scene never mentions is a
 * false statement.
 *
 * The predicate is about VALUES, never about off-scene set membership. That set
 * is add-only -- `takeOffSceneAndToggle` returns early if the id is already in
 * it -- so toggling a container twice puts its effective state back to what the
 * scene says while leaving it in the set. Keyed on membership, this line would
 * claim the node had been changed away from a scene it now matches.
 *
 * @example
 * <NodeStatus editor={editor} id={nodeId} />
 */
export function NodeStatus({ editor, id }: { editor: Editor; id: TLShapeId }) {
  const performs = useValue(
    'connections performed',
    () => {
      const ids = connectionsPerformedBy(editor, id)
      // Some of them may not be DRAWN: a member of a merge group is hidden
      // behind its representative. The count is the document's answer, and the
      // canvas's is said out loud beside it rather than left to be discovered --
      // the same rule `ActorField`'s stand-in note follows.
      const drawn = ids.filter((connectionId) => !editor.isShapeHidden(connectionId)).length
      return { total: ids.length, drawn }
    },
    [editor, id],
  )

  const scene = useValue(
    'scene standing',
    () => {
      const { scene: active, offScene } = sceneState(editor)
      if (!active) return null
      if (!Object.hasOwn(active.collapsed, id)) return null
      const shape = editor.getShape(id)
      if (!shape) return null
      const own = (shape.props as { collapsed?: boolean }).collapsed ?? false
      const effective = effectiveCollapsed(id, own, active, offScene)
      return { matches: effective === active.collapsed[id], sceneId: active.id }
    },
    [editor, id],
  )

  if (performs.total === 0 && scene === null) return null

  return (
    <>
      {performs.total > 0 && (
        <p className="selection-panel__note" data-testid="selection-actor-of">
          {performs.total === 1
            ? 'Performs 1 connection'
            : `Performs ${performs.total} connections`}
          {performs.drawn !== performs.total &&
            ` — ${performs.drawn === 0 ? 'none' : performs.drawn} drawn right now, the rest merged into a folded container`}
          .
        </p>
      )}
      {scene !== null && (
        <p className="selection-panel__note" data-testid="selection-scene-state">
          {scene.matches
            ? 'Matches the scene you are viewing.'
            : 'Changed away from the scene you are viewing.'}
          {!scene.matches && (
            <>
              {' '}
              <button
                type="button"
                className="selection-panel__link"
                data-testid="selection-scene-restore"
                // WHOLE SCENE, and the label says so. `viewScene` clears the
                // entire off-scene set, so a control here labelled as if it
                // acted on this node alone would quietly revert every other
                // node the reader had changed.
                onClick={() => viewScene(editor, scene.sceneId)}
              >
                Restore the whole scene
              </button>
            </>
          )}
        </p>
      )}
    </>
  )
}
