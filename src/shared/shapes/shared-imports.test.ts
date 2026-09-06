import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'

// Resolved from the repo root (vitest's cwd) rather than import.meta.url, which
// is not a file: URL under the jsdom transform.
const ROOT = process.cwd()
const SHARED_DIR = resolve(ROOT, 'src/shared')
const CLIENT_DIR = resolve(ROOT, 'src/client')
const WORKER_DIR = resolve(ROOT, 'src/worker')
const FIXTURES = resolve(ROOT, 'src/shared/shapes/__fixtures__')

/**
 * `@tldraw/store` is here for BaseRecord and RecordId, which @tldraw/tlschema
 * IMPORTS and does not re-export -- SPEC-008's frame records cannot be typed
 * without it. That is the whole of the widening, decided in the spec rather than
 * in a build: `tldraw` itself stays forbidden, because importing it would pull
 * React, the DOM and CSS into the Worker bundle, which is why this fence exists.
 */
const ALLOWED_SHARED_IMPORTS = ['@tldraw/tlschema', '@tldraw/validate', '@tldraw/store']
// Extended, not duplicated: one rule covering every shape, binding AND record type.
const TYPE_LITERALS = [
  "'diagramNode'",
  "'diagramConnection'",
  "'connectionEndpoint'",
  "'diagramFrame'",
  "'diagramFrameView'",
  "'diagramOffFrame'",
]

/**
 * The three modules that legitimately WRITE a type string -- they are the one
 * definition every other file consumes.
 *
 * Full paths, not basenames: a future `src/shared/<anything>/node.ts` would
 * otherwise be silently exempt from the check, which is the quiet way a gate
 * stops guarding.
 */
const TYPE_DEFINITION_MODULES = [
  resolve(SHARED_DIR, 'shapes/node.ts'),
  resolve(SHARED_DIR, 'shapes/connection.ts'),
  resolve(SHARED_DIR, 'bindings/connection.ts'),
  resolve(SHARED_DIR, 'frames/frame.ts'),
]

/** Source files under `root`, excluding tests and fixtures. */
function sourceFiles(root: string, opts: { includeTests?: boolean } = {}): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (full.startsWith(FIXTURES)) continue // fixtures are never real sources
        walk(full)
        continue
      }
      if (!['.ts', '.tsx'].includes(extname(full))) continue
      if (!opts.includeTests && /\.test\.tsx?$/.test(full)) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

/**
 * The check itself, as a function, so the fixture below can run it against a
 * planted violation. A gate is not tested by running it on the thing it guards.
 */
function filesDeclaringShapeTypeLiteral(files: { path: string; text: string }[]): string[] {
  return files
    .filter((f) => TYPE_LITERALS.some((literal) => f.text.includes(literal)))
    .map((f) => f.path)
}

describe('FR-001 — one definition, two consumers', () => {
  it('only the shared definition writes any shape OR binding type string', () => {
    // src/shared is scanned too, minus the three definition modules. It was the
    // one directory the check did not cover, which made it exactly the place a
    // duplicate literal could land unseen -- and SPEC-007's document.ts is a
    // shared module that names all three types.
    const consumers = [
      ...sourceFiles(CLIENT_DIR),
      ...sourceFiles(WORKER_DIR),
      ...sourceFiles(SHARED_DIR).filter((path) => !TYPE_DEFINITION_MODULES.includes(path)),
    ].map((path) => ({
      path,
      text: readFileSync(path, 'utf8'),
    }))
    expect(filesDeclaringShapeTypeLiteral(consumers)).toEqual([])
  })

  it('THE CHECK BITES IN src/shared TOO, not only in the consumer trees', () => {
    const planted = [
      {
        path: 'src/shared/Planted.ts',
        text: readFileSync(join(FIXTURES, 'duplicate-type-literal.txt'), 'utf8'),
      },
    ]
    expect(filesDeclaringShapeTypeLiteral(planted)).toEqual(['src/shared/Planted.ts'])
  })

  it('the definition modules are exempt by FULL PATH, and every one still exists', () => {
    // An exclusion pointing at a moved file is an exclusion that exempts
    // nothing and hides a real violation behind a passing test.
    for (const path of TYPE_DEFINITION_MODULES) {
      expect(statSync(path).isFile()).toBe(true)
      expect(filesDeclaringShapeTypeLiteral([{ path, text: readFileSync(path, 'utf8') }])).toEqual([
        path,
      ])
    }
  })

  it('THE CHECK BITES: a planted duplicate literal is caught, with the offending path named', () => {
    const planted = [
      {
        path: 'src/client/Planted.ts',
        text: readFileSync(join(FIXTURES, 'duplicate-type-literal.txt'), 'utf8'),
      },
    ]
    const offenders = filesDeclaringShapeTypeLiteral(planted)
    expect(offenders).toEqual(['src/client/Planted.ts'])
  })

  it('THE CHECK IS SILENT on a legitimate consumer that imports the constant', () => {
    // A corpus of only-failures cannot see a false positive.
    const clean = [
      {
        path: 'src/client/Clean.ts',
        text: "import { NODE_SHAPE_TYPE } from '@shared/shapes'\nexport const t = NODE_SHAPE_TYPE\n",
      },
    ]
    expect(filesDeclaringShapeTypeLiteral(clean)).toEqual([])
  })

  it('src/shared imports only tlschema and validate — never `tldraw`', () => {
    // Importing `tldraw` would pull React, the DOM and CSS into the Worker bundle.
    // Tests are excluded: boundary.test.ts must import the client util by design.
    const violations: string[] = []
    for (const file of sourceFiles(SHARED_DIR)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1]
        if (spec.startsWith('.')) continue
        if (!ALLOWED_SHARED_IMPORTS.includes(spec)) violations.push(`${file}: ${spec}`)
      }
    }
    expect(violations).toEqual([])
  })
})
