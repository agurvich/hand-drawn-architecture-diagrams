import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'

// Resolved from the repo root (vitest's cwd) rather than import.meta.url, which
// is not a file: URL under the jsdom transform.
const ROOT = process.cwd()
const SHARED_DIR = resolve(ROOT, 'src/shared')
const CLIENT_DIR = resolve(ROOT, 'src/client')
const WORKER_DIR = resolve(ROOT, 'src/worker')
const FIXTURES = resolve(ROOT, 'src/shared/shapes/__fixtures__')
const CORPUS_DIR = resolve(ROOT, 'src/shared/sketch/__corpus__')

/**
 * `@tldraw/store` is here for BaseRecord and RecordId, which @tldraw/tlschema
 * IMPORTS and does not re-export -- SPEC-008's scene records cannot be typed
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
  "'connectionActor'",
  "'diagramScene'",
  // The PREFIXED form too. The check looks for the closing quote, so
  // `'diagramScene:'` slips past `"'diagramScene'"` on the colon -- a second
  // home for the type string, hidden behind one character.
  "'diagramScene:'",
  "'diagramSceneView'",
  "'diagramOffScene'",
  "'diagramSketchMode'",
  "'diagramKind'",
  "'diagramKind:'",
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
  resolve(SHARED_DIR, 'bindings/actor.ts'),
  resolve(SHARED_DIR, 'scenes/scene.ts'),
  resolve(SHARED_DIR, 'scenes/sceneType.ts'),
  resolve(SHARED_DIR, 'sketch/mode.ts'),
  resolve(SHARED_DIR, 'kinds/kindType.ts'),
]

/**
 * Relative imports that resolve OUTSIDE `root`, as a pure function over
 * `{path, text}` pairs so planted fixtures can prove it bites.
 *
 * EXTRACTED, not reused: the `tldraw` fence below is written inline, and its
 * loop `continue`s past every relative specifier -- which is the hole this
 * closes. A shared module importing `'../client/foo'` walked straight through
 * both checks, because the allowlist only ever saw bare specifiers.
 *
 * Resolution is textual and deliberately crude: `resolve(dirname(file), spec)`
 * and a prefix test. It cannot follow a path alias, and `src/shared` has none;
 * if one is ever added this gate goes quiet, which is why the clean fixture
 * asserts silence rather than the production tree alone.
 */
export function filesEscaping(
  root: string,
  files: readonly { path: string; text: string }[],
): string[] {
  const out: string[] = []
  for (const { path, text } of files) {
    /*
     * Two forms, because one of them has no `from`. A SIDE-EFFECT import --
     * `import './x'` or `import 'tldraw'` -- carries no binding and slipped a
     * `from`-only pattern entirely; prepending `import 'tldraw'` to `palette.ts`
     * left every assertion here green. A DYNAMIC `await import('…')` has no
     * `from` either. `import type` and `export … from` are both caught by the
     * first pattern, verified.
     *
     * A double-quoted specifier still slips, and that is closed elsewhere:
     * prettier's `singleQuote` plus `format:check` as a pre-push gate.
     */
    const specs = [
      ...[...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!),
      ...[...text.matchAll(/^\s*import\s+'([^']+)'/gm)].map((m) => m[1]!),
      ...[...text.matchAll(/import\('([^']+)'\)/g)].map((m) => m[1]!),
    ]
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue
      const target = resolve(dirname(path), spec)
      if (!target.startsWith(root + '/') && target !== root) out.push(`${path}: ${spec}`)
    }
  }
  return out
}

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

  it('THE CHECK BITES ON THE PREFIXED FORM, which one character used to hide', () => {
    // `'diagramScene:'` does not contain `'diagramScene'` -- the closing quote
    // is a colon -- so before the prefixed literal joined the list, a hand-
    // written id prefix was a second home for the type string that this gate
    // walked straight past. That is the failure the gate exists to stop, so it
    // owes a fixture rather than a claim.
    const planted = [
      {
        path: 'src/shared/PlantedPrefix.ts',
        text: readFileSync(join(FIXTURES, 'prefixed-type-literal.txt'), 'utf8'),
      },
    ]
    expect(filesDeclaringShapeTypeLiteral(planted)).toEqual(['src/shared/PlantedPrefix.ts'])
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
    //
    // `sketch/__corpus__` is excluded HERE rather than in `sourceFiles`, which
    // also feeds the shape-type-literal check above: skipping the directory
    // there would exempt it from a second fence it was never meant to leave.
    // It reads the recorded stroke corpus out of `docs/` with `node:fs`, and
    // this fence is about what ships -- `corpus.test.ts` carries the guard that
    // nothing shipping imports it.
    const violations: string[] = []
    for (const file of sourceFiles(SHARED_DIR)) {
      if (file.startsWith(CORPUS_DIR)) continue
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1]
        if (spec.startsWith('.')) continue
        if (!ALLOWED_SHARED_IMPORTS.includes(spec)) violations.push(`${file}: ${spec}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('THE ESCAPE CHECK BITES on a relative import out of src/shared', () => {
    /*
     * A gate is not tested by running it on the thing it guards.
     *
     * The check is PER FILE and textual -- it does not resolve a chain. The
     * planted pair is still worth having, but for a narrower reason than an
     * earlier comment here claimed: it asserts the gate flags the file that
     * actually escapes and stays silent about the one that merely points at it.
     * Transitivity comes from the universal quantification in the test below,
     * not from walking a graph.
     */
    const dir = resolve(FIXTURES, 'escape')
    const planted = ['hop-one.txt', 'hop-two.txt'].map((name) => ({
      path: resolve(SHARED_DIR, 'shapes', name),
      text: readFileSync(resolve(dir, name), 'utf8'),
    }))
    const violations = filesEscaping(SHARED_DIR, planted)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('../../../client/kindVocabulary')
  })

  it('BITES on the two forms that carry no `from` clause', () => {
    // A side-effect import and a dynamic one. Both escaped a `from`-only
    // pattern, and side-effect imports exist in this codebase today -- a shared
    // module gaining one would have walked straight through.
    const violations = filesEscaping(SHARED_DIR, [
      {
        path: resolve(SHARED_DIR, 'shapes', 'side-effect.txt'),
        text: readFileSync(resolve(FIXTURES, 'escape', 'side-effect.txt'), 'utf8'),
      },
    ])
    expect(violations).toHaveLength(2)
    expect(violations.join(' ')).toContain('devOnly')
    expect(violations.join(' ')).toContain('kindVocabulary')
  })

  it('and SAYS NOTHING about imports that stay inside, or allowlisted bare ones', () => {
    const planted = [
      {
        path: resolve(SHARED_DIR, 'shapes', 'clean.txt'),
        text: readFileSync(resolve(FIXTURES, 'escape', 'clean.txt'), 'utf8'),
      },
    ]
    expect(filesEscaping(SHARED_DIR, planted)).toEqual([])
  })

  it('no src/shared source reaches outside src/shared', () => {
    /*
     * The fence FR-003 asks for, in the form that is actually true.
     *
     * An earlier wording asked that `document.ts` reach no tldraw package
     * TRANSITIVELY -- false the day it was written, since it imports
     * `./shapes/node`, which imports `@tldraw/tlschema`. What holds is this plus
     * the bare-specifier check below it: `tldraw` is forbidden in EVERY shared
     * source, so transitivity within `src/shared` comes free from the universal
     * quantification, and this closes the relative-escape hole that made the
     * quantification incomplete.
     */
    /*
     * TESTS EXCLUDED, for the reason the `tldraw` fence beside this one states:
     * `boundary.test.ts` imports the worker schema and the client registry BY
     * DESIGN -- asserting on the built schema is the only way to see whether a
     * record type survived, and a source scan would pass on an argument that was
     * silently discarded. Excluding them here keeps the two fences agreeing
     * about what they govern.
     */
    const files = sourceFiles(SHARED_DIR)
      .filter((f) => !f.startsWith(CORPUS_DIR))
      .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    expect(filesEscaping(SHARED_DIR, files)).toEqual([])
  })

  it('palette.ts resolves no import at all, which is what lets document.ts reach it', () => {
    // `document.ts` names `VocabularyEntry` and calls `freePair`. That is only
    // safe because this module is a leaf: no bare specifier, no relative one.
    const text = readFileSync(resolve(SHARED_DIR, 'kinds/palette.ts'), 'utf8')
    expect([...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])).toEqual([])
    // Side-effect form too, which carries no `from`.
    expect([...text.matchAll(/^\s*import\s+'([^']+)'/gm)].map((m) => m[1])).toEqual([])
  })
})
