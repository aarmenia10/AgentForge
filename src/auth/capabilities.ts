import type { AuthService, AuthUser } from '@/lib/auth'

/**
 * Fields the UI uses when the service provides them. `AuthUser` and
 * `AuthService` in src/lib/auth.ts do not declare these yet; reading them
 * optionally keeps the UI correct before and after they are added.
 */
export type AuthUserWithVerification = AuthUser & { emailVerified?: boolean }
export type AuthServiceWithVerification = AuthService & {
  sendEmailVerification?: () => Promise<void>
}

export function readEmailVerified(user: AuthUser): boolean | undefined {
  const value = (user as AuthUserWithVerification).emailVerified
  return typeof value === 'boolean' ? value : undefined
}
