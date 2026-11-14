import {
  authService,
  refreshAuthUser,
  type AuthService,
  type AuthUser,
} from '@/lib/auth'

export interface LoadedAuth {
  service: AuthService
  /** Reloads the user, e.g. after they follow the email verification link. */
  refreshUser: () => Promise<AuthUser | null>
}

let pending: Promise<LoadedAuth> | null = null

/**
 * Resolves the sign-in implementation. `src/lib/auth.ts` is small and imports
 * Firebase only through its own dynamic `import()`, so holding a reference to
 * it here costs a signed-out visitor nothing. Firebase downloads when a sign-in
 * method is called, or on page load only for a browser that had a session.
 */
export function loadAuthService(): Promise<LoadedAuth> {
  if (!pending) {
    pending = importService().catch((error: unknown) => {
      pending = null
      throw error
    })
  }
  return pending
}

async function importService(): Promise<LoadedAuth> {
  // Local verification only. Vite replaces the flag at build time, so the stub
  // is dropped from every build that does not set VITE_AUTH_STUB=1.
  if (import.meta.env.VITE_AUTH_STUB === '1') {
    const { getStubAuth } = await import('./stubAuthService')
    return getStubAuth()
  }
  return { service: authService, refreshUser: refreshAuthUser }
}
