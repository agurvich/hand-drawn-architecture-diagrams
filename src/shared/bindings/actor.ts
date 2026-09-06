import {
  createBindingPropsMigrationSequence,
  type RecordProps,
  type TLBaseBinding,
  type TLPropsMigrations,
} from '@tldraw/tlschema'

/**
 * THE ACTOR BINDING: this connection is performed by that node.
 *
 * A connection says what talks to what. It cannot say WHO DID IT, and the thing
 * doing it is often neither end -- an IAM role copying between two buckets it is
 * not itself drawn connected to, a scheduler kicking off a job that writes to a
 * database, a person approving a transfer between two accounts. Draw only the
 * endpoints and the actor disappears from the diagram, which is usually the part
 * someone is asking about.
 *
 * A BINDING, not a field. The predecessor put an `actorId` on the edge; here the
 * mechanism a connection already uses to hold its endpoints holds this too,
 * which buys sync, validation, migration and lifecycle for free and removes the
 * second-home-for-an-id problem a field has (`decisions.md` -> *Store-native
 * domain state*).
 *
 * DELIBERATELY EMPTY PROPS. The binding IS the fact: `fromId` is the connection,
 * `toId` is the actor, and there is nothing else to say. The endpoint binding
 * needs `terminal` because a connection has two ends; an attribution has one.
 * Nothing to store is nothing to migrate later for the wrong reason.
 */

export const ACTOR_BINDING_TYPE = 'connectionActor'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ActorBindingProps {}

export type ActorBinding = TLBaseBinding<typeof ACTOR_BINDING_TYPE, ActorBindingProps>

declare module '@tldraw/tlschema' {
  interface TLGlobalBindingPropsMap {
    [ACTOR_BINDING_TYPE]: ActorBindingProps
  }
}

export const actorBindingProps: RecordProps<ActorBinding> = {}

export const actorBindingMigrations: TLPropsMigrations = createBindingPropsMigrationSequence({
  sequence: [],
})

/**
 * Which of several actor bindings a connection is drawn with.
 *
 * TWO IS A REACHABLE STATE and nothing at the record level prevents it: two
 * clients attributing at the same moment each delete the binding they can see
 * and create a new one with a fresh id, and sync is last-write-wins PER RECORD,
 * so both survive. Counting them and calling two an error would leave the line
 * blank for both people.
 *
 * The smallest id wins, matching `merge.ts`'s representative rule and for the
 * same reason: two clients must arrive at the same label without coordinating,
 * so the tie has to break on data they both already have. Plain `<`, not
 * `localeCompare`, which disagrees with it on mixed case.
 */
export function chosenActorBinding<T extends { id: string }>(
  bindings: readonly T[],
): T | undefined {
  let best: T | undefined
  for (const binding of bindings) {
    if (!best || binding.id < best.id) best = binding
  }
  return best
}
