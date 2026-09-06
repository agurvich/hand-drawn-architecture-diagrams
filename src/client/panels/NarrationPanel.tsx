import { useEffect, useId, useRef, useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { isSceneStale, type SceneRecord } from '@shared/scenes'
import {
  captureScene,
  deleteScene,
  moveScene,
  recaptureScene,
  sceneState,
  scenesInOrder,
  stepScene,
  updateScene,
  viewScene,
} from '../sceneView'

interface NarrationPanelProps {
  /** The mounted editor, or null before `onMount` has run. */
  editor: Editor | null
}

/**
 * Scenes: named, saved ways of looking at the diagram.
 *
 * Stepping is the common action and list management is not, so forward and back
 * sit outside the list and the list is a thing you open. When no scene is active
 * and the list is closed, the surface is one small control -- narration is a mode
 * you enter, not a permanent panel.
 *
 * @example
 * <NarrationPanel editor={editor} />
 */
export function NarrationPanel({ editor }: NarrationPanelProps) {
  const [open, setOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<SceneRecord['id'] | null>(null)
  const launchButton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const hadPending = useRef(false)
  const headingId = useId()

  const scenes = useValue('scenes', () => (editor ? scenesInOrder(editor) : []), [editor])
  const active = useValue('active scene', () => (editor ? sceneState(editor).scene : null), [
    editor,
  ])
  const offScene = useValue(
    'off scene',
    () => (editor ? sceneState(editor).offScene.size > 0 : false),
    [editor],
  )
  // NOT gated on `open`: the bar marks the active scene stale too, because a
  // presenter stepping with the list closed would otherwise be shown a scene
  // that points at nothing as though it were working.
  const staleIds = useValue(
    'stale scenes',
    () => {
      if (!editor) return new Set<string>()
      const get = (id: string) => editor.getShape(id as never)
      return new Set(scenes.filter((s) => isSceneStale(s, get)).map((s) => s.id as string))
    },
    [editor, scenes],
  )

  useEffect(() => {
    if (open) panel.current?.focus()
    else if (wasOpen.current) launchButton.current?.focus()
    wasOpen.current = open
  }, [open])

  useEffect(() => {
    if (pendingDeleteId) confirmButton.current?.focus()
    else if (hadPending.current) panel.current?.focus()
    hadPending.current = pendingDeleteId !== null
  }, [pendingDeleteId])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (pendingDeleteId) setPendingDeleteId(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, pendingDeleteId])

  if (!editor) return null

  const step = (delta: -1 | 1) => stepScene(editor, delta)
  const pendingDelete = scenes.find((s) => s.id === pendingDeleteId) ?? null
  const position = active ? scenes.findIndex((s) => s.id === active.id) : -1

  return (
    <div className="narration">
      {open && (
        <div
          ref={panel}
          tabIndex={-1}
          className="narration__panel"
          role="region"
          aria-labelledby={headingId}
          data-testid="narration-panel"
        >
          <div className="narration__header">
            <h2 id={headingId} className="narration__heading">
              Scenes
            </h2>
            <button
              type="button"
              className="narration__button"
              data-testid="narration-close"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          {scenes.length === 0 ? (
            <p className="narration__empty" data-testid="narration-empty">
              A scene remembers which containers are folded, so you can step someone through the
              diagram without rearranging it. Set the view up, then capture it.
            </p>
          ) : (
            <ol className="narration__list" data-testid="narration-list">
              {scenes.map((scene, i) => (
                <li key={scene.id} className="narration__item">
                  <button
                    type="button"
                    className={`narration__select${scene.id === active?.id ? ' narration__select--active' : ''}`}
                    data-testid="narration-select"
                    aria-current={scene.id === active?.id ? 'true' : undefined}
                    onClick={() => viewScene(editor, scene.id)}
                  >
                    <span className="narration__name">{scene.name}</span>
                    {staleIds.has(scene.id as string) && (
                      <span className="narration__stale" data-testid="narration-stale">
                        <span aria-hidden="true">⚠</span>
                        <span className="narration__sr"> — nothing it names is still here</span>
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="narration__button"
                    data-testid="narration-up"
                    aria-label={`Move ${scene.name} earlier`}
                    disabled={i === 0}
                    onClick={() => moveScene(editor, scene.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="narration__button"
                    data-testid="narration-down"
                    aria-label={`Move ${scene.name} later`}
                    disabled={i === scenes.length - 1}
                    onClick={() => moveScene(editor, scene.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="narration__button"
                    data-testid="narration-delete"
                    aria-label={`Delete ${scene.name}`}
                    onClick={() => setPendingDeleteId(scene.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}

          <button
            type="button"
            className="narration__button"
            data-testid="narration-capture"
            onClick={() => captureScene(editor, `Scene ${scenes.length + 1}`)}
          >
            Capture this view
          </button>

          {active && (
            <>
              <label className="narration__label" htmlFor={`${headingId}-name`}>
                Name
              </label>
              <input
                key={`${active.id}-name`}
                id={`${headingId}-name`}
                className="narration__input"
                data-testid="narration-name"
                defaultValue={active.name}
                onBlur={(e) => updateScene(editor, active.id, { name: e.target.value })}
              />
              <label className="narration__label" htmlFor={`${headingId}-note`}>
                Note
              </label>
              <textarea
                key={`${active.id}-note`}
                id={`${headingId}-note`}
                className="narration__input narration__input--note"
                data-testid="narration-note-input"
                defaultValue={active.note}
                onBlur={(e) => updateScene(editor, active.id, { note: e.target.value })}
              />
              <button
                type="button"
                className="narration__button"
                data-testid="narration-recapture"
                onClick={() => recaptureScene(editor, active.id)}
              >
                Update to this view
              </button>
            </>
          )}

          {pendingDelete && (
            <div
              className="narration__confirm"
              role="dialog"
              aria-labelledby={`${headingId}-confirm`}
              data-testid="narration-confirm"
            >
              <p id={`${headingId}-confirm`}>
                Delete “{pendingDelete.name}” for everyone in this room? The diagram is not touched,
                and this is not undoable.
              </p>
              <button
                type="button"
                ref={confirmButton}
                className="narration__button"
                data-testid="narration-confirm-yes"
                onClick={() => {
                  deleteScene(editor, pendingDelete.id)
                  setPendingDeleteId(null)
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="narration__button"
                data-testid="narration-confirm-no"
                onClick={() => setPendingDeleteId(null)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {/* Permanently mounted, text swapped: a live region inserted WITH its
          content already present is the classic case assistive tech does not
          announce, because the region was never in the tree to mutate. */}
      <p
        className={`narration__off${offScene ? '' : ' narration__off--empty'}`}
        role="status"
        data-testid="narration-off-scene"
      >
        {offScene && (
          <>
            You have changed something this scene sets.{' '}
            <button
              type="button"
              className="narration__link"
              data-testid="narration-restore"
              onClick={() => active && viewScene(editor, active.id)}
            >
              Back to the scene
            </button>
          </>
        )}
      </p>

      {active && active.note !== '' && (
        <p className="narration__note" data-testid="narration-note">
          {active.note}
        </p>
      )}

      <div className="narration__bar">
        <button
          type="button"
          className="narration__button"
          data-testid="narration-back"
          aria-label="Previous scene"
          disabled={scenes.length === 0 || position === 0}
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          ref={launchButton}
          className="narration__button narration__button--wide"
          data-testid="narration-open"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {active ? (
            <>
              <span className="narration__name">
                {position + 1}/{scenes.length} {active.name}
              </span>
              {staleIds.has(active.id as string) && (
                <span className="narration__stale">
                  <span aria-hidden="true"> ⚠</span>
                  <span className="narration__sr"> — nothing it names is still here</span>
                </span>
              )}
            </>
          ) : (
            'Scenes'
          )}
        </button>
        <button
          type="button"
          className="narration__button"
          data-testid="narration-forward"
          aria-label="Next scene"
          disabled={scenes.length === 0 || position === scenes.length - 1}
          onClick={() => step(1)}
        >
          ›
        </button>
      </div>
    </div>
  )
}
