import {
  createContext,
  lazy,
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthService, AuthUser } from '@/lib/auth'
import { loadAuthService } from './loadAuthService'
import { hasSessionHint, setSessionHint } from './session'

// The dialog is its own chunk: a visitor who never opens it downloads neither
// the form nor Firebase.
const SignInDialog = lazy(() => import('@/components/auth/SignInDialog'))

/** How long a remembered session may take to restore before we show "Sign in". */
const RESTORE_TIMEOUT_MS = 8000

/**
 * - `signed-out`: no user.
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
  /** Signed in with email and the address is not confirmed yet. */
  needsEmailVerification: boolean
  dialog: (OpenSignInOptions & { open: true }) | null
  /** Ask for sign-in. Call this only when the user tries an action that needs it. */
  openSignIn: (options?: OpenSignInOptions) => void
  closeSignIn: () => void
  /** Resolves the service and starts downloading Firebase, without opening anything. */
  prepare: () => Promise<AuthService>
  signInWithGoogle: () => Promise<AuthUser>
  signInWithEmail: (email: string, password: string) => Promise<AuthUser>
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<AuthUser>
  sendPasswordReset: (email: string) => Promise<void>
  /** Reloads the user after they follow the verification link. */
  refreshUser: () => Promise<AuthUser | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    hasSessionHint() ? 'restoring' : 'signed-out',
  )
  const [user, setUser] = useState<AuthUser | null>(null)
  const [dialog, setDialog] = useState<AuthContextValue['dialog']>(null)

  // Subscribe once. For a visitor with no remembered session this loads no
  // Firebase code: the service reports "signed out" from memory.
  useEffect(() => {
    let active = true
    let subscribing = true
    let unsubscribe: (() => void) | undefined
    const restoring = hasSessionHint()
    const timer = restoring
      ? window.setTimeout(() => {
          if (!active) return
          setStatus((current) =>
            current === 'restoring' ? 'signed-out' : current,
          )
        }, RESTORE_TIMEOUT_MS)
      : undefined

    loadAuthService()
      .then(({ service }) => {
        if (!active) return
        unsubscribe = service.onAuthChange((next) => {
          // The service answers "null" immediately on subscribe, before a
          // remembered session has been restored. Wait for the real answer.
          if (subscribing && restoring && next === null) return
          window.clearTimeout(timer)
          setUser(next)
          setStatus(next ? 'signed-in' : 'signed-out')
          setSessionHint(next !== null)
        })
        subscribing = false
      })
      .catch(() => {
        if (!active) return
        setSessionHint(false)
        setStatus('signed-out')
      })

    return () => {
      active = false
      window.clearTimeout(timer)
      unsubscribe?.()
    }
  }, [])

  const prepare = useCallback(async () => {
    const { service } = await loadAuthService()
    if (import.meta.env.VITE_AUTH_STUB !== '1') {
      // Warm the Firebase Auth chunk so the Google window can open straight
      // from the click instead of after a download, which pop-up blockers punish.
      void import('@/lib/firebaseAuth').catch(() => {})
    }
    return service
  }, [])

  const openSignIn = useCallback((options: OpenSignInOptions = {}) => {
    setDialog({ open: true, ...options })
  }, [])
  const closeSignIn = useCallback(() => setDialog(null), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      needsEmailVerification: user !== null && !user.emailVerified,
      dialog,
      openSignIn,
      closeSignIn,
      prepare,
      signInWithGoogle: async () => (await prepare()).signInWithGoogle(),
      signInWithEmail: async (email, password) =>
        (await prepare()).signInWithEmail(email, password),
      signUpWithEmail: async (email, password, displayName) =>
        (await prepare()).signUpWithEmail(email, password, displayName),
      sendPasswordReset: async (email) =>
        (await prepare()).sendPasswordReset(email),
      refreshUser: async () => (await loadAuthService()).refreshUser(),
      signOut: async () => {
        await (await loadAuthService()).service.signOut()
        setSessionHint(false)
      },
    }),
    [status, user, dialog, openSignIn, closeSignIn, prepare],
  )

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
