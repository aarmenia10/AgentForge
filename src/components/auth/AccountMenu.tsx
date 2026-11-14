import { ChevronDown, LogOut, MailWarning } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { describeAuthError } from '@/auth/authErrors'
import { cn } from '../ui'

/**
 * The nav's account slot: a quiet "Sign in" when signed out, an account
 * disclosure when signed in. Signed-out visitors are never blocked from
 * anything; this is the only place sign-in is offered until a user tries to
 * publish, star, or add a friend.
 */
export function AccountMenu() {
  const auth = useAuth()

  if (auth.status === 'restoring') {
    // Holds the slot while a returning session is confirmed, so the nav does not jump.
    return <span className="h-10 w-16" aria-hidden="true" />
  }

  if (auth.status === 'signed-out' || !auth.user) {
    return (
      <button
        type="button"
        onClick={() => auth.openSignIn()}
        className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        Sign in
      </button>
    )
  }

  return <SignedInMenu />
}

function SignedInMenu() {
  const { user, needsEmailVerification, refreshUser, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState<'idle' | 'checking' | 'not-yet'>(
    'idle',
  )
  const [signingOut, setSigningOut] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  if (!user) return null
  const label = user.displayName || user.email
  const firstName = label.split(/[\s@]/)[0]

  async function onSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setError(null)
    try {
      await signOut()
      setOpen(false)
    } catch (err) {
      setError(describeAuthError(err, 'sign-out'))
    } finally {
      setSigningOut(false)
    }
  }

  async function onCheckVerified() {
    if (checking === 'checking') return
    setChecking('checking')
    setError(null)
    try {
      const fresh = await refreshUser()
      // A verified user drops the reminder through the auth listener.
      setChecking(fresh?.emailVerified ? 'idle' : 'not-yet')
    } catch {
      setChecking('idle')
      setError('Could not check right now. Try again in a minute.')
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          buttonRef.current?.focus()
        }
      }}
      onBlur={(event) => {
        if (
          open &&
          !rootRef.current?.contains(event.relatedTarget as Node | null)
        )
          setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account: ${label}${needsEmailVerification ? ', email not verified' : ''}`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-xl px-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-900/5 sm:pr-2.5 dark:text-slate-200 dark:hover:bg-white/10"
      >
        <span className="relative">
          <Avatar name={label} url={user.avatarUrl} />
          {needsEmailVerification && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-navy-900" />
          )}
        </span>
        <span className="hidden max-w-32 truncate sm:block">{firstName}</span>
        <ChevronDown
          className={cn(
            'hidden size-4 text-slate-400 transition sm:block',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        // Opaque on purpose: a backdrop blur nested inside the nav's own blur cannot
        // blur the page behind it, so a translucent panel would let text show through.
        className="absolute right-0 top-12 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-900/10 bg-white p-2 shadow-xl shadow-slate-900/10 dark:border-white/10 dark:bg-navy-900 dark:shadow-black/40"
      >
        <div className="px-3 py-2.5">
          <p className="truncate text-sm font-semibold">
            {user.displayName || 'Your account'}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {user.email}
          </p>
        </div>

        {needsEmailVerification && (
          <div className="mx-1 mb-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
            <p className="flex items-center gap-1.5 font-medium">
              <MailWarning className="size-4 shrink-0" aria-hidden="true" />
              Verify your email
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              Open the link we sent to {user.email}. Publishing and friend
              requests unlock once it is confirmed.
            </p>
            <button
              type="button"
              onClick={onCheckVerified}
              aria-disabled={checking === 'checking' || undefined}
              className="mt-2 text-xs font-semibold text-amber-900 underline underline-offset-2 aria-disabled:opacity-70 dark:text-amber-100"
            >
              {checking === 'checking' ? 'Checking' : 'I have confirmed it'}
            </button>
            {checking === 'not-yet' && (
              <p role="status" className="mt-1 text-xs">
                Not confirmed yet. Open the link in the email, then try again.
              </p>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mx-3 mb-1 text-xs text-rose-700 dark:text-rose-300"
          >
            {error}
          </p>
        )}

        <div className="mt-1 border-t border-slate-900/10 pt-1 dark:border-white/10">
          <button
            type="button"
            onClick={onSignOut}
            aria-disabled={signingOut || undefined}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-900/5 aria-disabled:opacity-60 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-8 rounded-full object-cover"
      />
    )
  }
  return (
    <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-navy-600 text-xs font-semibold uppercase text-white">
      {name.trim().charAt(0) || '?'}
    </span>
  )
}
