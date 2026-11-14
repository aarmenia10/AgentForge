/**
 * Plain-English messages for sign-in failures. Firebase errors carry a `code`
 * such as `auth/invalid-credential`; anything without a known code gets a
 * generic message so raw SDK text never reaches the page.
 */
export type AuthAction =
  'google' | 'sign-in' | 'sign-up' | 'reset' | 'sign-out' | 'load'

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'That email and password do not match an account.',
  'auth/wrong-password': 'That email and password do not match an account.',
  'auth/user-not-found': 'That email and password do not match an account.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/email-already-in-use':
    'An account already uses this email. Sign in instead, or reset your password.',
  'auth/weak-password': 'Choose a longer password: at least 6 characters.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests':
    'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed':
    'Could not reach the sign-in service. Check your connection.',
  'auth/popup-blocked':
    'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user':
    'The Google window was closed before sign-in finished.',
  'auth/cancelled-popup-request':
    'The Google window was closed before sign-in finished.',
  'auth/account-exists-with-different-credential':
    'This email is already registered with a password. Sign in with email and password instead.',
  'auth/operation-not-allowed':
    'This sign-in method is not switched on yet. Try again later.',
  'auth/unauthorized-domain': 'Sign-in is not set up for this web address yet.',
  'auth/unavailable':
    'Sign-in is not switched on yet. Browsing and installing agents work without an account.',
}

const FALLBACK: Record<AuthAction, string> = {
  google: 'Google sign-in did not finish. Try again.',
  'sign-in': 'Sign-in did not finish. Try again.',
  'sign-up': 'Could not create the account. Try again.',
  reset: 'Could not send the reset email. Try again.',
  'sign-out': 'Could not sign out. Try again.',
  load: 'Could not load sign-in. Check your connection and try again.',
}

export function authErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown }
    if (typeof code === 'string') return code
  }
  return null
}

export function describeAuthError(error: unknown, action: AuthAction): string {
  const code = authErrorCode(error)
  return (code && MESSAGES[code]) || FALLBACK[action]
}

/** The user dismissed Google sign-in on purpose. Not worth an error banner. */
export function isUserCancellation(error: unknown): boolean {
  const code = authErrorCode(error)
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  )
}

/** Thrown by the loader when `src/lib/auth.ts` exports no `authService` yet. */
export class AuthUnavailableError extends Error {
  readonly code = 'auth/unavailable'
  constructor() {
    super('No AuthService implementation is exported from src/lib/auth.ts')
  }
}
