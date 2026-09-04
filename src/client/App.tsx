import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'

/**
 * SPEC-001: a bare tldraw canvas and nothing else.
 *
 * Deliberately absent, and each for a reason a later spec owns:
 *  - no `persistenceKey` — SPEC-001 FR-002 requires the canvas to forget on
 *    reload, so SPEC-002 does not have to remove a second home for state
 *  - no `licenseKey` — localhost needs none; production is fenced until the
 *    licence question is settled (architecture.md -> Known Constraints)
 *  - no custom shapes, tools or sync — SPEC-002 and SPEC-003
 */
export function App() {
  return (
    <div className="canvas-host" data-testid="canvas-host">
      <Tldraw onMount={handleMount} />
    </div>
  )
}

/**
 * Expose the editor for e2e assertions.
 *
 * The alternative is asserting against tldraw's internal DOM, which is not a
 * contract and changes between releases -- a test that breaks on an SDK upgrade
 * while the app still works is worse than no test.
 */
function handleMount(editor: Editor) {
  window.__editor = editor
}
