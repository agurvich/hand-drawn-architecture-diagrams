import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { CONNECTION_SHAPE_TYPE, NODE_SHAPE_TYPE } from '@shared/shapes'
import { actorIdOf, attributeTo, clearActor } from '../actors'
import { getMergeIndex } from '../mergeIndex'

/**
 * The `<select>` value for "several different actors".
 *
 * Not a shape id and not `''`, both of which mean something else here, and
 * prefixed so it can never collide with one: tldraw ids all start `shape:`.
 */
const SEVERAL = '__several__'

interface ActorControlProps {
  /** The mounted editor, or null before `onMount` has run. */
  editor: Editor | null
}

/**
 * "Performed by" — attributing the selected connection to a node.
 *
 * ON THE CONNECTION, because the connection is the thing being described. It
 * appears only while exactly one connection is selected: an attribution control
 * with nothing to attribute is a permanent panel for an occasional act.
 *
 * A `<select>` rather than a click-the-node gesture. Picking a node by pointing
 * at it is the nicer gesture and it is also the one already spoken for -- that
 * is how you draw a connection -- so a second meaning for the same motion would
 * have to be moded, and a mode you can forget you are in is how an annotation
 * gets eaten. The list is also the only version that works from a keyboard.
 *
 * @example
 * <ActorControl editor={editor} />
 */
export function ActorControl({ editor }: ActorControlProps) {
  const selected = useValue(
    'selected connection',
    () => {
      if (!editor) return null
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return null
      const shape = editor.getShape(ids[0]!)
      return shape?.type === CONNECTION_SHAPE_TYPE ? shape.id : null
    },
    [editor],
  )

  const nodes = useValue(
    'nodes',
    () => {
      if (!editor) return []
      return (
        editor
          .getCurrentPageShapes()
          .filter((shape) => shape.type === NODE_SHAPE_TYPE)
          .map((shape) => ({
            id: shape.id as string,
            label: ((shape.props as { label?: string }).label ?? '').trim() || 'Untitled',
          }))
          .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1))
          // TWO NODES CAN SHARE A NAME, and two identical options are two options
          // a keyboard or voice-control user cannot choose between. Disambiguated
          // only where it is needed, so the common case reads as the plain name.
          .map((node, i, all) => {
            const duplicate = all.some((other, j) => j !== i && other.label === node.label)
            return duplicate ? { ...node, label: `${node.label} (${node.id.slice(-4)})` } : node
          })
      )
    },
    [editor],
  )

  /*
   * READ THROUGH THE MERGE INDEX, not off the selected shape's own binding.
   *
   * A merged line is drawn by ONE of its members -- the representative -- and
   * that is the only member you can hit-test, so selecting a `x2` line selects
   * it. Reading `actorIdOf` there answered with that one member's actor while
   * the canvas, one click away, correctly claimed nobody. Worse, "Nobody in
   * particular" then called `clearActor` on the representative and destroyed its
   * real attribution while every other member kept theirs -- a person "fixing" a
   * reading that was wrong to begin with, and losing data doing it.
   */
  const merged = useValue(
    'merge entry',
    () => (editor && selected ? (getMergeIndex(editor).get(selected) ?? null) : null),
    [editor, selected],
  )
  const standsForSeveral = (merged?.count ?? 1) > 1
  const mergedActorIds = standsForSeveral ? (merged?.actorIds ?? []) : []
  /*
   * SEVERAL DISTINCT ACTORS is a state a `<select>` has no value for, and since
   * SPEC-015 it is a state the LINE draws: it shows every one of them. Leaving
   * the select empty would put the control back into disagreeing with the canvas
   * -- the exact defect the merge-index read above was written to fix, only with
   * the reading now too EMPTY rather than too confident. So the several-actor
   * case gets an option of its own, selected and unpickable.
   */
  const several = mergedActorIds.length > 1
  const actorId = useValue(
    'actor',
    () => {
      if (!editor || !selected) return null
      if (standsForSeveral) return mergedActorIds.length === 1 ? (mergedActorIds[0] ?? null) : null
      return actorIdOf(editor, selected)
    },
    [editor, selected, standsForSeveral, mergedActorIds],
  )

  if (!editor || !selected) return null

  const nameOf = (id: string) => nodes.find((node) => node.id === id)?.label ?? 'Untitled'
  // BY NAME, where the canvas orders the same actors by id: agreement between
  // the two is about WHICH actors, and a list of names sorted by an id nobody
  // can see reads as unsorted.
  const severalLabel = mergedActorIds
    .map(nameOf)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(', ')

  return (
    <div className="actor-control" data-testid="actor-control">
      <label className="actor-control__label" htmlFor="actor-control-select">
        Performed by
      </label>
      <select
        id="actor-control-select"
        className="actor-control__select"
        data-testid="actor-select"
        value={several ? SEVERAL : (actorId ?? '')}
        /*
         * READ-ONLY ON A MERGED LINE. Editing it would rewrite the
         * representative alone and leave every other member as it was -- a
         * silent partial edit with nothing on screen saying only one of several
         * changed. Attributing them all is a coherent alternative, but it is a
         * bulk edit nobody asked for; expanding the container is the gesture
         * that already exists.
         */
        disabled={standsForSeveral}
        onChange={(event) => {
          const value = event.target.value
          if (value === '') clearActor(editor, selected)
          else attributeTo(editor, selected, value as TLShapeId)
        }}
      >
        <option value="">Nobody in particular</option>
        {several && (
          <option value={SEVERAL} data-testid="actor-select-several">
            {severalLabel}
          </option>
        )}
        {nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.label}
          </option>
        ))}
      </select>
      {standsForSeveral && (
        <p className="actor-control__note" data-testid="actor-control-merged">
          This line stands for {merged?.count} connections. Expand the container to attribute them.
        </p>
      )}
    </div>
  )
}
