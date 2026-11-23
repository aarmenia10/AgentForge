import { Palette } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { AppearanceControls } from './AppearanceControls'

/**
 * The nav's "Appearance" button and its panel. Open to everyone, signed in or
 * not. The panel hangs off the header (not the button) so it can span the
 * screen on a phone without leaving the viewport.
 */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      )
        return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-fg-muted transition hover:bg-surface hover:text-fg md:px-3.5"
      >
        <Palette className="size-5 md:size-4" aria-hidden="true" />
        <span className="sr-only md:not-sr-only">Appearance</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="Appearance"
          className="absolute inset-x-4 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-3xl bg-surface p-5 shadow-[var(--lm-shadow)] ring-1 ring-line sm:inset-x-auto sm:right-6 sm:w-96 lg:right-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]"
        >
          <h2 className="mb-4 text-lg">Appearance</h2>
          <AppearanceControls />
        </div>
      )}
    </>
  )
}
