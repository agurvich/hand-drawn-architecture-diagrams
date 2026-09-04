import { describe, it, expect } from 'vitest'
import { createTLSchema, defaultShapeSchemas, defaultBindingSchemas } from '@tldraw/tlschema'
import { NodeShapeUtil } from '../../client/shapes/NodeShapeUtil'
import { customShapeSchemas, NODE_SHAPE_TYPE, nodeShapeDefaultProps } from './index'

/**
 * The ONE test that legitimately imports across both runtimes. `shared-imports.test.ts`
 * excludes `*.test.*` for exactly this reason.
 *
 * It asserts the client half against the WORKER half. Asserting that both equal
 * the shared constant would be `X === X` and could not fail under any drift.
 */
const workerSchema = createTLSchema({
  shapes: { ...defaultShapeSchemas, ...customShapeSchemas },
  bindings: defaultBindingSchemas,
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
