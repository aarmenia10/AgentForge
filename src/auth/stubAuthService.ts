import type { AuthService, AuthUser } from '@/lib/auth'
import type { LoadedAuth } from './loadAuthService'

/**
 * In-memory AuthService for local verification while the Firebase providers
 * are not enabled. Loaded only when the build sets VITE_AUTH_STUB=1; it is
 * absent from production bundles.
 *
 * Scripted failures:
 * - password `wrong-password` signs in with `auth/invalid-credential`
 * - sign-up with `taken@example.com` fails with `auth/email-already-in-use`
 * - sign-up with a password under 6 characters fails with `auth/weak-password`
 * - `refreshUser` marks the current user verified, as if they followed the link
 */
const STORAGE_KEY = 'agentforge:stub-user'

function fail(code: string): never {
  throw Object.assign(new Error(code), { code })
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 350))

let instance: LoadedAuth | null = null

export function getStubAuth(): LoadedAuth {
  instance ??= createStubAuth()
  return instance
}

function createStubAuth(): LoadedAuth {
  const listeners = new Set<(user: AuthUser | null) => void>()
  let current: AuthUser | null = read()

  function read(): AuthUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as AuthUser) : null
    } catch {
      return null
    }
  }

  function set(user: AuthUser | null) {
    current = user
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(STORAGE_KEY)
    listeners.forEach((listener) => listener(user))
  }

  function emailUser(email: string, displayName: string, verified: boolean) {
    return {
      uid: `stub-${email}`,
      displayName,
      email,
      avatarUrl: null,
      emailVerified: verified,
    }
  }

  const service: AuthService = {
    async signInWithGoogle() {
      await pause()
      const user = {
        uid: 'stub-google',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        avatarUrl: null,
        emailVerified: true,
      }
      set(user)
      return user
    },
    async signInWithEmail(email, password) {
      await pause()
      if (password === 'wrong-password') fail('auth/invalid-credential')
      const user = emailUser(
        email,
        email.split('@')[0],
        email.startsWith('verified'),
      )
      set(user)
      return user
    },
    async signUpWithEmail(email, password, displayName) {
      await pause()
      if (email === 'taken@example.com') fail('auth/email-already-in-use')
      if (password.length < 6) fail('auth/weak-password')
      const user = emailUser(email, displayName, false)
      set(user)
      return user
    },
    async sendPasswordReset() {
      await pause()
    },
    async signOut() {
      await pause()
      set(null)
    },
    onAuthChange(listener) {
      listeners.add(listener)
      listener(current)
      return () => listeners.delete(listener)
    },
  }
  return {
    service,
    async refreshUser() {
      await pause()
      if (current) set({ ...current, emailVerified: true })
      return current
    },
  }
}
