import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@/router/Router'
import { ConnectorCard } from '../ConnectorCard'
import { UsernameForm, type SavedProfile } from '../profile/UsernameForm'
import { primaryButton, secondaryButton, textLink } from '../studio/parts'

interface WelcomeDialogProps {
  uid: string
  suggestedName: string
  avatarUrl: string | null
  onClose: () => void
}

/**
 * The one-time welcome step. First the connector link, then a username.
 * Both are optional, and closing it in any way counts as done.
 */
export function WelcomeDialog({
  uid,
  suggestedName,
  avatarUrl,
  onClose,
}: WelcomeDialogProps) {
  const [saved, setSaved] = useState<SavedProfile | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Portaled to the body: the account menu that mounts this lives inside the
  // nav, whose backdrop blur would otherwise become the containing block for
  // `position: fixed` and pin the dialog to the header.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="glass-strong relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl focus:outline-none sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-7">
          <div className="min-w-0">
            <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
              Welcome to AgentLemon
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Two things worth doing now. Both are optional, and you can find
              them later in Settings.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6 sm:px-7">
          <section aria-labelledby={`${titleId}-1`}>
            <StepHeading id={`${titleId}-1`} n={1}>
              Connect AgentLemon to your AI
            </StepHeading>
            <ConnectorCard variant="welcome" />
          </section>

          <section aria-labelledby={`${titleId}-2`}>
            <StepHeading id={`${titleId}-2`} n={2}>
              Choose a username
            </StepHeading>
            {saved ? (
              <p
                role="status"
                className="text-sm text-slate-700 dark:text-slate-200"
              >
                You are{' '}
                <Link
                  to={`/u/${saved.handle}`}
                  onClick={onClose}
                  className={textLink}
                >
                  @{saved.handle}
                </Link>
                . Agents you publish appear under this name, and friends can
                find you by it.
              </p>
            ) : (
              <>
                <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                  You need one to publish agents and to add friends.
                </p>
                <UsernameForm
                  uid={uid}
                  profile={null}
                  suggestedName={suggestedName}
                  avatarUrl={avatarUrl}
                  onSaved={setSaved}
                />
              </>
            )}
          </section>
        </div>

        <footer className="flex justify-end border-t border-slate-900/10 px-5 py-4 sm:px-7 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className={saved ? primaryButton : secondaryButton}
          >
            {saved ? 'Done' : 'Skip for now'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function StepHeading({
  id,
  n,
  children,
}: {
  id: string
  n: number
  children: string
}) {
  return (
    <h3
      id={id}
      className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-teal-500/15 text-xs font-semibold text-teal-700 dark:text-teal-300">
        {n}
      </span>
      {children}
    </h3>
  )
}
