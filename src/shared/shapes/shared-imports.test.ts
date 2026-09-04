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

const ALLOWED_SHARED_IMPORTS = ['@tldraw/tlschema', '@tldraw/validate']
// Extended, not duplicated: one rule covering every shape AND binding type.
const TYPE_LITERALS = ["'diagramNode'", "'diagramConnection'", "'connectionEndpoint'"]

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
    const consumers = [...sourceFiles(CLIENT_DIR), ...sourceFiles(WORKER_DIR)].map((path) => ({
      path,
      text: readFileSync(path, 'utf8'),
    }))
    expect(filesDeclaringShapeTypeLiteral(consumers)).toEqual([])
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
