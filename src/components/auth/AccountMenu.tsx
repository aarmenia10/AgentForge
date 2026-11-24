import { LogOut, MailWarning, Menu } from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { describeAuthError } from '@/auth/authErrors'
import { isDemoFounder } from '@/lib/demoRequest'
import { useRoute } from '@/router/Router'
import { Sidebar } from '../nav/Sidebar'
import { SidebarList } from '../nav/SidebarList'
import { accountItems, siteItems, visitorItems } from '../nav/sidebarItems'
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

const buttonClass =
  'h-10 items-center justify-center rounded-full text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]'

/**
 * The far-right slot of the top bar. Signed out: a "Sign in" button (and, on a
 * phone, a menu icon that opens the sidebar). Signed in: the profile picture,
 * which opens the account sidebar. Signed-out visitors are never blocked from
 * anything; this is the only place sign-in is offered until a user tries to
 * publish, star, or add a friend.
 */
export function AccountMenu() {
  const auth = useAuth()

  if (auth.status === 'restoring') {
    // Holds the slot while a returning session is confirmed, so the bar does not jump.
    return <span className="size-10" aria-hidden="true" />
  }

  if (auth.status === 'signed-out' || !auth.user) return <VisitorControl />

  // Keyed so a different account starts with fresh sidebar state.
  return <SignedInControl key={auth.user.uid} />
}

/** Signed out. md and up: "Sign in". Below md: a menu icon and its sidebar. */
function VisitorControl() {
  const { openSignIn } = useAuth()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const dismiss = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => openSignIn()}
        className={cn(
          buttonClass,
          'hidden bg-accent px-5 font-semibold text-accent-ink hover:opacity-90 md:inline-flex',
        )}
      >
        Sign in
      </button>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(true)}
        className={cn(
          buttonClass,
          'inline-flex size-10 bg-surface text-fg hover:bg-surface-2 md:hidden',
        )}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <Sidebar id={panelId} open={open} onDismiss={dismiss} title="Menu">
        <SidebarList
          label="Site"
          items={visitorItems()}
          onNavigate={() => setOpen(false)}
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            openSignIn()
          }}
          className={cn(
            buttonClass,
            'mt-5 flex w-full bg-accent font-semibold text-accent-ink hover:opacity-90',
          )}
        >
          Sign in
        </button>
      </Sidebar>
    </>
  )
}

function SignedInControl() {
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
  const founder = isDemoFounder(user)
  const [newCount, setNewCount] = useState<number | null>(null)
  useEffect(() => {
    if (!founder) return
    let active = true
    let stop: (() => void) | undefined
    void import('@/services/demoRequests')
      .then(({ watchDemoRequests }) => {
        if (!active) return
        stop = watchDemoRequests(
          (requests) => {
            if (active)
              setNewCount(requests.filter((r) => r.status === 'New').length)
          },
          () => {
            if (active) setNewCount(null)
          },
        )
      })
      .catch(() => {
        if (active) setNewCount(null)
      })
    return () => {
      active = false
      stop?.()
    }
  }, [founder])
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    'idle',
  )
  const [welcomeFor, setWelcomeFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState<'idle' | 'checking' | 'not-yet'>(
    'idle',
  )
  const [signingOut, setSigningOut] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const dismiss = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])

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

  const items = accountItems({ isAdmin, founder, newDemoRequests: newCount })
  const reminderLink =
    'text-xs font-semibold underline underline-offset-2 aria-disabled:opacity-70'

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account: ${label}${needsEmailVerification ? ', email not verified' : ''}`}
        onClick={() => setOpen(true)}
        className="relative size-10 shrink-0 rounded-full transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]"
      >
        <Avatar name={label} url={user.avatarUrl} />
        {needsEmailVerification && (
          <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-amber-500 ring-2 ring-[var(--lm-bg)]" />
        )}
      </button>

      <Sidebar id={panelId} open={open} onDismiss={dismiss} title="Account">
        <div className="px-3.5 pb-3 pt-1">
          <p className="truncate text-sm font-semibold">
            {user.displayName || 'Your account'}
          </p>
          <p className="truncate text-xs text-fg-muted">{user.email}</p>
        </div>

        {needsEmailVerification && (
          <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-900 dark:text-amber-100">
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
                className={reminderLink}
              >
                {checking === 'checking' ? 'Checking' : 'I have confirmed it'}
              </button>
              <button
                type="button"
                onClick={onResend}
                aria-disabled={resend === 'sending' || undefined}
                className={reminderLink}
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
            className="mx-3.5 mb-2 text-xs text-rose-700 dark:text-rose-300"
          >
            {error}
          </p>
        )}

        {/* On a phone the top bar has no room for these four. */}
        <div className="mb-3 border-b border-line pb-3 md:hidden">
          <SidebarList
            label="Site"
            items={siteItems()}
            onNavigate={() => setOpen(false)}
          />
        </div>

        <SidebarList
          label="Account"
          items={items}
          onNavigate={() => setOpen(false)}
        />

        <div className="mt-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={onSignOut}
            aria-disabled={signingOut || undefined}
            className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3.5 text-left text-sm font-medium text-fg transition hover:bg-surface-2 aria-disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </Sidebar>
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

/** The user's photo, or a circle with their first initial. */
function Avatar({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-10 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-10 place-items-center rounded-full bg-accent text-base font-semibold uppercase text-accent-ink"
    >
      {name.trim().charAt(0) || '?'}
    </span>
  )
}
