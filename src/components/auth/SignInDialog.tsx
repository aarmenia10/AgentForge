import { Eye, EyeOff, Loader2, MailCheck, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useAuth, type SignInMode } from '@/auth/AuthProvider'
import {
  describeAuthError,
  isUserCancellation,
  type AuthAction,
} from '@/auth/authErrors'
import { cn } from '../ui'

type View = SignInMode | 'verify-sent' | 'reset-sent'

const TITLES: Record<View, string> = {
  'sign-in': 'Sign in to AgentForge',
  'sign-up': 'Create your account',
  reset: 'Reset your password',
  'verify-sent': 'Check your email',
  'reset-sent': 'Check your email',
}

const MIN_PASSWORD = 6

type FieldErrors = Partial<Record<'name' | 'email' | 'password', string>>

/** Sign-in, sign-up, and password reset. Mounted by AuthProvider only while open. */
export default function SignInDialog() {
  const auth = useAuth()
  const { closeSignIn, prepare } = auth
  const [view, setView] = useState<View>(auth.dialog?.mode ?? 'sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<AuthAction | null>(null)
  const [serviceState, setServiceState] = useState<
    'loading' | 'ready' | 'failed'
  >('loading')
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const ids = { name: useId(), email: useId(), password: useId() }

  // Lock page scroll, move focus in, and restore both on close.
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

  // Load the service as soon as the dialog opens, so the Google button can open
  // its window straight from the click.
  useEffect(() => {
    let cancelled = false
    prepare()
      .then(() => !cancelled && setServiceState('ready'))
      .catch(() => {
        if (cancelled) return
        setServiceState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [prepare])

  function go(next: View) {
    setView(next)
    setFieldErrors({})
    setFormError(null)
    setShowPassword(false)
    // The control that triggered the switch unmounts; keep focus in the dialog.
    requestAnimationFrame(() => dialogRef.current?.focus())
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      closeSignIn()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
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

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (view === 'sign-up' && !name.trim())
      errors.name = 'Enter the name to show on your profile.'
    if (!email.trim()) errors.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors.email = 'Enter a valid email address.'
    if (view !== 'reset') {
      if (!password) errors.password = 'Enter your password.'
      else if (view === 'sign-up' && password.length < MIN_PASSWORD)
        errors.password = `Use at least ${MIN_PASSWORD} characters.`
    }
    return errors
  }

  async function run(action: AuthAction, task: () => Promise<void>) {
    setBusy(action)
    setFormError(null)
    try {
      await task()
    } catch (error) {
      if (!isUserCancellation(error))
        setFormError(describeAuthError(error, action))
    } finally {
      setBusy(null)
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstInvalid = (['name', 'email', 'password'] as const).find(
        (key) => errors[key],
      )
      if (firstInvalid) document.getElementById(ids[firstInvalid])?.focus()
      return
    }
    const address = email.trim()
    if (view === 'sign-in') {
      await run('sign-in', async () => {
        await auth.signInWithEmail(address, password)
        closeSignIn()
      })
    } else if (view === 'sign-up') {
      await run('sign-up', async () => {
        await auth.signUpWithEmail(address, password, name.trim())
        go('verify-sent')
      })
    } else if (view === 'reset') {
      await run('reset', async () => {
        await auth.sendPasswordReset(address)
        go('reset-sent')
      })
    }
  }

  function onGoogle() {
    if (busy) return
    void run('google', async () => {
      await auth.signInWithGoogle()
      closeSignIn()
    })
  }

  // Busy controls stay focusable (aria-disabled, readOnly) so keyboard focus and
  // Escape keep working while a request is in flight.
  const isBusy = busy !== null
  const isForm = view === 'sign-in' || view === 'sign-up' || view === 'reset'
  const loadMessage =
    serviceState === 'failed' ? describeAuthError(null, 'load') : null
  const shownError = formError ?? loadMessage

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
        onClick={closeSignIn}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className="glass-strong relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl px-5 pb-6 pt-5 focus:outline-none sm:rounded-3xl sm:px-7 sm:pb-7 sm:pt-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
            {TITLES[view]}
          </h2>
          <button
            type="button"
            onClick={closeSignIn}
            aria-label="Close"
            className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          id={descId}
          className="mt-1.5 text-sm text-slate-600 dark:text-slate-300"
        >
          {view === 'verify-sent' ? (
            <VerifySent email={email.trim()} />
          ) : view === 'reset-sent' ? (
            <p>
              If an account exists for{' '}
              <strong className="font-medium text-slate-900 dark:text-white">
                {email.trim()}
              </strong>
              , a link to reset the password is on its way. Check your spam
              folder if it does not arrive in a few minutes.
            </p>
          ) : view === 'reset' ? (
            <p>
              Enter the email you signed up with and we will send you a reset
              link.
            </p>
          ) : (
            <p>
              {auth.dialog?.reason ? `${auth.dialog.reason} ` : ''}
              You do not need an account to browse or install agents.
            </p>
          )}
        </div>

        {shownError && isForm && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200"
          >
            {shownError}
          </p>
        )}

        {isForm && view !== 'reset' && (
          <>
            <button
              type="button"
              onClick={onGoogle}
              disabled={serviceState !== 'ready'}
              aria-disabled={isBusy || undefined}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white/80 px-5 text-sm font-medium text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10 aria-disabled:cursor-wait aria-disabled:opacity-70"
            >
              {busy === 'google' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <GoogleMark />
              )}
              Continue with Google
            </button>

            <div
              className="my-5 flex items-center gap-3 text-xs text-slate-400"
              aria-hidden="true"
            >
              <span className="h-px flex-1 bg-slate-900/10 dark:bg-white/10" />
              or
              <span className="h-px flex-1 bg-slate-900/10 dark:bg-white/10" />
            </div>
          </>
        )}

        {isForm && (
          <form
            noValidate
            onSubmit={onSubmit}
            className={cn('space-y-4', view === 'reset' && 'mt-6')}
          >
            {view === 'sign-up' && (
              <Field id={ids.name} label="Name" error={fieldErrors.name}>
                <input
                  id={ids.name}
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  readOnly={isBusy}
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={
                    fieldErrors.name ? `${ids.name}-error` : undefined
                  }
                  className={inputClass(fieldErrors.name)}
                />
              </Field>
            )}

            <Field id={ids.email} label="Email" error={fieldErrors.email}>
              <input
                id={ids.email}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                readOnly={isBusy}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={
                  fieldErrors.email ? `${ids.email}-error` : undefined
                }
                className={inputClass(fieldErrors.email)}
              />
            </Field>

            {view !== 'reset' && (
              <Field
                id={ids.password}
                label="Password"
                error={fieldErrors.password}
                hint={
                  view === 'sign-up'
                    ? `At least ${MIN_PASSWORD} characters.`
                    : undefined
                }
                action={
                  view === 'sign-in' ? (
                    <button
                      type="button"
                      onClick={() => go('reset')}
                      className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-300"
                    >
                      Forgot password?
                    </button>
                  ) : undefined
                }
              >
                <div className="relative">
                  <input
                    id={ids.password}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      view === 'sign-up' ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    readOnly={isBusy}
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={
                      [
                        fieldErrors.password && `${ids.password}-error`,
                        view === 'sign-up' && `${ids.password}-hint`,
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    className={cn(inputClass(fieldErrors.password), 'pr-11')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </Field>
            )}

            <button
              type="submit"
              aria-disabled={isBusy || undefined}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-wait aria-disabled:opacity-70"
            >
              {busy && busy !== 'google' && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {view === 'sign-in'
                ? busy === 'sign-in'
                  ? 'Signing in'
                  : 'Sign in'
                : view === 'sign-up'
                  ? busy === 'sign-up'
                    ? 'Creating account'
                    : 'Create account'
                  : busy === 'reset'
                    ? 'Sending link'
                    : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
          {view === 'sign-in' && (
            <p>
              New to AgentForge?{' '}
              <TextButton onClick={() => go('sign-up')}>
                Create an account
              </TextButton>
            </p>
          )}
          {view === 'sign-up' && (
            <p>
              Already have an account?{' '}
              <TextButton onClick={() => go('sign-in')}>Sign in</TextButton>
            </p>
          )}
          {(view === 'reset' || view === 'reset-sent') && (
            <p>
              <TextButton onClick={() => go('sign-in')}>
                Back to sign in
              </TextButton>
            </p>
          )}
          {view === 'verify-sent' && (
            <button
              type="button"
              onClick={closeSignIn}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition hover:bg-teal-600"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function VerifySent({ email }: { email: string }) {
  return (
    <div className="mt-3 flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
      <MailCheck
        className="mt-0.5 size-5 shrink-0 text-teal-500"
        aria-hidden="true"
      />
      <div className="space-y-2">
        <p>
          We sent a verification link to{' '}
          <strong className="font-medium text-slate-900 dark:text-white">
            {email}
          </strong>
          . Open it to confirm your address.
        </p>
        <p>
          You are signed in and can keep browsing. Publishing and friend
          requests unlock once your email is verified.
        </p>
      </div>
    </div>
  )
}

function inputClass(error: string | undefined) {
  return cn(
    'h-11 w-full rounded-xl border bg-white/70 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none disabled:opacity-60 dark:bg-white/5 dark:text-slate-100',
    error
      ? 'border-rose-500 dark:border-rose-400'
      : 'border-slate-200 dark:border-white/10',
  )
}

function Field({
  id,
  label,
  error,
  hint,
  action,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-sm font-medium text-slate-800 dark:text-slate-100"
        >
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && !error && (
        <p
          id={`${id}-hint`}
          className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="mt-1.5 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function TextButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-teal-700 hover:underline dark:text-teal-300"
    >
      {children}
    </button>
  )
}

/** Google's "G" mark, inlined in its brand colors. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}
