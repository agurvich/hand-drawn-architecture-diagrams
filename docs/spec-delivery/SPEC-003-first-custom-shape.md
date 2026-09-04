# Completed Spec — SPEC-003: First custom shape under sync

## What was completed?

- **One definition, two consumers.** `src/shared/shapes/node.ts` holds the `diagramNode` type string,
  props, validators, migrations and the `TLGlobalShapePropsMap` augmentation. The client builds a
  `ShapeUtil` from it; the worker builds `roomSchema` from it. Neither writes the type string.
- **`NodeShapeUtil`** — a labelled box on `BaseBoxShapeUtil`, with `getIndicatorPath` and
  `canEdit() -> true`, plus `NodeTool` and a `Toolbar` override that puts it on the toolbar.
- **`src/worker/schema.ts`** — `createTLSchema` with `defaultShapeSchemas` spread in alongside the
  custom shapes, registered on the room.
- **A v2 `color` migration**, and `src/client/devOnly.ts` — an opt-in permissive client schema used to
  prove worker-side rejection.

## Gates that were proven to bite, not merely to pass

- **The type-string check** has a planted-duplicate fixture asserting it fires with the offending path
  named, *and* a case asserting it stays silent on a legitimate consumer. A corpus of only-failures
  cannot see a false positive.
- **The boundary rejection** is asserted against the validator's failure text (`props.w`), not merely
  that something threw.
- **The dev-only escape hatch** is asserted absent from a production bundle by building and grepping
  for its marker string.
- **The client/worker migration versions** are compared directly. Props validators can agree while the
  two sides carry different migration sequences — a connection-level failure no record-level check
  can see, because nothing is ever rejected.

### Deliberate deviations

- **`uiOverrides.tools` alone does not put a tool on the toolbar.** It registers the tool; the toolbar
  renders a fixed set. A `components.Toolbar` override was required — the spec assumed the override
  was sufficient.
- **FR-005's worker-restart criterion is covered by the durable-storage assertion**, not by restarting
  a process. SPEC-002 recorded process restart as not reliably drivable under Playwright's
  `webServer`; asserting the record reaches `ctx.storage` tests the same property more directly.

## What changed from earlier specs?

- **`RoomDurableObject` now takes an explicit `schema`.** Verified equivalent to the previous implicit
  default (`TLSocketRoom` already defaulted to `createTLSchema()`), so pre-existing rooms are
  unaffected; the `AddColor` migration is retroactive and matches no existing record.
- **`vite.config.ts` lost its `build.outDir` override.** It fought the Cloudflare plugin's layout and
  produced `dist/client/client/assets`, which did not match the `[assets] directory` in
  `wrangler.toml` — a latent deploy break, invisible in dev because the plugin serves from memory.
- `Room.tsx` now passes `shapeUtils`, `tools`, `overrides` and `components`.

## Verification

typecheck 0 · oxlint 0 · prettier 0 · unit 25/25 · e2e 27/27 · spec-lint 0 · docs-lint ok.

Not covered: the properties panel, styling, nesting, connections — all explicitly Out of Scope.
