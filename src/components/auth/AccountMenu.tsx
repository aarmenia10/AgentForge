import {
  ChevronDown,
  ClipboardCheck,
  LayoutGrid,
  LogOut,
  MailWarning,
  Plus,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { describeAuthError } from '@/auth/authErrors'
import { Link, useRoute } from '@/router/Router'
import { needsWelcomeCheck } from '../profile/profileMemory'
import { cn } from '../ui'

// Its own chunk, and it reaches Firestore only for a user this browser has
// not yet seen with a profile or a welcome (P2-14).
const WelcomeGate = lazy(() => import('../welcome/WelcomeGate'))

/**
 * Admin status per uid, asked once per session the first time the menu
 * opens. The services module (and Firestore) loads only then.
 */
const adminByUid = new Map<string, Promise<boolean>>()
function checkAdmin(uid: string): Promise<boolean> {
  let pending = adminByUid.get(uid)
  if (!pending) {
    pending = import('@/services/agents')
      .then((module) => module.isCurrentUserAdmin())
      .catch(() => {
        // Not cached, so the next open asks again.
        adminByUid.delete(uid)
        return false
      })
    adminByUid.set(uid, pending)
  }
  return pending
}

const MENU_LINKS: readonly { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/me', label: 'My agents', icon: LayoutGrid },
  { to: '/studio', label: 'New agent', icon: Plus },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

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

  // Keyed so a different account starts with fresh menu state.
  return <SignedInMenu key={auth.user.uid} />
}

function SignedInMenu() {
  const {
    user,
    needsEmailVerification,
    refreshUser,
    sendVerificationEmail,
    signOut,
    dialog,
  } = useAuth()
  const { route } = useRoute()
  const [open, setOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    'idle',
  )
  const [welcomeFor, setWelcomeFor] = useState<string | null>(null)
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

  const uid = user?.uid ?? null
  useEffect(() => {
    if (!open || !uid) return
    let active = true
    void checkAdmin(uid).then((admin) => active && setIsAdmin(admin))
    return () => {
      active = false
    }
  }, [open, uid])

  // The welcome step: once per user, never over the sign-in dialog, and not on
  // Settings, which already has everything it offers. Latched, so it stays
  // mounted after it records itself as shown.
  const signInOpen = dialog !== null
  useEffect(() => {
    if (!uid || welcomeFor === uid) return
    if (signInOpen || route.name === 'settings') return
    if (needsWelcomeCheck(uid)) setWelcomeFor(uid)
  }, [uid, welcomeFor, signInOpen, route.name])

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

  async function onResend() {
    if (resend === 'sending') return
    setResend('sending')
    try {
      await sendVerificationEmail()
      setResend('sent')
    } catch {
      setResend('failed')
    }
  }

  return (
    <>
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
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={onCheckVerified}
                  aria-disabled={checking === 'checking' || undefined}
                  className="text-xs font-semibold text-amber-900 underline underline-offset-2 aria-disabled:opacity-70 dark:text-amber-100"
                >
                  {checking === 'checking' ? 'Checking' : 'I have confirmed it'}
                </button>
                <button
                  type="button"
                  onClick={onResend}
                  aria-disabled={resend === 'sending' || undefined}
                  className="text-xs font-semibold text-amber-900 underline underline-offset-2 aria-disabled:opacity-70 dark:text-amber-100"
                >
                  {resend === 'sending' ? 'Sending' : 'Send the email again'}
                </button>
              </div>
              {resend === 'sent' && (
                <p role="status" className="mt-1 text-xs">
                  Sent. Check your inbox and spam folder.
                </p>
              )}
              {resend === 'failed' && (
                <p role="status" className="mt-1 text-xs">
                  Could not send it right now. Try again in a few minutes.
                </p>
              )}
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

          <nav
            aria-label="Account"
            className="mt-1 border-t border-slate-900/10 pt-1 dark:border-white/10"
          >
            <ul>
              {MENU_LINKS.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <MenuLink
                    to={to}
                    icon={Icon}
                    onNavigate={() => setOpen(false)}
                  >
                    {label}
                  </MenuLink>
                </li>
              ))}
              {isAdmin && (
                <li>
                  <MenuLink
                    to="/review"
                    icon={ClipboardCheck}
                    onNavigate={() => setOpen(false)}
                  >
                    Review queue
                  </MenuLink>
                </li>
              )}
            </ul>
          </nav>

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
      {welcomeFor === user.uid && (
        <Suspense fallback={null}>
          <WelcomeGate
            uid={user.uid}
            suggestedName={user.displayName}
            avatarUrl={user.avatarUrl}
          />
        </Suspense>
      )}
    </>
  )
}

function MenuLink({
  to,
  icon: Icon,
  onNavigate,
  children,
}: {
  to: string
  icon: LucideIcon
  onNavigate: () => void
  children: string
}) {
  const { location } = useRoute()
  const current = location.pathname === to
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-slate-900/5 dark:hover:bg-white/10',
        current
          ? 'font-medium text-teal-700 dark:text-teal-300'
          : 'text-slate-700 dark:text-slate-200',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </Link>
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
