import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../ui'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface SidebarProps {
  /** The dialog's id, for the opener's aria-controls. */
  id: string
  open: boolean
  /** Escape, a backdrop click, or the close button. The owner returns focus. */
  onDismiss: () => void
  title: string
  children: ReactNode
}

/**
 * A panel that slides in from the right over a backdrop. Focus moves into it
 * and is trapped while it is open; Escape and a backdrop click dismiss it.
 * The owner decides where focus goes afterwards, because a link inside it
 * leaves for another page and must not pull focus back to the button.
 */
export function Sidebar({
  id,
  open,
  onDismiss,
  title,
  children,
}: SidebarProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    // One frame after mounting, so the slide has a start position.
    const frame = requestAnimationFrame(() => setEntered(true))
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = overflow
    }
  }, [open])

  if (!open) return null

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onDismiss()
      return
    }
    if (event.key !== 'Tab') return
    const items = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ].filter((element) => element.offsetParent !== null)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (
      event.shiftKey &&
      (active === first || !panelRef.current?.contains(active))
    ) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey &&
      (active === last || !panelRef.current?.contains(active))
    ) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div
        aria-hidden="true"
        onClick={onDismiss}
        className={cn(
          'absolute inset-0 bg-black/60 transition-opacity duration-200 motion-reduce:transition-none',
          entered ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute inset-y-0 right-0 flex w-[min(22rem,100vw)] flex-col bg-surface shadow-[var(--lm-shadow)] ring-1 ring-line transition-transform duration-200 ease-out motion-reduce:transition-none',
          entered ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            data-autofocus
            onClick={onDismiss}
            aria-label="Close"
            className="inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg transition hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
