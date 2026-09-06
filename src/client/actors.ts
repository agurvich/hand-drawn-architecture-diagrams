import { computed, createBindingId, type Computed, type Editor, type TLShapeId } from 'tldraw'
import {
  ACTOR_BINDING_TYPE,
  CONNECTION_SHAPE_TYPE,
  NODE_SHAPE_TYPE,
  chosenActorBinding,
  type ActorBinding,
} from '@shared/shapes'

/**
 * Attributing a connection to the node that performs it.
 *
 * The one place an attribution is made, cleared or read. `ActorBindingUtil`
 * deliberately has no creation hook to enforce anything with -- a binding util
 * is asked nothing at creation time -- so the rules live here, where they can be
 * tested.
 */

/** Every actor binding on a connection. Usually none or one; see below. */
export function actorBindingsOf(editor: Editor, connectionId: TLShapeId): ActorBinding[] {
  const shape = editor.getShape(connectionId)
  if (!shape) return []
  return editor.getBindingsFromShape<ActorBinding>(shape, ACTOR_BINDING_TYPE)
}

/**
 * The node a connection is attributed to, or null.
 *
 * Resolves through `chosenActorBinding` rather than assuming there is at most
 * one: two clients attributing at the same moment each delete the binding they
 * can see and create a fresh one, and sync is last-write-wins PER RECORD, so
 * both survive. Counting them and treating two as an error would leave the line
 * blank for both people.
 */
export function actorIdOf(editor: Editor, connectionId: TLShapeId): TLShapeId | null {
  const chosen = chosenActorBinding(actorBindingsOf(editor, connectionId))
  return chosen ? (chosen.toId as TLShapeId) : null
}

/**
 * Attribute a connection to a node, replacing any existing attribution.
 *
 * ONE UNDOABLE STEP: the removal and the creation go inside one `run` after a
 * history mark, so undo restores the PREVIOUS attribution rather than clearing
 * it -- which is what two separate steps would give.
 *
 * Returns false and writes nothing when the target is not a `diagramNode`. That
 * check is here because no hook can express it: `canBind` is a shape-util hook
 * and the connection's already refuses another connection, but nothing asks a
 * binding util anything at creation time.
 */
export function attributeTo(editor: Editor, connectionId: TLShapeId, nodeId: TLShapeId): boolean {
  const node = editor.getShape(nodeId)
  if (!node || node.type !== NODE_SHAPE_TYPE) return false
  const connection = editor.getShape(connectionId)
  if (!connection) return false

  editor.markHistoryStoppingPoint()
  editor.run(() => {
    const existing = actorBindingsOf(editor, connectionId)
    if (existing.length > 0) editor.deleteBindings(existing)
    editor.createBinding({
      id: createBindingId(),
      type: ACTOR_BINDING_TYPE,
      fromId: connectionId,
      toId: nodeId,
      props: {},
    })
  })
  return true
}

/** Remove the attribution, leaving the connection and both its endpoints. */
export function clearActor(editor: Editor, connectionId: TLShapeId): void {
  const existing = actorBindingsOf(editor, connectionId)
  if (existing.length === 0) return
  editor.markHistoryStoppingPoint()
  editor.run(() => {
    editor.deleteBindings(existing)
  })
}

/**
 * The nodes that perform whatever connections are currently selected.
 *
 * The other half of "who does this": the label on the line answers it from the
 * line, and this answers it from the canvas, so selecting a connection shows you
 * the actor without opening anything.
 *
 * Behind a `computed` for the reason `highlightState` is: this runs inside the
 * tracked render scope of EVERY node, and it reads the selection plus every
 * actor binding. Unguarded, each of N nodes takes a dependency on all of that
 * and re-renders whenever any of it changes.
 */
const performers = new WeakMap<Editor, Computed<ReadonlySet<string>>>()

const NO_ACTORS: ReadonlySet<string> = new Set()

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

export function actorsOfSelection(editor: Editor): ReadonlySet<string> {
  let set = performers.get(editor)
  if (!set) {
    set = computed(
      'actors of selection',
      () => {
        const ids = editor.getSelectedShapeIds()
        if (ids.length === 0) return NO_ACTORS
        const out = new Set<string>()
        for (const id of ids) {
          const shape = editor.getShape(id)
          if (shape?.type !== CONNECTION_SHAPE_TYPE) continue
          const actor = actorIdOf(editor, id)
          if (actor) out.add(actor)
        }
        return out.size === 0 ? NO_ACTORS : out
      },
      { isEqual: sameSet },
    )
    performers.set(editor, set)
  }
  return set.get()
}
