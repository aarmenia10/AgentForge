import type { AuthService } from '@/lib/auth'
import { AuthUnavailableError } from './authErrors'

let pending: Promise<AuthService> | null = null

/**
 * Loads the sign-in implementation on demand. Nothing here is imported by the
 * page at startup, so Firebase never downloads for a visitor who does not open
 * the sign-in dialog. Concurrent callers share one load; a failed load can be
 * retried.
 */
export function loadAuthService(): Promise<AuthService> {
  if (!pending) {
    pending = importService().catch((error: unknown) => {
      pending = null
      throw error
    })
  }
  return pending
}

async function importService(): Promise<AuthService> {
  // Local verification only. Vite replaces the flag at build time, so the stub
  // is dropped from every build that does not set VITE_AUTH_STUB=1.
  if (import.meta.env.VITE_AUTH_STUB === '1') {
    const { createStubAuthService } = await import('./stubAuthService')
    return createStubAuthService()
  }
  const mod: { authService?: AuthService } = await import('@/lib/auth')
  if (!mod.authService) throw new AuthUnavailableError()
  return mod.authService
}
