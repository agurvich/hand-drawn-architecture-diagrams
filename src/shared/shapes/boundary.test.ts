import { describe, it, expect } from 'vitest'
import { createTLSchema, defaultShapeSchemas, defaultBindingSchemas } from '@tldraw/tlschema'
import { NodeShapeUtil } from '../../client/shapes/NodeShapeUtil'
import {
  customShapeSchemas,
  customBindingSchemas,
  NODE_SHAPE_TYPE,
  nodeShapeDefaultProps,
} from './index'
import { bindingUtils } from '../../client/shapes/registry'

/**
 * The ONE test that legitimately imports across both runtimes. `shared-imports.test.ts`
 * excludes `*.test.*` for exactly this reason.
 *
 * It asserts the client half against the WORKER half. Asserting that both equal
 * the shared constant would be `X === X` and could not fail under any drift.
 */
const workerSchema = createTLSchema({
  shapes: { ...defaultShapeSchemas, ...customShapeSchemas },
  bindings: { ...defaultBindingSchemas, ...customBindingSchemas },
})

describe('client / worker shape boundary', () => {
  it('the client util and the worker schema name the same shape type', () => {
    expect(NodeShapeUtil.type).toBe(NODE_SHAPE_TYPE)
    expect(Object.keys(customShapeSchemas)).toContain(NodeShapeUtil.type)
  })

  it('a record built from the CLIENT defaults is accepted by the WORKER validator', () => {
    const shape = {
      id: 'shape:boundary-ok',
      typeName: 'shape',
      type: NODE_SHAPE_TYPE,
      x: 0,
      y: 0,
      rotation: 0,
      index: 'a1',
      parentId: 'page:test',
      isLocked: false,
      opacity: 1,
      meta: {},
      props: new NodeShapeUtil({} as never).getDefaultProps(),
    }
    expect(() =>
      workerSchema.validateRecord(null as never, shape as never, 'createRecord', null),
    ).not.toThrow()
  })

  it('a record with a wrong-typed prop is REJECTED by the worker validator', () => {
    const shape = {
      id: 'shape:boundary-bad',
      typeName: 'shape',
      type: NODE_SHAPE_TYPE,
      x: 0,
      y: 0,
      rotation: 0,
      index: 'a1',
      parentId: 'page:test',
      isLocked: false,
      opacity: 1,
      meta: {},
      props: { ...nodeShapeDefaultProps, w: 'wide' as unknown as number },
    }
    // Assert the FAILURE TEXT, not merely that something threw: a check that
    // fails for the wrong reason gets "fixed" by changing the wrong thing.
    expect(() =>
      workerSchema.validateRecord(null as never, shape as never, 'createRecord', null),
    ).toThrow(/props\.w/)
  })

  it('the worker schema still knows tldraw own arrow binding — bindings REPLACE the defaults', () => {
    // The same replace-not-extend trap SPEC-003 hit with shapes. Without the
    // spread, every built-in binding becomes unknown at the room boundary.
    expect(workerSchema.serialize().sequences['com.tldraw.binding.arrow']).toBeDefined()
    // EVERY custom binding, derived from the registry rather than named one at
    // a time -- a list you have to remember to extend is a list that goes stale
    // the moment a second binding type lands, which is exactly what happened.
    for (const type of Object.keys(customBindingSchemas)) {
      expect(
        workerSchema.serialize().sequences[`com.tldraw.binding.${type}`],
        `worker schema is missing ${type}`,
      ).toBeDefined()
    }
  })

  it('client and worker carry the SAME migration sequence version for EVERY binding', () => {
    // Props validators can agree while the two sides carry different binding
    // sequences -- a connection-level failure no record check would see.
    //
    // BUILT FROM THE BINDING UTILS, which is the client's real source: its
    // synced schema comes from `bindingUtils`' statics, while the worker's comes
    // from `customBindingSchemas`. Two independent sources that agree today only
    // because each util aliases the shared constants -- and this is the check
    // that keeps them agreeing. It iterates rather than naming a type, because
    // the version that named one silently stopped covering the second.
    const clientBindings = Object.fromEntries(
      bindingUtils.map((util) => {
        const u = util as unknown as { type: string; props?: unknown; migrations?: unknown }
        return [u.type, { props: u.props, migrations: u.migrations }]
      }),
    )
    const clientSchema = createTLSchema({
      shapes: { ...defaultShapeSchemas, ...customShapeSchemas },
      bindings: { ...defaultBindingSchemas, ...clientBindings },
    })
    const custom = Object.keys(customBindingSchemas)
    expect(custom.length).toBeGreaterThan(1)
    for (const type of custom) {
      const key = `com.tldraw.binding.${type}`
      expect(clientSchema.serialize().sequences[key], `client is missing ${type}`).toBeDefined()
      expect(clientSchema.serialize().sequences[key], `${type} drifted`).toBe(
        workerSchema.serialize().sequences[key],
      )
    }
  })

  it('client and worker carry the SAME migration sequence version for the shape', () => {
    // Props validators can agree while the two sides carry different migration
    // sequences -- a connection-level failure the record-level checks above
    // cannot see, because no record is ever rejected.
    const clientSchema = createTLSchema({
      shapes: {
        ...defaultShapeSchemas,
        [NODE_SHAPE_TYPE]: {
          props: NodeShapeUtil.props,
          migrations: NodeShapeUtil.migrations,
        },
      },
      bindings: defaultBindingSchemas,
    })
    const key = `com.tldraw.shape.${NODE_SHAPE_TYPE}`
    expect(clientSchema.serialize().sequences[key]).toBe(workerSchema.serialize().sequences[key])
  })
})
