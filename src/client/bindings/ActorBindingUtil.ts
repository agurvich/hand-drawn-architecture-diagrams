import { BindingUtil } from 'tldraw'
import {
  ACTOR_BINDING_TYPE,
  actorBindingMigrations,
  actorBindingProps,
  type ActorBinding,
} from '@shared/shapes'

/**
 * `fromId` is the connection; `toId` is the node that performs it.
 *
 * DELIBERATELY NOT A COPY OF ConnectionBindingUtil, and the difference is the
 * point of having two binding types at all. That util's
 * `onBeforeDeleteToShape` deletes the CONNECTION SHAPE when a bound node goes --
 * correct for an endpoint, because a line bound to nothing is not a line.
 * Catastrophic here: deleting the IAM role would delete the fact that one bucket
 * copies to another.
 *
 * So there is no delete hook. tldraw removes the binding itself when either
 * bound shape goes, which is exactly the behaviour wanted: the attribution
 * disappears and the connection stays. THE ABSENCE IS THE BEHAVIOUR, which is
 * why it is written out rather than left to be noticed.
 */
export class ActorBindingUtil extends BindingUtil<ActorBinding> {
  static override type = ACTOR_BINDING_TYPE
  static override props = actorBindingProps
  static override migrations = actorBindingMigrations

  override getDefaultProps() {
    return {}
  }
}

/*
 * WHAT ENFORCES "only to a diagramNode" IS NOT HERE.
 *
 * `canBind` is a hook on the SHAPE util, not the binding util -- and the
 * connection shape already answers it: `toShape.type !== CONNECTION_SHAPE_TYPE`,
 * which is SPEC-005's fence against connection-to-connection and is what keeps
 * triggers out until they are argued on their own evidence.
 *
 * That leaves "and not a tldraw shape either", which no hook can express,
 * because a binding util is asked nothing at creation time. It is enforced at
 * the one place an attribution is made -- `attributeTo` in `actors.ts` -- and
 * that is where its test lives.
 */
