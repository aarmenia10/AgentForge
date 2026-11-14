import {
  createContext,
  lazy,
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AuthService, AuthUser } from '@/lib/auth'
import {
  readEmailVerified,
  type AuthServiceWithVerification,
} from './capabilities'
import { loadAuthService } from './loadAuthService'
import { hasSessionHint, setSessionHint } from './session'

// The dialog is its own chunk too: a visitor who never opens it downloads neither
// the form nor Firebase.
const SignInDialog = lazy(() => import('@/components/auth/SignInDialog'))

/**
 * - `signed-out`: no user. Firebase may not even be loaded.
 * - `restoring`: this browser had a session; waiting for Firebase to confirm it.
 * - `signed-in`: `user` is set.
 */
export type AuthStatus = 'signed-out' | 'restoring' | 'signed-in'
export type SignInMode = 'sign-in' | 'sign-up' | 'reset'

export interface OpenSignInOptions {
  mode?: SignInMode
  /** One line shown at the top of the dialog, e.g. "Sign in to publish an agent." */
  reason?: string
}

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** True when the account signed up with email and has not confirmed the address yet. */
  needsEmailVerification: boolean
  /** Present only when the service can resend the verification email. */
  resendVerification: (() => Promise<void>) | null
  dialog: (OpenSignInOptions & { open: true }) | null
  openSignIn: (options?: OpenSignInOptions) => void
  closeSignIn: () => void
  /** Starts loading the service (and Firebase) without opening anything. */
  prepare: () => Promise<AuthService>
  signInWithGoogle: () => Promise<AuthUser>
  signInWithEmail: (email: string, password: string) => Promise<AuthUser>
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<AuthUser>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    hasSessionHint() ? 'restoring' : 'signed-out',
  )
  const [user, setUser] = useState<AuthUser | null>(null)
  const [service, setService] = useState<AuthServiceWithVerification | null>(
    null,
  )
  const [signedUpUid, setSignedUpUid] = useState<string | null>(null)
  const [dialog, setDialog] = useState<AuthContextValue['dialog']>(null)
  const unsubscribe = useRef<(() => void) | null>(null)

  const prepare = useCallback(async () => {
    const loaded = await loadAuthService()
    if (!unsubscribe.current) {
      unsubscribe.current = loaded.onAuthChange((next) => {
        setUser(next)
        setStatus(next ? 'signed-in' : 'signed-out')
        setSessionHint(next !== null)
      })
      setService(loaded)
    }
    return loaded
  }, [])

  // Restore a returning user's session. First-time visitors skip this entirely.
  useEffect(() => {
    if (!hasSessionHint()) return
    prepare().catch(() => {
      setSessionHint(false)
      setStatus('signed-out')
    })
  }, [prepare])

  useEffect(
    () => () => {
      unsubscribe.current?.()
      unsubscribe.current = null
    },
    [],
  )

  const openSignIn = useCallback((options: OpenSignInOptions = {}) => {
    setDialog({ open: true, ...options })
  }, [])
  const closeSignIn = useCallback(() => setDialog(null), [])

  const value = useMemo<AuthContextValue>(() => {
    const verified = user ? readEmailVerified(user) : undefined
    // Without an `emailVerified` field from the service, the only account known
    // to be unverified is one created in this tab.
    const needsEmailVerification =
      user !== null &&
      (verified === false ||
        (verified === undefined && user.uid === signedUpUid))
    const resend = service?.sendEmailVerification?.bind(service) ?? null
    return {
      status,
      user,
      needsEmailVerification,
      resendVerification: resend,
      dialog,
      openSignIn,
      closeSignIn,
      prepare,
      signInWithGoogle: async () => (await prepare()).signInWithGoogle(),
      signInWithEmail: async (email, password) =>
        (await prepare()).signInWithEmail(email, password),
      signUpWithEmail: async (email, password, displayName) => {
        const created = await (
          await prepare()
        ).signUpWithEmail(email, password, displayName)
        setSignedUpUid(created.uid)
        return created
      },
      sendPasswordReset: async (email) =>
        (await prepare()).sendPasswordReset(email),
      signOut: async () => {
        await (await prepare()).signOut()
        setSessionHint(false)
      },
    }
  }, [
    status,
    user,
    signedUpUid,
    service,
    dialog,
    openSignIn,
    closeSignIn,
    prepare,
  ])

  return (
    <AuthContext value={value}>
      {children}
      {dialog && (
        <Suspense fallback={null}>
          <SignInDialog />
        </Suspense>
      )}
    </AuthContext>
  )
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
